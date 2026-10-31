import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createFarmer, createPlot } from "@/server/farmers";
import { createLot, createPurchase, linkLots, lockLot, updateLot } from "@/server/lots";
import { createShipment, lotTotals, runValidation } from "@/server/shipments";
import { syncBatch } from "@/server/sync";
import { updateOrg, getOrg } from "@/server/org";
import { as, makeOrg } from "./helpers";

async function setup() {
  const { ctx } = await makeOrg("ADMIN");
  const farmer = await as(ctx, () => createFarmer(ctx, { fullName: "Pak Jonner Purba", village: "Sitinjo", district: "Sitinjo", regency: "Dairi", province: "Sumatera Utara", consent: true }));
  const plot = await as(ctx, () => createPlot(ctx, { farmerId: farmer.id, declaredAreaHa: 1.5, point: { type: "Point", coordinates: [98.31, 2.73] } }));
  return { ctx, farmer, plot };
}

describe("purchases (F4.1)", () => {
  it("must reference a registered plot of that farmer", async () => {
    const { ctx, farmer, plot } = await setup();
    await expect(as(ctx, () => createPurchase(ctx, { farmerId: farmer.id, date: "2026-10-01", weightKg: 100, form: "CHERRY" }))).rejects.toThrow();
    const other = await as(ctx, () => createFarmer(ctx, { fullName: "Orang Lain", village: "A", district: "B", regency: "C", province: "D", consent: true }));
    await expect(as(ctx, () => createPurchase(ctx, { farmerId: other.id, plotId: plot.id, date: "2026-10-01", weightKg: 100, form: "CHERRY" }))).rejects.toMatchObject({ status: 422 });
    const p = await as(ctx, () => createPurchase(ctx, { farmerId: farmer.id, plotId: plot.id, date: "2026-10-01", weightKg: 100, form: "CHERRY" }));
    expect(Number(p.weightKg)).toBe(100);
  });

  it("can be recorded offline via /sync, idempotently", async () => {
    const { ctx, farmer, plot } = await setup();
    const op = { opId: `op-${Date.now()}`, type: "purchase.create", clientId: `pu-${Date.now()}`, data: { farmerId: farmer.id, plotId: plot.id, date: "2026-10-02", weightKg: 250, form: "PARCHMENT" } };
    const a = await as(ctx, () => syncBatch(ctx, { ops: [op] }));
    expect(a.results[0]!.ok).toBe(true);
    await as(ctx, () => syncBatch(ctx, { ops: [{ ...op, opId: `${op.opId}-retry` }] }));
    expect(await prisma.purchase.count({ where: { orgId: ctx.orgId } })).toBe(1);
  });
});

describe("lots (F4.2–F4.4)", () => {
  it("stores origin plots and converts weight between forms; lock blocked on excess", async () => {
    const { ctx, farmer, plot } = await setup();
    // 1000 kg cherry → 160 kg green (default ratio 0.16); 200 kg parchment → 160 kg green
    const p1 = await as(ctx, () => createPurchase(ctx, { farmerId: farmer.id, plotId: plot.id, date: "2026-10-01", weightKg: 1000, form: "CHERRY" }));
    const p2 = await as(ctx, () => createPurchase(ctx, { farmerId: farmer.id, plotId: plot.id, date: "2026-10-03", weightKg: 200, form: "PARCHMENT" }));
    const lot = await as(ctx, () => createLot(ctx, { code: "LOT-T-1", productForm: "GREEN", weightKg: 330, purchaseIds: [p1.id, p2.id] }));
    expect(lot.availableKg).toBe(320);
    expect(lot.exceeds).toBe(true);
    await expect(as(ctx, () => lockLot(ctx, lot.id))).rejects.toMatchObject({ status: 422 });

    await as(ctx, () => updateLot(ctx, lot.id, { weightKg: 320 }));
    const locked = await as(ctx, () => lockLot(ctx, lot.id));
    expect(locked.lockedAt).toBeInstanceOf(Date);
    await expect(as(ctx, () => updateLot(ctx, lot.id, { weightKg: 1 }))).rejects.toMatchObject({ status: 409 });
  });

  it("conversion ratio is configurable per organisation (F4.3)", async () => {
    const { ctx, farmer, plot } = await setup();
    const org = await getOrg(ctx);
    await as(ctx, () => updateOrg(ctx, { settings: { ...org.settings, conversion: { CHERRY: 0.2, PARCHMENT: 0.8, GREEN: 1 } } }));
    const p = await as(ctx, () => createPurchase(ctx, { farmerId: farmer.id, plotId: plot.id, date: "2026-10-01", weightKg: 1000, form: "CHERRY" }));
    const lot = await as(ctx, () => createLot(ctx, { code: "LOT-T-2", productForm: "GREEN", weightKg: 200, purchaseIds: [p.id] }));
    expect(lot.availableKg).toBe(200);
    expect(lot.exceeds).toBe(false);
  });

  it("a purchase can only be in one lot", async () => {
    const { ctx, farmer, plot } = await setup();
    const p = await as(ctx, () => createPurchase(ctx, { farmerId: farmer.id, plotId: plot.id, date: "2026-10-01", weightKg: 100, form: "GREEN" }));
    await as(ctx, () => createLot(ctx, { code: "LOT-A", productForm: "GREEN", weightKg: 50, purchaseIds: [p.id] }));
    await expect(as(ctx, () => createLot(ctx, { code: "LOT-B", productForm: "GREEN", weightKg: 50, purchaseIds: [p.id] }))).rejects.toMatchObject({ status: 409 });
  });
});

describe("shipment ↔ lots (F5.1, D15)", () => {
  it("only locked lots can be linked; D15 compares shipment weight with linked lots", async () => {
    const { ctx, farmer, plot } = await setup();
    const p = await as(ctx, () => createPurchase(ctx, { farmerId: farmer.id, plotId: plot.id, date: "2026-10-01", weightKg: 19000, form: "GREEN" }));
    const lot = await as(ctx, () => createLot(ctx, { code: "LOT-S", productForm: "GREEN", weightKg: 19000, purchaseIds: [p.id] }));
    const s = await as(ctx, () => createShipment(ctx, { reference: "SHP-D15", buyerName: "Hanseatic Coffee Traders GmbH", buyerCountry: "DE", portLoading: "Belawan", portDischarge: "Hamburg", paymentMethod: "TT", netWeightKg: 19200 }));
    await expect(as(ctx, () => linkLots(ctx, s.id, { lotIds: [lot.id] }))).rejects.toMatchObject({ status: 422 });
    await as(ctx, () => lockLot(ctx, lot.id));
    await as(ctx, () => linkLots(ctx, s.id, { lotIds: [lot.id] }));
    expect(await lotTotals(ctx.orgId, s.id)).toMatchObject({ count: 1, totalGreenKg: 19000 });

    await as(ctx, () => runValidation(ctx.orgId, s.id, ctx.userId));
    const d15 = await prisma.finding.findFirst({ where: { shipmentId: s.id, ruleId: "D15", status: "OPEN" } });
    expect(d15?.message).toMatch(/19,200 kg melebihi total lot tertaut 19,000 kg/);
  });
});
