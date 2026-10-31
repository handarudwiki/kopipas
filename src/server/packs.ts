import { z } from "zod";
import type { FeatureCollection, Point, Polygon } from "geojson";
import { prisma } from "@/lib/db";
import type { Ctx } from "@/lib/context";
import { randomToken, sha256 } from "@/lib/crypto";
import { ApiError, badRequest, notFound, unprocessable } from "@/lib/errors";
import { enqueueJob, registerJob } from "@/lib/jobs";
import { num } from "@/lib/format";
import { parseSettings } from "@/lib/settings";
import { getObject, putObject } from "@/lib/storage";
import { DOC_TYPE_LABEL } from "@/lib/docs/schemas";
import { COLORS, PdfWriter } from "@/lib/pdf/kit";
import { RISK_RULES_VERSION } from "@/lib/geo/risk";
import { getShipmentOr404, lotTotals } from "./shipments";

const RISK_EN = { PENDING: "PENDING", PASS: "PASS", REVIEW: "NEEDS VERIFICATION", RISK: "AT RISK", ERROR: "CANNOT BE CHECKED" } as const;
const FORM_EN = { CHERRY: "cherry", PARCHMENT: "parchment", GREEN: "green bean" } as const;
const LEGAL_EN = { SHM: "Land ownership certificate (SHM)", SKT: "Land statement letter (SKT)", SKD: "Village head statement (SKD)", OTHER: "Other", NONE: "No legality document" } as const;

const plotCode = (id: string) => `PLT-${id.slice(0, 8).toUpperCase()}`;

/** F6.2 — reasons a pack cannot be generated (empty = allowed). */
export async function packBlockers(orgId: string, shipmentId: string) {
  const s = await prisma.shipment.findFirstOrThrow({ where: { id: shipmentId, orgId } });
  const reasons: string[] = [];
  if (!s.lastValidatedAt) reasons.push("Dokumen ekspor belum divalidasi.");
  const openErrors = await prisma.finding.count({ where: { shipmentId, status: "OPEN", severity: "ERROR" } });
  if (openErrors) reasons.push(`${openErrors} temuan ERROR masih terbuka.`);
  if (s.status !== "READY" && s.lastValidatedAt && !openErrors) reasons.push("Status pengiriman belum SIAP (ekstraksi dokumen belum selesai).");
  const links = await prisma.shipmentLot.findMany({ where: { shipmentId }, include: { lot: { include: { purchases: { include: { purchase: { include: { plot: true } } } } } } } });
  if (!links.length) reasons.push("Belum ada lot yang ditautkan.");
  const plots = new Map<string, { label: string | null; riskStatus: string }>();
  for (const l of links) for (const lp of l.lot.purchases) plots.set(lp.purchase.plot.id, lp.purchase.plot);
  const notPass = [...plots.entries()].filter(([, p]) => p.riskStatus !== "PASS");
  if (notPass.length) {
    reasons.push(`${notPass.length} kebun asal belum LOLOS atau belum diverifikasi admin: ${notPass.slice(0, 5).map(([id, p]) => `${p.label ?? plotCode(id)} (${p.riskStatus})`).join(", ")}${notPass.length > 5 ? ", …" : ""}.`);
  }
  return reasons;
}

/** Assemble the structured pack content (BRD "Isi paket bukti EUDR"). Deterministic for hashing. */
export async function buildPackContent(orgId: string, shipmentId: string) {
  const [s, org] = await Promise.all([
    prisma.shipment.findFirstOrThrow({
      where: { id: shipmentId, orgId },
      include: {
        documents: { orderBy: { createdAt: "asc" } },
        findings: { orderBy: [{ ruleId: "asc" }, { createdAt: "asc" }] },
        lots: {
          orderBy: { lotId: "asc" },
          include: { lot: { include: { purchases: { include: { purchase: { include: { plot: { include: { farmer: true, evidence: { orderBy: { createdAt: "asc" } }, riskChecks: { orderBy: { createdAt: "desc" }, take: 1 } } } } } } } } } },
        },
      },
    }),
    prisma.organization.findUniqueOrThrow({ where: { id: orgId } }),
  ]);
  const totals = await lotTotals(orgId, shipmentId);

  const purchases = s.lots.flatMap((l) => l.lot.purchases.map((lp) => lp.purchase));
  const dates = purchases.map((p) => p.date.toISOString().slice(0, 10)).sort();
  const plotMap = new Map<string, (typeof purchases)[number]["plot"]>();
  for (const p of purchases) plotMap.set(p.plot.id, p.plot);
  const plots = [...plotMap.values()].sort((a, b) => a.id.localeCompare(b.id));

  const invoice = s.documents.find((d) => d.type === "INVOICE");
  const invoiceNet = invoice ? await prisma.extractedField.findFirst({ where: { documentId: invoice.id, name: "net_weight_kg", isCurrent: true } }) : null;
  const netWeightKg = s.netWeightKg != null ? num(s.netWeightKg) : invoiceNet?.value ? Number(invoiceNet.value) : totals.totalGreenKg;

  const plotEntries = plots.map((p) => {
    const rc = p.riskChecks[0];
    return {
      plotRef: plotCode(p.id),
      plotId: p.id,
      location: { village: p.farmer.village, district: p.farmer.district, regency: p.farmer.regency, province: p.farmer.province, country: "ID" },
      geometryType: p.geomPolygon ? "Polygon" : "Point",
      declaredAreaHa: num(p.declaredAreaHa),
      computedAreaHa: p.computedAreaHa != null ? num(p.computedAreaHa) : null,
      capturedAt: p.capturedAt?.toISOString() ?? null,
      risk: rc
        ? {
            automaticResult: RISK_EN[rc.status],
            finalStatus: RISK_EN[rc.decisionStatus ?? rc.status],
            forestCover2020Pct: rc.forestPct2020 != null ? num(rc.forestPct2020) : null,
            overlapsForestArea: rc.overlapsForestArea,
            datasetVersion: rc.datasetVersion,
            rulesVersion: rc.rulesVersion,
            checkedAt: rc.createdAt.toISOString(),
            verification: rc.decisionStatus ? { decision: RISK_EN[rc.decisionStatus], note: rc.decisionNote, decidedAt: rc.decidedAt?.toISOString() ?? null } : null,
          }
        : null,
      legality: p.evidence.map((e) => ({ type: LEGAL_EN[e.type], documentNumber: e.documentNumber, photos: e.photoKeys.length, notes: e.notes })),
    };
  });

  const geojson: FeatureCollection = {
    type: "FeatureCollection",
    features: plots.map((p) => ({
      type: "Feature",
      properties: { plotRef: plotCode(p.id), country: "ID", areaHa: num(p.computedAreaHa ?? p.declaredAreaHa), riskStatus: RISK_EN[p.riskStatus], producerCountry: "Indonesia" },
      geometry: (p.geomPolygon ?? p.geomPoint) as unknown as Polygon | Point,
    })),
  };

  const validation = {
    rulesVersion: s.rulesVersion,
    validatedAt: s.lastValidatedAt?.toISOString() ?? null,
    status: s.status,
    openErrors: s.findings.filter((f) => f.status === "OPEN" && f.severity === "ERROR").length,
    openWarnings: s.findings.filter((f) => f.status === "OPEN" && f.severity === "WARNING").length,
    acceptedWithReason: s.findings.filter((f) => f.status === "ACCEPTED").map((f) => ({ ruleId: f.ruleId, severity: f.severity, message: f.message, reason: f.acceptReason })),
    documents: s.documents.map((d) => ({ type: DOC_TYPE_LABEL[d.type], fileName: d.fileName, sha256: d.sha256, version: d.version })),
  };

  const data = {
    schema: "kopipass.eudr-evidence-pack/1",
    shipment: { reference: s.reference, paymentMethod: s.paymentMethod, portOfLoading: s.portLoading, portOfDischarge: s.portDischarge },
    product: {
      description: s.productDescription ?? "Coffee, not roasted, not decaffeinated (green coffee beans)",
      hsCode: s.hsCode,
      netWeightKg,
      lots: s.lots.map((l) => ({ code: l.lot.code, form: FORM_EN[l.lot.productForm], weightKg: num(l.lot.weightKg) })),
    },
    countryOfProduction: "ID",
    harvestOrPurchasePeriod: dates.length ? { from: dates[0], to: dates[dates.length - 1] } : null,
    operator: { name: org.name, address: org.address, country: org.country, taxId: org.npwp },
    buyer: { name: s.buyerName, address: s.buyerAddress, country: s.buyerCountry },
    plots: plotEntries,
    riskSummary: {
      plots: plotEntries.length,
      pass: plotEntries.filter((p) => p.risk?.finalStatus === "PASS").length,
      verifiedByAdmin: plotEntries.filter((p) => p.risk?.verification).length,
      datasetVersions: [...new Set(plotEntries.map((p) => p.risk?.datasetVersion).filter(Boolean))],
      rulesVersion: RISK_RULES_VERSION,
    },
    documentValidation: validation,
  };
  return { data, geojson };
}

const canonical = (v: unknown): string => JSON.stringify(v, (_k, val) => (val && typeof val === "object" && !Array.isArray(val) ? Object.fromEntries(Object.entries(val).sort(([a], [b]) => a.localeCompare(b))) : val));

/** Content hash over data + geometry (not over timestamps of generation). */
export function contentHash(c: { data: unknown; geojson: unknown }) {
  return sha256(canonical({ data: c.data, geojson: c.geojson }));
}

async function renderPackPdf(meta: { version: number; sha256: string; generatedAt: Date }, c: Awaited<ReturnType<typeof buildPackContent>>) {
  const d = c.data;
  const w = await PdfWriter.create({ title: `EUDR evidence pack ${d.shipment.reference} v${meta.version}`, footer: `KopiPass EUDR pack ${d.shipment.reference} v${meta.version} - SHA-256 ${meta.sha256.slice(0, 16)}...` });
  w.text("KopiPass", { size: 10, bold: true, color: COLORS.primary });
  w.text("EUDR Evidence Pack", { size: 20, bold: true });
  w.text(`Shipment ${d.shipment.reference} - version ${meta.version} - generated ${meta.generatedAt.toISOString().replace("T", " ").slice(0, 19)} UTC`, { size: 9, color: COLORS.muted, gap: 6 });
  w.text("SHA-256 (content hash)", { size: 7.5, bold: true, color: COLORS.muted });
  w.text(meta.sha256, { size: 9, mono: true, gap: 6 });

  w.heading("Product and quantity");
  w.kv([
    ["Description", d.product.description], ["HS code", d.product.hsCode],
    ["Net weight", `${d.product.netWeightKg.toLocaleString("en-US")} kg`], ["Country of production", "Indonesia (ID)"],
    ["Harvest / purchase period", d.harvestOrPurchasePeriod ? `${d.harvestOrPurchasePeriod.from} to ${d.harvestOrPurchasePeriod.to}` : "-"],
    ["Lots", d.product.lots.map((l) => `${l.code} (${l.weightKg.toLocaleString("en-US")} kg ${l.form})`).join(", ")],
  ]);

  w.heading("Operator and buyer");
  w.kv([
    ["Exporter", d.operator.name], ["Exporter address", d.operator.address ?? "-"],
    ["Buyer", d.buyer.name], ["Buyer address", `${d.buyer.address ?? "-"} (${d.buyer.country})`],
    ["Port of loading", d.shipment.portOfLoading], ["Port of discharge", d.shipment.portOfDischarge],
  ]);

  w.heading("Plots of production and deforestation risk");
  w.text(`${d.riskSummary.plots} plots - ${d.riskSummary.pass} PASS (${d.riskSummary.verifiedByAdmin} after field verification). Reference: forest cover on 31 Dec 2020, dataset ${d.riskSummary.datasetVersions.join(", ") || "-"}; rules ${d.riskSummary.rulesVersion}. Full geolocation (6 decimals) in the GeoJSON file.`, { size: 9, gap: 4 });
  const geoById = new Map(c.geojson.features.map((f) => [f.properties?.plotRef, f.geometry]));
  w.table(
    ["Plot", "Location", "Geolocation", "Area (ha)", "Forest 2020", "Result", "Verification"],
    d.plots.map((p) => {
      const g = geoById.get(p.plotRef) as Point | Polygon | undefined;
      const loc = g?.type === "Point" ? `${g.coordinates[1]!.toFixed(6)}, ${g.coordinates[0]!.toFixed(6)}` : g ? `Polygon, ${g.coordinates[0]!.length - 1} vertices` : "-";
      return [
        p.plotRef, `${p.location.village}, ${p.location.regency}`, loc, (p.computedAreaHa ?? p.declaredAreaHa).toFixed(2),
        p.risk?.forestCover2020Pct != null ? `${p.risk.forestCover2020Pct}%` : "-", p.risk?.finalStatus ?? "-",
        p.risk?.verification ? `${p.risk.verification.decision}: ${p.risk.verification.note ?? ""}` : "-",
      ];
    }),
    [0.12, 0.16, 0.2, 0.08, 0.1, 0.1, 0.24],
    { size: 7.5 },
  );

  w.heading("Land legality evidence");
  w.table(
    ["Plot", "Evidence", "Document no.", "Photos"],
    d.plots.flatMap((p) => (p.legality.length ? p.legality.map((l) => [p.plotRef, l.type, l.documentNumber ?? "-", l.photos]) : [[p.plotRef, "Not recorded", "-", 0]])),
    [0.18, 0.42, 0.28, 0.12],
  );

  w.heading("Export document validation");
  w.kv([
    ["Rule set", d.documentValidation.rulesVersion ?? "-"], ["Validated at", d.documentValidation.validatedAt ?? "-"],
    ["Open errors", d.documentValidation.openErrors], ["Open warnings", d.documentValidation.openWarnings],
  ], 4);
  w.table(["Document", "File", "SHA-256"], d.documentValidation.documents.map((x) => [x.type, x.fileName, x.sha256.slice(0, 24) + "..."]), [0.3, 0.35, 0.35], { size: 7.5 });
  if (d.documentValidation.acceptedWithReason.length) {
    w.text("Findings accepted with reason:", { size: 9, bold: true });
    for (const a of d.documentValidation.acceptedWithReason) w.text(`${a.ruleId} (${a.severity}): ${a.message} - reason: ${a.reason}`, { size: 8.5 });
  }

  w.heading("Integrity");
  w.text(`Pack version ${meta.version}. The SHA-256 above is computed over the canonical JSON data and GeoJSON in this pack; any change to the underlying data produces a new version with a different hash. Farmer consent to share plot and legality data is recorded by the operator (Indonesian Law 27/2022).`, { size: 8.5, color: COLORS.muted });
  return w.save();
}

/** F6.1, F6.3 — generate (or reuse, when nothing changed) a versioned evidence pack. */
export async function generatePack(orgId: string, shipmentId: string, actorId: string | null) {
  const started = Date.now();
  const blockers = await packBlockers(orgId, shipmentId);
  if (blockers.length) throw unprocessable("Paket bukti belum dapat dibuat", blockers);
  const content = await buildPackContent(orgId, shipmentId);
  const hash = contentHash(content);
  const latest = await prisma.evidencePack.findFirst({ where: { shipmentId, orgId }, orderBy: { version: "desc" } });
  if (latest && latest.sha256 === hash) return { packId: latest.id, version: latest.version, sha256: hash, reused: true, durationMs: Date.now() - started };

  const version = (latest?.version ?? 0) + 1;
  const generatedAt = new Date();
  const base = `${orgId}/packs/${shipmentId}/v${version}`;
  const json = JSON.stringify({ ...content.data, pack: { version, sha256: hash, generatedAt: generatedAt.toISOString() } }, null, 2);
  const geo = JSON.stringify(content.geojson, null, 2);
  const pdf = await renderPackPdf({ version, sha256: hash, generatedAt }, content);
  await Promise.all([putObject(`${base}/pack.json`, json), putObject(`${base}/plots.geojson`, geo), putObject(`${base}/summary.pdf`, Buffer.from(pdf))]);

  const pack = await prisma.evidencePack.create({
    data: {
      orgId, shipmentId, version, sha256: hash, pdfKey: `${base}/summary.pdf`, geojsonKey: `${base}/plots.geojson`, jsonKey: `${base}/pack.json`,
      datasetVersion: content.data.riskSummary.datasetVersions.join(";") || "-", rulesVersion: `${content.data.documentValidation.rulesVersion ?? "-"};${RISK_RULES_VERSION}`,
      generatedAt, approvedBy: actorId, approvedAt: generatedAt, createdBy: actorId,
    },
  });
  return { packId: pack.id, version, sha256: hash, reused: false, durationMs: Date.now() - started };
}

registerJob("generate_pack", (p, job) => generatePack(job.orgId, String(p.shipmentId), job.createdBy));

export async function requestPack(ctx: Ctx, shipmentId: string) {
  await getShipmentOr404(ctx, shipmentId);
  const blockers = await packBlockers(ctx.orgId, shipmentId);
  if (blockers.length) throw unprocessable("Paket bukti belum dapat dibuat", blockers);
  return enqueueJob(ctx.orgId, ctx.userId, "generate_pack", { shipmentId });
}

/** Has the underlying data changed since the latest pack? */
export async function packFreshness(orgId: string, shipmentId: string) {
  const latest = await prisma.evidencePack.findFirst({ where: { shipmentId, orgId }, orderBy: { version: "desc" } });
  if (!latest) return { latest: null, stale: false };
  try {
    const hash = contentHash(await buildPackContent(orgId, shipmentId));
    return { latest, stale: hash !== latest.sha256 };
  } catch {
    return { latest, stale: true };
  }
}

export async function listPacks(ctx: Ctx) {
  return prisma.evidencePack.findMany({
    where: { orgId: ctx.orgId },
    orderBy: { generatedAt: "desc" },
    include: { shipment: { select: { id: true, reference: true, buyerName: true } }, shareLinks: { select: { id: true, revokedAt: true, expiresAt: true, accessCount: true } } },
  });
}

export async function getPackFile(orgId: string, packId: string, kind: string) {
  const pack = await prisma.evidencePack.findFirst({ where: { id: packId, orgId }, include: { shipment: { select: { reference: true } } } });
  if (!pack) throw notFound("Paket tidak ditemukan");
  const map = { pdf: [pack.pdfKey, "application/pdf", "pdf"], geojson: [pack.geojsonKey, "application/geo+json", "geojson"], json: [pack.jsonKey, "application/json", "json"] } as const;
  const entry = map[kind as keyof typeof map];
  if (!entry) throw notFound();
  return { data: await getObject(entry[0]), contentType: entry[1], fileName: `eudr-pack-${pack.shipment.reference.replace(/[^\w.-]/g, "_")}-v${pack.version}.${entry[2]}` };
}

// ------------------------------------------------------------------ share links (F6.4)

export const shareSchema = z.object({
  expiresInDays: z.coerce.number().int().min(1).max(365).optional(),
  label: z.string().trim().max(120).nullish(),
});

export async function createShareLink(ctx: Ctx, packId: string, input: unknown) {
  const d = shareSchema.parse(input ?? {});
  const pack = await prisma.evidencePack.findFirst({ where: { id: packId, orgId: ctx.orgId } });
  if (!pack) throw notFound("Paket tidak ditemukan");
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: ctx.orgId } });
  const days = d.expiresInDays ?? parseSettings(org.settings).share.defaultExpiryDays;
  const token = randomToken(32);
  const link = await prisma.shareLink.create({
    data: { orgId: ctx.orgId, evidencePackId: pack.id, tokenHash: sha256(token), label: d.label ?? null, expiresAt: new Date(Date.now() + days * 864e5), createdBy: ctx.userId },
  });
  const base = process.env.APP_URL ?? "http://localhost:3000";
  // the raw token is shown once; only its hash is stored (N4)
  return { id: link.id, url: `${base}/p/${token}`, expiresAt: link.expiresAt };
}

export async function revokeShareLink(ctx: Ctx, id: string) {
  const link = await prisma.shareLink.findFirst({ where: { id, orgId: ctx.orgId } });
  if (!link) throw notFound();
  if (link.revokedAt) return link;
  return prisma.shareLink.update({ where: { id }, data: { revokedAt: new Date() } });
}

/**
 * Resolve a public token. Every successful access increments the counter and is written to the
 * audit log with IP and user agent (F6.4).
 */
export async function resolveShareToken(token: string, access?: { ip?: string | null; ua?: string | null; what: string }) {
  if (!token || token.length < 20) throw notFound("Tautan tidak valid");
  const link = await prisma.shareLink.findUnique({ where: { tokenHash: sha256(token) }, include: { evidencePack: { include: { shipment: true } } } });
  if (!link) throw notFound("Tautan tidak valid");
  if (link.revokedAt) throw new ApiError(410, "Tautan sudah dicabut oleh eksportir");
  if (link.expiresAt < new Date()) throw new ApiError(410, "Tautan sudah kedaluwarsa");
  if (access) {
    await prisma.$executeRaw`UPDATE share_link SET access_count = access_count + 1, last_access_at = now() WHERE id = ${link.id}::uuid`;
    await prisma.auditLog.create({
      data: { orgId: link.orgId, entity: "shareLink", entityId: link.id, action: "ACCESS", meta: { what: access.what, ip: access.ip ?? null, ua: access.ua?.slice(0, 200) ?? null, packVersion: link.evidencePack.version } },
    });
  }
  return link;
}

export async function publicPackSummary(token: string, access: { ip?: string | null; ua?: string | null }) {
  const link = await resolveShareToken(token, { ...access, what: "view" });
  const pack = link.evidencePack;
  const json = JSON.parse((await getObject(pack.jsonKey)).toString("utf8"));
  const geojson = JSON.parse((await getObject(pack.geojsonKey)).toString("utf8"));
  return { pack: { version: pack.version, sha256: pack.sha256, generatedAt: pack.generatedAt }, expiresAt: link.expiresAt, data: json, geojson };
}

export async function publicPackFile(token: string, kind: string, access: { ip?: string | null; ua?: string | null }) {
  if (!["pdf", "geojson", "json"].includes(kind)) throw badRequest("Jenis file tidak dikenal");
  const link = await resolveShareToken(token, { ...access, what: `download:${kind}` });
  return getPackFile(link.orgId, link.evidencePackId, kind);
}
