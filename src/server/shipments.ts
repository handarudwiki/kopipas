import { z } from "zod";
import { prisma } from "@/lib/db";
import type { Ctx } from "@/lib/context";
import { badRequest, conflict, notFound } from "@/lib/errors";
import { enqueueJob, registerJob } from "@/lib/jobs";
import { parseSettings } from "@/lib/settings";
import { parseNumber } from "@/lib/docs/parse";
import { evaluate, fingerprint, loadRuleSet } from "@/lib/rules/engine";
import type { DocFacts, Ref, ShipmentFacts } from "@/lib/rules/types";
import { num } from "@/lib/format";
import { toGreenKg } from "./lots-math";

// ------------------------------------------------------------------ shipments (F5.1)

export const shipmentSchema = z.object({
  reference: z.string().trim().min(2).max(60),
  buyerName: z.string().trim().min(2).max(200),
  buyerAddress: z.string().trim().max(500).nullish(),
  buyerCountry: z.string().trim().length(2).transform((s) => s.toUpperCase()),
  portLoading: z.string().trim().min(2).max(120),
  portDischarge: z.string().trim().min(2).max(120),
  hsCode: z.string().trim().regex(/^0901[\d.]*$/, "HS code harus diawali 0901 (kopi)").default("0901"),
  productDescription: z.string().trim().max(500).nullish(),
  netWeightKg: z.coerce.number().positive().nullish(),
  paymentMethod: z.enum(["LC", "TT", "OTHER"]),
  presentationDate: z.coerce.date().nullish(),
});

export async function listShipments(ctx: Ctx, q: { status?: string; search?: string } = {}) {
  const rows = await prisma.shipment.findMany({
    where: {
      orgId: ctx.orgId,
      ...(q.status ? { status: q.status as "DRAFT" } : {}),
      ...(q.search
        ? { OR: [{ reference: { contains: q.search, mode: "insensitive" } }, { buyerName: { contains: q.search, mode: "insensitive" } }] }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { documents: true, lots: true } },
      findings: { where: { status: "OPEN" }, select: { severity: true } },
      evidencePacks: { select: { version: true }, orderBy: { version: "desc" }, take: 1 },
    },
  });
  return rows.map(({ findings, ...s }) => ({
    ...s,
    openErrors: findings.filter((f) => f.severity === "ERROR").length,
    openWarnings: findings.filter((f) => f.severity === "WARNING").length,
  }));
}

export async function createShipment(ctx: Ctx, input: unknown) {
  const data = shipmentSchema.parse(input);
  const dup = await prisma.shipment.findFirst({ where: { orgId: ctx.orgId, reference: data.reference } });
  if (dup) throw conflict("Nomor referensi pengiriman sudah dipakai");
  return prisma.shipment.create({ data: { ...data, orgId: ctx.orgId, createdBy: ctx.userId } });
}

export async function getShipmentOr404(ctx: Ctx, id: string) {
  const s = await prisma.shipment.findFirst({ where: { id, orgId: ctx.orgId } });
  if (!s) throw notFound("Pengiriman tidak ditemukan");
  return s;
}

export async function getShipmentDetail(ctx: Ctx, id: string) {
  const s = await prisma.shipment.findFirst({
    where: { id, orgId: ctx.orgId },
    include: {
      documents: { orderBy: { createdAt: "asc" }, include: { fields: { where: { isCurrent: true } } } },
      findings: { orderBy: [{ status: "asc" }, { severity: "asc" }, { ruleId: "asc" }] },
      lots: { include: { lot: { include: { purchases: { include: { purchase: { include: { plot: { include: { farmer: true } } } } } } } } } },
      evidencePacks: { orderBy: { version: "desc" }, include: { shareLinks: { orderBy: { createdAt: "desc" } } } },
    },
  });
  if (!s) throw notFound("Pengiriman tidak ditemukan");
  return s;
}

export async function updateShipment(ctx: Ctx, id: string, input: unknown) {
  await getShipmentOr404(ctx, id);
  const data = shipmentSchema.partial().parse(input);
  if (data.reference) {
    const dup = await prisma.shipment.findFirst({ where: { orgId: ctx.orgId, reference: data.reference, NOT: { id } } });
    if (dup) throw conflict("Nomor referensi pengiriman sudah dipakai");
  }
  return prisma.shipment.update({ where: { id }, data });
}

export async function deleteShipment(ctx: Ctx, id: string) {
  const s = await getShipmentOr404(ctx, id);
  const packs = await prisma.evidencePack.count({ where: { shipmentId: id } });
  if (packs) throw conflict("Pengiriman yang sudah punya paket bukti tidak dapat dihapus (retensi data, N8)");
  await prisma.shipment.delete({ where: { id: s.id } });
}

// ------------------------------------------------------------------ validation (F5.5, F5.6)

/** Total linked lot weight in green-bean kg (F4.3 conversion) — used by D15. */
export async function lotTotals(orgId: string, shipmentId: string) {
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
  const conv = parseSettings(org.settings).conversion;
  const links = await prisma.shipmentLot.findMany({ where: { shipmentId, shipment: { orgId } }, include: { lot: true } });
  const totalGreenKg = links.reduce((a, l) => a + toGreenKg(num(l.lot.weightKg), l.lot.productForm, conv), 0);
  return { count: links.length, totalGreenKg, totalKg: links.reduce((a, l) => a + num(l.lot.weightKg), 0) };
}

export async function buildFacts(orgId: string, shipmentId: string): Promise<ShipmentFacts> {
  const [shipment, org, docs, lots] = await Promise.all([
    prisma.shipment.findFirstOrThrow({ where: { id: shipmentId, orgId } }),
    prisma.organization.findUniqueOrThrow({ where: { id: orgId } }),
    prisma.document.findMany({ where: { shipmentId, orgId }, include: { fields: { where: { isCurrent: true } } } }),
    lotTotals(orgId, shipmentId),
  ]);
  const settings = parseSettings(org.settings).validation;
  const facts: DocFacts[] = docs.map((d) => ({
    id: d.id,
    type: d.type,
    fileName: d.fileName,
    fields: Object.fromEntries(d.fields.map((f) => [f.name, f.value])),
  }));
  const docNet = (t: string) => {
    const d = facts.find((x) => x.type === t);
    return d ? parseNumber(d.fields.net_weight_kg ?? null) : null;
  };
  return {
    paymentMethod: shipment.paymentMethod,
    presentationDate: (shipment.presentationDate ?? new Date()).toISOString().slice(0, 10),
    docs: facts,
    shipmentNetWeightKg: shipment.netWeightKg != null ? num(shipment.netWeightKg) : docNet("INVOICE") ?? docNet("PACKING_LIST"),
    lots: { count: lots.count, totalGreenKg: lots.totalGreenKg },
    settings,
  };
}

/**
 * Runs the rule engine and reconciles findings: problems that persist keep their status
 * (an ACCEPTED finding stays accepted), vanished ones become RESOLVED, new ones are OPEN.
 */
export async function runValidation(orgId: string, shipmentId: string, actorId: string | null) {
  const ruleSet = loadRuleSet();
  const facts = await buildFacts(orgId, shipmentId);
  const results = evaluate(facts, ruleSet);
  const existing = await prisma.finding.findMany({ where: { shipmentId, orgId, status: { in: ["OPEN", "ACCEPTED"] } } });
  const byFp = new Map(existing.map((f) => [fingerprint({ ruleId: f.ruleId, refs: f.refs as Ref[], message: f.message }), f]));
  const seen = new Set<string>();

  for (const r of results) {
    const fp = fingerprint(r);
    if (seen.has(fp)) continue;
    seen.add(fp);
    const prev = byFp.get(fp);
    if (prev) {
      if (prev.message !== r.message || prev.severity !== r.severity || prev.rulesVersion !== ruleSet.version) {
        await prisma.finding.update({
          where: { id: prev.id },
          data: { message: r.message, severity: r.severity, suggestion: r.suggestion, refs: r.refs as object[], rulesVersion: ruleSet.version },
        });
      }
    } else {
      await prisma.finding.create({
        data: {
          orgId, shipmentId, ruleId: r.ruleId, rulesVersion: ruleSet.version, severity: r.severity,
          message: r.message, suggestion: r.suggestion, refs: r.refs as object[], createdBy: actorId,
        },
      });
    }
  }
  for (const [fp, f] of byFp) {
    if (!seen.has(fp)) await prisma.finding.update({ where: { id: f.id }, data: { status: "RESOLVED", resolvedBy: null } });
  }
  return refreshShipmentStatus(orgId, shipmentId, { validated: true, rulesVersion: ruleSet.version });
}

/** F5.6 — READY only when validated, extraction finished, and no OPEN ERROR findings. */
export async function refreshShipmentStatus(orgId: string, shipmentId: string, opts: { validated?: boolean; rulesVersion?: string } = {}) {
  const s = await prisma.shipment.findFirstOrThrow({ where: { id: shipmentId, orgId } });
  const validated = opts.validated || s.lastValidatedAt != null;
  const [openErrors, pendingDocs] = await Promise.all([
    prisma.finding.count({ where: { shipmentId, status: "OPEN", severity: "ERROR" } }),
    prisma.document.count({ where: { shipmentId, extractionStatus: "PENDING" } }),
  ]);
  const status = !validated ? "DRAFT" : openErrors === 0 && pendingDocs === 0 ? "READY" : "CHECKING";
  const data: Record<string, unknown> = {};
  if (status !== s.status) data.status = status;
  if (opts.validated) {
    data.lastValidatedAt = new Date();
    data.rulesVersion = opts.rulesVersion;
  }
  if (Object.keys(data).length) await prisma.shipment.update({ where: { id: s.id }, data });
  return { status, openErrors, pendingDocs };
}

registerJob("validate_shipment", async (payload, job) => runValidation(job.orgId, String(payload.shipmentId), job.createdBy));

export async function requestValidation(ctx: Ctx, shipmentId: string) {
  await getShipmentOr404(ctx, shipmentId);
  const pending = await prisma.document.count({ where: { shipmentId, extractionStatus: "PENDING" } });
  if (pending) throw badRequest("Masih ada dokumen yang sedang diekstraksi; coba lagi sebentar");
  return enqueueJob(ctx.orgId, ctx.userId, "validate_shipment", { shipmentId });
}

// ------------------------------------------------------------------ findings (F5.7)

export async function listFindings(ctx: Ctx, shipmentId: string) {
  await getShipmentOr404(ctx, shipmentId);
  return prisma.finding.findMany({ where: { shipmentId, orgId: ctx.orgId }, orderBy: [{ status: "asc" }, { severity: "asc" }, { ruleId: "asc" }] });
}

/**
 * Users may accept a finding with a mandatory reason, or re-open an accepted one. RESOLVED is set
 * only by re-validation (the underlying data was fixed), so READY cannot be reached by clicking.
 */
export const findingUpdateSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("ACCEPTED"), acceptReason: z.string().trim().min(5, "Alasan wajib diisi (min. 5 karakter)") }),
  z.object({ status: z.literal("OPEN") }),
]);

export async function updateFinding(ctx: Ctx, id: string, input: unknown) {
  const data = findingUpdateSchema.parse(input);
  const f = await prisma.finding.findFirst({ where: { id, orgId: ctx.orgId } });
  if (!f) throw notFound("Temuan tidak ditemukan");
  if (f.status === "RESOLVED") throw badRequest("Temuan sudah terselesaikan oleh validasi ulang");
  const updated = await prisma.finding.update({
    where: { id },
    data: {
      status: data.status,
      acceptReason: data.status === "ACCEPTED" ? data.acceptReason : null,
      resolvedBy: data.status === "OPEN" ? null : ctx.userId,
    },
  });
  await refreshShipmentStatus(ctx.orgId, f.shipmentId);
  return updated;
}
