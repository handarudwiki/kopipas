import { z } from "zod";
import { prisma } from "@/lib/db";
import type { Ctx } from "@/lib/context";
import { badRequest, conflict, notFound, unprocessable } from "@/lib/errors";
import { enqueueJob } from "@/lib/jobs";
import { num } from "@/lib/format";
import { parseSettings } from "@/lib/settings";
import type { ProductForm } from "@/generated/prisma/enums";
import { convertKg, round2 } from "./lots-math";
import { getShipmentOr404 } from "./shipments";
import { registerPurchaseSync } from "./sync";

// ------------------------------------------------------------------ purchases (F4.1)

export const purchaseSchema = z.object({
  clientId: z.string().max(80).nullish(),
  farmerId: z.string().uuid(),
  plotId: z.string().uuid({ error: "Pembelian wajib menunjuk kebun terdaftar" }),
  date: z.coerce.date(),
  weightKg: z.coerce.number().positive().max(1_000_000),
  form: z.enum(["CHERRY", "PARCHMENT", "GREEN"]),
});

export async function createPurchase(ctx: Ctx, input: unknown) {
  const d = purchaseSchema.parse(input);
  if (d.clientId) {
    const dup = await prisma.purchase.findFirst({ where: { orgId: ctx.orgId, clientId: d.clientId } });
    if (dup) return dup;
  }
  const plot = await prisma.plot.findFirst({ where: { id: d.plotId, orgId: ctx.orgId } });
  if (!plot) throw unprocessable("Kebun tidak terdaftar");
  if (plot.farmerId !== d.farmerId) throw unprocessable("Kebun bukan milik petani yang dipilih");
  if (d.date > new Date(Date.now() + 864e5)) throw unprocessable("Tanggal pembelian tidak boleh di masa depan");
  return prisma.purchase.create({
    data: { orgId: ctx.orgId, clientId: d.clientId ?? null, farmerId: d.farmerId, plotId: d.plotId, date: d.date, weightKg: d.weightKg, form: d.form, createdBy: ctx.userId },
  });
}

registerPurchaseSync(async (ctx, op, resolve) => {
  const farmerId = await resolve.farmer(op.data.farmerId, op.data.farmerClientId);
  const plotId = await resolve.plot(op.data.plotId, op.data.plotClientId);
  return createPurchase(ctx, { ...op.data, farmerId, plotId, clientId: op.clientId });
});

export async function listPurchases(ctx: Ctx, q: { unassigned?: boolean } = {}) {
  return prisma.purchase.findMany({
    where: { orgId: ctx.orgId, ...(q.unassigned ? { lots: { none: {} } } : {}) },
    orderBy: { date: "desc" },
    include: {
      farmer: { select: { id: true, fullName: true } },
      plot: { select: { id: true, label: true, riskStatus: true } },
      lots: { include: { lot: { select: { id: true, code: true } } } },
    },
  });
}

export async function deletePurchase(ctx: Ctx, id: string) {
  const p = await prisma.purchase.findFirst({ where: { id, orgId: ctx.orgId }, include: { lots: true } });
  if (!p) throw notFound();
  if (p.lots.length) throw conflict("Pembelian sudah masuk lot; lepaskan dari lot terlebih dahulu");
  await prisma.purchase.delete({ where: { id } });
}

// ------------------------------------------------------------------ lots (F4.2–F4.4)

export const lotSchema = z.object({
  code: z.string().trim().min(2).max(60),
  productForm: z.enum(["CHERRY", "PARCHMENT", "GREEN"]),
  weightKg: z.coerce.number().positive(),
  purchaseIds: z.array(z.string().uuid()).min(1, "Lot harus berisi minimal satu pembelian"),
});

/** Available weight (in the lot's product form) from its purchases after conversion. */
export async function lotBalance(orgId: string, lotId: string) {
  const [lot, org] = await Promise.all([
    prisma.lot.findFirstOrThrow({ where: { id: lotId, orgId }, include: { purchases: { include: { purchase: true } } } }),
    prisma.organization.findUniqueOrThrow({ where: { id: orgId } }),
  ]);
  const conv = parseSettings(org.settings).conversion;
  const availableKg = round2(lot.purchases.reduce((a, lp) => a + convertKg(num(lp.purchase.weightKg), lp.purchase.form, lot.productForm, conv), 0));
  const weightKg = num(lot.weightKg);
  return { lot, availableKg, weightKg, overKg: round2(Math.max(0, weightKg - availableKg)), exceeds: weightKg > availableKg + 1e-6 };
}

async function checkPurchases(ctx: Ctx, ids: string[], lotId?: string) {
  const purchases = await prisma.purchase.findMany({ where: { id: { in: ids }, orgId: ctx.orgId }, include: { lots: true } });
  if (purchases.length !== new Set(ids).size) throw notFound("Sebagian pembelian tidak ditemukan");
  const taken = purchases.filter((p) => p.lots.some((l) => l.lotId !== lotId));
  if (taken.length) throw conflict(`${taken.length} pembelian sudah masuk lot lain`);
  return purchases;
}

export async function createLot(ctx: Ctx, input: unknown) {
  const d = lotSchema.parse(input);
  if (await prisma.lot.findFirst({ where: { orgId: ctx.orgId, code: d.code } })) throw conflict("Kode lot sudah dipakai");
  await checkPurchases(ctx, d.purchaseIds);
  const lot = await prisma.lot.create({ data: { orgId: ctx.orgId, code: d.code, productForm: d.productForm, weightKg: d.weightKg, createdBy: ctx.userId } });
  await prisma.lotPurchase.createMany({ data: d.purchaseIds.map((purchaseId) => ({ lotId: lot.id, purchaseId })) });
  return { ...lot, ...(await lotBalance(ctx.orgId, lot.id)), lot: undefined };
}

export async function updateLot(ctx: Ctx, id: string, input: unknown) {
  const lot = await prisma.lot.findFirst({ where: { id, orgId: ctx.orgId } });
  if (!lot) throw notFound("Lot tidak ditemukan");
  if (lot.lockedAt) throw conflict("Lot sudah dikunci dan tidak dapat diubah");
  const d = lotSchema.partial().parse(input);
  if (d.code && d.code !== lot.code && (await prisma.lot.findFirst({ where: { orgId: ctx.orgId, code: d.code } }))) throw conflict("Kode lot sudah dipakai");
  if (d.purchaseIds) {
    await checkPurchases(ctx, d.purchaseIds, id);
    await prisma.lotPurchase.deleteMany({ where: { lotId: id, purchaseId: { notIn: d.purchaseIds } } });
    const existing = new Set((await prisma.lotPurchase.findMany({ where: { lotId: id } })).map((x) => x.purchaseId));
    const add = d.purchaseIds.filter((p) => !existing.has(p));
    if (add.length) await prisma.lotPurchase.createMany({ data: add.map((purchaseId) => ({ lotId: id, purchaseId })) });
  }
  await prisma.lot.update({ where: { id }, data: { code: d.code, productForm: d.productForm, weightKg: d.weightKg } });
  return lotBalance(ctx.orgId, id);
}

/** F4.4 — a lot cannot be locked while its weight exceeds the converted purchase total. */
export async function lockLot(ctx: Ctx, id: string) {
  const exists = await prisma.lot.findFirst({ where: { id, orgId: ctx.orgId } });
  if (!exists) throw notFound("Lot tidak ditemukan");
  if (exists.lockedAt) return exists;
  const b = await lotBalance(ctx.orgId, id);
  if (b.exceeds) {
    throw unprocessable(`Berat lot ${b.weightKg} kg melebihi total pembelian setelah konversi ${b.availableKg} kg (kelebihan ${b.overKg} kg)`);
  }
  return prisma.lot.update({ where: { id }, data: { lockedAt: new Date() } });
}

export async function deleteLot(ctx: Ctx, id: string) {
  const lot = await prisma.lot.findFirst({ where: { id, orgId: ctx.orgId }, include: { shipments: true } });
  if (!lot) throw notFound();
  if (lot.lockedAt) throw conflict("Lot terkunci tidak dapat dihapus");
  await prisma.lot.delete({ where: { id } });
}

export async function getLot(ctx: Ctx, id: string) {
  const lot = await prisma.lot.findFirst({
    where: { id, orgId: ctx.orgId },
    include: {
      purchases: { include: { purchase: { include: { farmer: { select: { id: true, fullName: true } }, plot: { select: { id: true, label: true, riskStatus: true, declaredAreaHa: true } } } } } },
      shipments: { include: { shipment: { select: { id: true, reference: true, status: true } } } },
    },
  });
  if (!lot) throw notFound("Lot tidak ditemukan");
  const b = await lotBalance(ctx.orgId, id);
  const plots = new Map<string, { id: string; label: string | null; riskStatus: string; farmer: string }>();
  for (const lp of lot.purchases) plots.set(lp.purchase.plot.id, { ...lp.purchase.plot, farmer: lp.purchase.farmer.fullName });
  return { ...lot, availableKg: b.availableKg, exceeds: b.exceeds, overKg: b.overKg, originPlots: [...plots.values()] };
}

export async function listLots(ctx: Ctx) {
  const lots = await prisma.lot.findMany({
    where: { orgId: ctx.orgId },
    orderBy: { createdAt: "desc" },
    include: {
      purchases: { include: { purchase: { select: { plotId: true, weightKg: true, form: true, date: true } } } },
      shipments: { include: { shipment: { select: { id: true, reference: true } } } },
    },
  });
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: ctx.orgId } });
  const conv = parseSettings(org.settings).conversion;
  return lots.map((l) => {
    const availableKg = round2(l.purchases.reduce((a, lp) => a + convertKg(num(lp.purchase.weightKg), lp.purchase.form, l.productForm, conv), 0));
    return { ...l, availableKg, exceeds: num(l.weightKg) > availableKg + 1e-6, plotCount: new Set(l.purchases.map((p) => p.purchase.plotId)).size };
  });
}

/** Suggest the next lot code: LOT-YYYYMM-NNN */
export async function nextLotCode(ctx: Ctx) {
  const d = new Date();
  const prefix = `LOT-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}-`;
  const n = await prisma.lot.count({ where: { orgId: ctx.orgId, code: { startsWith: prefix } } });
  return `${prefix}${String(n + 1).padStart(3, "0")}`;
}

// ------------------------------------------------------------------ shipment ↔ lots (F5.1, D15)

export async function linkLots(ctx: Ctx, shipmentId: string, input: unknown) {
  const { lotIds } = z.object({ lotIds: z.array(z.string().uuid()).min(1) }).parse(input);
  const shipment = await getShipmentOr404(ctx, shipmentId);
  const lots = await prisma.lot.findMany({ where: { id: { in: lotIds }, orgId: ctx.orgId } });
  if (lots.length !== new Set(lotIds).size) throw notFound("Sebagian lot tidak ditemukan");
  const unlocked = lots.filter((l) => !l.lockedAt);
  if (unlocked.length) throw unprocessable(`Kunci lot terlebih dahulu: ${unlocked.map((l) => l.code).join(", ")}`);
  const existing = await prisma.shipmentLot.findMany({ where: { shipmentId } });
  const add = lotIds.filter((id) => !existing.some((e) => e.lotId === id));
  if (add.length) await prisma.shipmentLot.createMany({ data: add.map((lotId) => ({ shipmentId, lotId })) });
  return afterLotChange(ctx, shipment.id, shipment.lastValidatedAt);
}

export async function unlinkLot(ctx: Ctx, shipmentId: string, lotId: string) {
  const shipment = await getShipmentOr404(ctx, shipmentId);
  const link = await prisma.shipmentLot.findFirst({ where: { shipmentId, lotId } });
  if (!link) throw badRequest("Lot tidak tertaut");
  await prisma.shipmentLot.deleteMany({ where: { shipmentId, lotId } });
  return afterLotChange(ctx, shipment.id, shipment.lastValidatedAt);
}

async function afterLotChange(ctx: Ctx, shipmentId: string, validatedAt: Date | null) {
  // D15 depends on linked lots — keep findings fresh
  const job = validatedAt ? await enqueueJob(ctx.orgId, ctx.userId, "validate_shipment", { shipmentId }) : null;
  return { ok: true, jobId: job?.id ?? null };
}

export function formLabel(f: ProductForm) {
  return { CHERRY: "Ceri", PARCHMENT: "Gabah", GREEN: "Green bean" }[f];
}
