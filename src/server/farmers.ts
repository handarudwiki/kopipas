import { z } from "zod";
import type { Point, Polygon } from "geojson";
import { prisma } from "@/lib/db";
import type { Ctx } from "@/lib/context";
import { badRequest, notFound, unprocessable } from "@/lib/errors";
import { areaHa, centroidOf, GeoError, normalizePoint, normalizePolygon } from "@/lib/geo";
import { parseSettings } from "@/lib/settings";
import { putObject, safeFileName } from "@/lib/storage";
import { randomToken } from "@/lib/crypto";

export const DEFAULT_CONSENT_SCOPE =
  "Data petani, lokasi kebun, dan bukti legalitas lahan dibagikan kepada pembeli/importir UE hanya melalui paket bukti EUDR yang disetujui admin (UU 27/2022 PDP).";

// ------------------------------------------------------------------ farmers (F2.1)

export const farmerSchema = z.object({
  clientId: z.string().max(80).nullish(),
  fullName: z.string().trim().min(2).max(160),
  village: z.string().trim().min(1).max(120),
  district: z.string().trim().min(1).max(120),
  regency: z.string().trim().min(1).max(120),
  province: z.string().trim().min(1).max(120),
  phone: z.string().trim().max(40).nullish(),
  consent: z.literal(true, { error: "Persetujuan berbagi data wajib dicentang" }),
  consentAt: z.coerce.date().nullish(),
  consentScope: z.string().trim().min(10).max(1000).nullish(),
});

export async function listFarmers(ctx: Ctx, q: { search?: string } = {}) {
  return prisma.farmer.findMany({
    where: {
      orgId: ctx.orgId,
      ...(q.search ? { OR: [{ fullName: { contains: q.search, mode: "insensitive" } }, { village: { contains: q.search, mode: "insensitive" } }] } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: { plots: { select: { id: true, riskStatus: true, declaredAreaHa: true, computedAreaHa: true } }, _count: { select: { purchases: true } } },
  });
}

export async function createFarmer(ctx: Ctx, input: unknown) {
  const { consent, consentAt, consentScope, ...data } = farmerSchema.parse(input);
  void consent;
  return prisma.farmer.create({
    data: {
      ...data,
      clientId: data.clientId ?? null,
      consentAt: consentAt ?? new Date(),
      consentScope: consentScope ?? DEFAULT_CONSENT_SCOPE,
      orgId: ctx.orgId,
      createdBy: ctx.userId,
    },
  });
}

export async function getFarmer(ctx: Ctx, id: string) {
  const f = await prisma.farmer.findFirst({
    where: { id, orgId: ctx.orgId },
    include: {
      plots: { orderBy: { createdAt: "asc" }, include: { evidence: true } },
      purchases: { orderBy: { date: "desc" }, take: 50, include: { plot: { select: { label: true } } } },
    },
  });
  if (!f) throw notFound("Petani tidak ditemukan");
  return f;
}

export async function updateFarmer(ctx: Ctx, id: string, input: unknown) {
  await getFarmer(ctx, id);
  const data = farmerSchema.omit({ consent: true, clientId: true }).partial().parse(input);
  return prisma.farmer.update({ where: { id }, data: { ...data, consentScope: data.consentScope ?? undefined, consentAt: data.consentAt ?? undefined } });
}

// ------------------------------------------------------------------ plots (F2.2–F2.4)

export const plotSchema = z.object({
  clientId: z.string().max(80).nullish(),
  farmerId: z.string().uuid(),
  label: z.string().trim().max(120).nullish(),
  declaredAreaHa: z.coerce.number().positive("Luas harus > 0").max(10_000),
  point: z.unknown().nullish(),
  polygon: z.unknown().nullish(),
  gpsAccuracyM: z.coerce.number().min(0).nullish(),
  capturedAt: z.coerce.date().nullish(),
});

type PlotGeom = { geomPoint: Point | null; geomPolygon: Polygon | null; computedAreaHa: number | null };

/** Validates geometry + area rules and returns normalised columns. Throws 422 with a clear reason. */
export async function validatePlotGeometry(
  orgId: string,
  input: { point?: unknown; polygon?: unknown; declaredAreaHa: number; gpsAccuracyM?: number | null },
): Promise<PlotGeom> {
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
  const rules = parseSettings(org.settings).risk;
  let geomPoint: Point | null = null;
  let geomPolygon: Polygon | null = null;
  try {
    if (input.polygon) geomPolygon = normalizePolygon(input.polygon);
    if (input.point) geomPoint = normalizePoint(input.point);
  } catch (e) {
    if (e instanceof GeoError) throw unprocessable(e.message);
    throw e;
  }
  if (!geomPoint && !geomPolygon) throw unprocessable("Kebun wajib punya titik GPS atau poligon");
  // F2.2 — reject GPS fixes worse than the configured accuracy
  if (input.gpsAccuracyM != null && input.gpsAccuracyM > rules.maxGpsAccuracyM) {
    throw unprocessable(`Akurasi GPS ${input.gpsAccuracyM} m melebihi batas ${rules.maxGpsAccuracyM} m; ulangi pengambilan titik`);
  }
  // F2.4 — polygon required above the area threshold
  if (input.declaredAreaHa > rules.polygonRequiredAboveHa && !geomPolygon) {
    throw unprocessable(`Kebun > ${rules.polygonRequiredAboveHa} ha wajib dipetakan sebagai poligon`);
  }
  if (geomPolygon && !geomPoint) geomPoint = centroidOf(geomPolygon);
  return { geomPoint, geomPolygon, computedAreaHa: geomPolygon ? areaHa(geomPolygon) : null };
}

/** Hooks fired after a plot's geometry is created/changed (M3 registers the risk check). */
type GeometryHook = (orgId: string, plotId: string, actorId: string | null) => Promise<unknown>;
const geometryHooks: GeometryHook[] = [];
export const onPlotGeometryChanged = (h: GeometryHook) => geometryHooks.push(h);
export async function fireGeometryChanged(orgId: string, plotId: string, actorId: string | null) {
  for (const h of geometryHooks) await h(orgId, plotId, actorId);
}

export async function createPlot(ctx: Ctx, input: unknown) {
  const data = plotSchema.parse(input);
  const farmer = await prisma.farmer.findFirst({ where: { id: data.farmerId, orgId: ctx.orgId } });
  if (!farmer) throw notFound("Petani tidak ditemukan");
  const geom = await validatePlotGeometry(ctx.orgId, { ...data, declaredAreaHa: data.declaredAreaHa });
  const plot = await prisma.plot.create({
    data: {
      orgId: ctx.orgId, clientId: data.clientId ?? null, farmerId: farmer.id, label: data.label ?? null,
      declaredAreaHa: data.declaredAreaHa, computedAreaHa: geom.computedAreaHa,
      geomPoint: (geom.geomPoint ?? undefined) as object | undefined, geomPolygon: (geom.geomPolygon ?? undefined) as object | undefined,
      gpsAccuracyM: data.gpsAccuracyM ?? null, capturedAt: data.capturedAt ?? new Date(), capturedBy: ctx.userId, createdBy: ctx.userId,
    },
  });
  await fireGeometryChanged(ctx.orgId, plot.id, ctx.userId);
  return plot;
}

export async function listPlots(ctx: Ctx, q: { risk?: string; farmerId?: string } = {}) {
  return prisma.plot.findMany({
    where: { orgId: ctx.orgId, ...(q.risk ? { riskStatus: q.risk as "PASS" } : {}), ...(q.farmerId ? { farmerId: q.farmerId } : {}) },
    orderBy: { createdAt: "desc" },
    include: {
      farmer: { select: { id: true, fullName: true, village: true, regency: true } },
      evidence: { select: { type: true, photoKeys: true } },
      riskChecks: { orderBy: { createdAt: "desc" }, take: 1, select: { forestPct2020: true, datasetVersion: true } },
    },
  });
}

export async function getPlot(ctx: Ctx, id: string) {
  const p = await prisma.plot.findFirst({
    where: { id, orgId: ctx.orgId },
    include: {
      farmer: true,
      evidence: { orderBy: { createdAt: "desc" } },
      riskChecks: { orderBy: { createdAt: "desc" } },
      purchases: { orderBy: { date: "desc" }, take: 20 },
    },
  });
  if (!p) throw notFound("Kebun tidak ditemukan");
  return p;
}

export const plotUpdateSchema = plotSchema.omit({ farmerId: true, clientId: true }).partial();

export async function updatePlot(ctx: Ctx, id: string, input: unknown) {
  const plot = await getPlot(ctx, id);
  const data = plotUpdateSchema.parse(input);
  const geometryChanged = data.point !== undefined || data.polygon !== undefined || data.declaredAreaHa !== undefined;
  const update: Record<string, unknown> = {};
  if (data.label !== undefined) update.label = data.label;
  if (geometryChanged) {
    const geom = await validatePlotGeometry(ctx.orgId, {
      point: data.point !== undefined ? data.point : data.polygon !== undefined ? null : plot.geomPoint,
      polygon: data.polygon !== undefined ? data.polygon : plot.geomPolygon,
      declaredAreaHa: data.declaredAreaHa ?? Number(plot.declaredAreaHa),
      gpsAccuracyM: data.gpsAccuracyM,
    });
    Object.assign(update, {
      geomPoint: geom.geomPoint ?? null, geomPolygon: geom.geomPolygon ?? null, computedAreaHa: geom.computedAreaHa,
      declaredAreaHa: data.declaredAreaHa ?? plot.declaredAreaHa, gpsAccuracyM: data.gpsAccuracyM ?? plot.gpsAccuracyM,
      capturedAt: data.capturedAt ?? new Date(), capturedBy: ctx.userId,
    });
  }
  const updated = await prisma.plot.update({ where: { id }, data: update });
  if (geometryChanged) await fireGeometryChanged(ctx.orgId, id, ctx.userId);
  return updated;
}

// ------------------------------------------------------------------ legality evidence (F2.5)

export const evidenceSchema = z.object({
  clientId: z.string().max(80).nullish(),
  type: z.enum(["SHM", "SKT", "SKD", "OTHER", "NONE"]),
  documentNumber: z.string().trim().max(120).nullish(),
  notes: z.string().trim().max(1000).nullish(),
});

const IMAGE_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };

export async function storeOrgFile(orgId: string, prefix: string, file: File) {
  const ext = IMAGE_TYPES[file.type];
  if (!ext) throw badRequest("Foto harus JPG, PNG, WEBP, atau PDF");
  if (file.size > 10 * 1024 * 1024) throw badRequest("Ukuran foto maksimal 10 MB");
  const key = `${orgId}/${prefix}/${Date.now()}-${randomToken(6)}-${safeFileName(file.name)}`;
  await putObject(key, Buffer.from(await file.arrayBuffer()));
  return key;
}

/** F2.5 — at least one photo, or an explicit "NONE" (no legality document) record. */
export async function addEvidence(ctx: Ctx, plotId: string, input: unknown, photos: File[] = [], photoKeys: string[] = []) {
  const plot = await prisma.plot.findFirst({ where: { id: plotId, orgId: ctx.orgId } });
  if (!plot) throw notFound("Kebun tidak ditemukan");
  const data = evidenceSchema.parse(input);
  if (data.type !== "NONE" && photos.length + photoKeys.length === 0) {
    throw unprocessable('Lampirkan minimal 1 foto bukti legalitas, atau pilih "Belum ada"');
  }
  if (photoKeys.some((k) => !k.startsWith(`${ctx.orgId}/`))) throw badRequest("Kunci foto tidak valid");
  const keys = [...photoKeys];
  for (const p of photos) keys.push(await storeOrgFile(ctx.orgId, `plots/${plotId}/evidence`, p));
  const ev = await prisma.legalityEvidence.create({
    data: {
      orgId: ctx.orgId, plotId, clientId: data.clientId ?? null, type: data.type, documentNumber: data.documentNumber ?? null,
      notes: data.notes ?? null, photoKeys: keys, createdBy: ctx.userId,
    },
  });
  await fireGeometryChanged(ctx.orgId, plotId, ctx.userId); // R05 depends on evidence
  return ev;
}

export async function deleteEvidence(ctx: Ctx, id: string) {
  const ev = await prisma.legalityEvidence.findFirst({ where: { id, orgId: ctx.orgId } });
  if (!ev) throw notFound();
  await prisma.legalityEvidence.delete({ where: { id } });
  await fireGeometryChanged(ctx.orgId, ev.plotId, ctx.userId);
}
