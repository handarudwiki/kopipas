import { z } from "zod";
import type { FeatureCollection, Point, Polygon } from "geojson";
import { prisma } from "@/lib/db";
import type { Ctx } from "@/lib/context";
import { badRequest, notFound, unprocessable } from "@/lib/errors";
import { enqueueJob, registerJob } from "@/lib/jobs";
import { evaluateRisk, RISK_RULES_VERSION } from "@/lib/geo/risk";
import { parseSettings } from "@/lib/settings";
import type { RiskStatus } from "@/generated/prisma/enums";
import { onPlotGeometryChanged, storeOrgFile } from "./farmers";

export const DATASET_KINDS = { FOREST_COVER_2020: "Tutupan hutan 31 Des 2020", FOREST_AREA: "Batas kawasan hutan" } as const;
export type DatasetKind = keyof typeof DATASET_KINDS;

export async function activeDataset(kind: DatasetKind) {
  return prisma.referenceDataset.findFirst({ where: { kind, isActive: true }, orderBy: { createdAt: "desc" } });
}

/** Effective status: an admin decision overrides the automatic result (F3.4). */
export const effectiveStatus = (c: { status: RiskStatus; decisionStatus: RiskStatus | null }) => c.decisionStatus ?? c.status;

/** F3.1 — run R01–R05 for one plot and record a new risk_check version. */
export async function runRiskCheck(orgId: string, plotId: string, actorId: string | null) {
  const started = Date.now();
  const plot = await prisma.plot.findFirstOrThrow({ where: { id: plotId, orgId }, include: { evidence: { select: { type: true } } } });
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
  const [forest, forestArea] = await Promise.all([activeDataset("FOREST_COVER_2020"), activeDataset("FOREST_AREA")]);
  const settings = parseSettings(org.settings).risk;

  const result = evaluateRisk({
    point: plot.geomPoint as Point | null,
    polygon: plot.geomPolygon as Polygon | null,
    declaredAreaHa: Number(plot.declaredAreaHa),
    evidenceTypes: plot.evidence.map((e) => e.type),
    forest2020: (forest?.geojson as unknown as FeatureCollection) ?? null,
    forestArea: (forestArea?.geojson as unknown as FeatureCollection) ?? null,
    thresholds: settings,
  });
  const datasetVersion = [forest ? `FC2020:${forest.version}` : "FC2020:none", forestArea ? `FA:${forestArea.version}` : null].filter(Boolean).join(";");

  const check = await prisma.riskCheck.create({
    data: {
      orgId, plotId, datasetVersion, rulesVersion: RISK_RULES_VERSION, forestPct2020: result.forestPct2020,
      overlapsForestArea: result.overlapsForestArea, status: result.status,
      reasons: [...result.reasons, { assessed: result.assessed, thresholds: settings }] as object[],
      durationMs: Date.now() - started, createdBy: actorId,
    },
  });
  if (plot.riskStatus !== result.status) await prisma.plot.update({ where: { id: plotId }, data: { riskStatus: result.status } });
  return { checkId: check.id, status: result.status, forestPct2020: result.forestPct2020, durationMs: check.durationMs };
}

registerJob("risk_check", (p, job) => runRiskCheck(job.orgId, String(p.plotId), job.createdBy));

// New/changed geometry or evidence → automatic re-check (F3.1).
onPlotGeometryChanged((orgId, plotId, actorId) => enqueueJob(orgId, actorId, "risk_check", { plotId }));

export async function listRiskChecks(ctx: Ctx, plotId: string) {
  const plot = await prisma.plot.findFirst({ where: { id: plotId, orgId: ctx.orgId } });
  if (!plot) throw notFound("Kebun tidak ditemukan");
  return prisma.riskCheck.findMany({ where: { plotId, orgId: ctx.orgId }, orderBy: { createdAt: "desc" } });
}

export async function requestRiskCheck(ctx: Ctx, plotId: string) {
  const plot = await prisma.plot.findFirst({ where: { id: plotId, orgId: ctx.orgId } });
  if (!plot) throw notFound("Kebun tidak ditemukan");
  return enqueueJob(ctx.orgId, ctx.userId, "risk_check", { plotId });
}

/** Re-check every plot of the organisation (after thresholds or dataset change). */
export async function recheckAll(ctx: Ctx) {
  const plots = await prisma.plot.findMany({ where: { orgId: ctx.orgId }, select: { id: true } });
  for (const p of plots) await enqueueJob(ctx.orgId, ctx.userId, "risk_check", { plotId: p.id });
  return { queued: plots.length };
}

export const decisionSchema = z.object({
  decision: z.enum(["PASS", "RISK"]),
  note: z.string().trim().min(10, "Catatan verifikasi minimal 10 karakter"),
});

/**
 * F3.4 — field verification for a REVIEW/RISK plot: note + photos + decision. Only admins
 * (enforced by the route permission) can change the status; the change is audit-logged.
 */
export async function decideRiskCheck(ctx: Ctx, plotId: string, checkId: string, input: unknown, photos: File[] = [], photoKeys: string[] = []) {
  const data = decisionSchema.parse(input);
  const check = await prisma.riskCheck.findFirst({ where: { id: checkId, plotId, orgId: ctx.orgId } });
  if (!check) throw notFound("Cek risiko tidak ditemukan");
  const latest = await prisma.riskCheck.findFirstOrThrow({ where: { plotId, orgId: ctx.orgId }, orderBy: { createdAt: "desc" } });
  if (latest.id !== check.id) throw badRequest("Hanya cek risiko terbaru yang dapat diputuskan");
  if (check.status === "ERROR") throw unprocessable("Kebun berstatus TIDAK BISA DICEK; perbaiki geometrinya (petakan poligon) terlebih dahulu");
  if (check.status === "PASS") throw badRequest("Kebun sudah LOLOS; tidak perlu verifikasi");
  if (photoKeys.some((k) => !k.startsWith(`${ctx.orgId}/`))) throw badRequest("Kunci foto tidak valid");
  const keys = [...photoKeys];
  for (const p of photos) keys.push(await storeOrgFile(ctx.orgId, `plots/${plotId}/verification`, p));

  const updated = await prisma.riskCheck.update({
    where: { id: check.id },
    data: { decisionStatus: data.decision, decisionNote: data.note, decidedBy: ctx.userId, decidedAt: new Date(), verificationPhotoKeys: keys },
  });
  await prisma.plot.update({ where: { id: plotId }, data: { riskStatus: data.decision } });
  return updated;
}

// ------------------------------------------------------------------ reference datasets (super admin)

export const datasetSchema = z.object({
  kind: z.enum(["FOREST_COVER_2020", "FOREST_AREA"]),
  version: z.string().trim().min(1).max(60),
  name: z.string().trim().min(3).max(200),
  source: z.string().trim().max(500).nullish(),
});

export function validateFeatureCollection(raw: unknown): FeatureCollection {
  const fc = raw as FeatureCollection;
  if (!fc || fc.type !== "FeatureCollection" || !Array.isArray(fc.features)) throw unprocessable("File harus GeoJSON FeatureCollection");
  const polysOnly = fc.features.filter((f) => f.geometry && (f.geometry.type === "Polygon" || f.geometry.type === "MultiPolygon"));
  if (!polysOnly.length) throw unprocessable("Dataset tidak berisi poligon");
  return { type: "FeatureCollection", features: polysOnly.map((f) => ({ type: "Feature", properties: f.properties ?? {}, geometry: f.geometry })) };
}

export async function createDataset(ctx: Ctx, meta: unknown, geojson: unknown, activate = true) {
  const m = datasetSchema.parse(meta);
  const fc = validateFeatureCollection(geojson);
  const exists = await prisma.referenceDataset.findFirst({ where: { kind: m.kind, version: m.version } });
  if (exists) throw badRequest("Versi dataset sudah ada");
  const ds = await prisma.referenceDataset.create({
    data: { ...m, source: m.source ?? null, geojson: fc as unknown as object, isActive: false, createdBy: ctx.userId },
  });
  if (activate) await activateDataset(ctx, ds.id);
  return { id: ds.id, features: fc.features.length };
}

export async function activateDataset(ctx: Ctx, id: string) {
  void ctx;
  const ds = await prisma.referenceDataset.findUnique({ where: { id } });
  if (!ds) throw notFound();
  await prisma.referenceDataset.updateMany({ where: { kind: ds.kind, isActive: true, NOT: { id } }, data: { isActive: false } });
  return prisma.referenceDataset.update({ where: { id }, data: { isActive: true }, select: { id: true, kind: true, version: true, isActive: true } });
}

export async function listDatasets() {
  const rows = await prisma.referenceDataset.findMany({ orderBy: [{ kind: "asc" }, { createdAt: "desc" }] });
  return rows.map(({ geojson, ...r }) => ({ ...r, featureCount: (geojson as unknown as FeatureCollection).features?.length ?? 0 }));
}
