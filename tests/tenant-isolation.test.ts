/**
 * N5 — tenant isolation: every service is scoped by orgId; organisation B must never read or
 * change organisation A's data, through services or through the HTTP layer.
 */
import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { signSession } from "@/lib/auth/session";
import { getJob } from "@/lib/jobs";
import { correctFields, getDocumentFields, readDocumentFile, uploadDocument } from "@/server/documents";
import { addEvidence, createFarmer, createPlot, getFarmer, getPlot, listFarmers, listPlots, updateFarmer, updatePlot } from "@/server/farmers";
import { createLot, createPurchase, getLot, linkLots, listLots, listPurchases, lockLot } from "@/server/lots";
import { createShareLink, getPackFile, listPacks } from "@/server/packs";
import { decideRiskCheck, listRiskChecks, requestRiskCheck } from "@/server/risk";
import { createShipment, getShipmentDetail, listFindings, listShipments, requestValidation, runValidation, updateFinding, updateShipment } from "@/server/shipments";
import { listAuditLogs, listUsers } from "@/server/org";
import { fieldSnapshot, syncBatch } from "@/server/sync";
import { GET as filesGET } from "@/app/api/v1/files/[...key]/route";
import { GET as shipmentGET } from "@/app/api/v1/shipments/[id]/route";
import { FIXTURE_SETS } from "./fixtures/doc-sets";
import { renderFixturePdf } from "./fixtures/render-pdf";
import { as, makeOrg } from "./helpers";

async function orgWithData() {
  const { ctx, user } = await makeOrg("ADMIN");
  const farmer = await as(ctx, () => createFarmer(ctx, { fullName: "Petani Rahasia", village: "A", district: "B", regency: "C", province: "D", consent: true }));
  const plot = await as(ctx, () => createPlot(ctx, { farmerId: farmer.id, declaredAreaHa: 1, point: { type: "Point", coordinates: [98.3, 2.7] } }));
  const ev = await as(ctx, () => addEvidence(ctx, plot.id, { type: "SHM" }, [new File([Buffer.from([0xff, 0xd8, 0xff])], "a.jpg", { type: "image/jpeg" })]));
  const purchase = await as(ctx, () => createPurchase(ctx, { farmerId: farmer.id, plotId: plot.id, date: "2026-10-01", weightKg: 100, form: "GREEN" }));
  const lot = await as(ctx, () => createLot(ctx, { code: "LOT-ISO", productForm: "GREEN", weightKg: 100, purchaseIds: [purchase.id] }));
  const shipment = await as(ctx, () => createShipment(ctx, { reference: "SHP-ISO", buyerName: "Buyer GmbH", buyerCountry: "DE", portLoading: "Belawan", portDischarge: "Hamburg", paymentMethod: "TT" }));
  const d = FIXTURE_SETS[0]!.docs[1]!;
  const up = await as(ctx, async () => uploadDocument(ctx, shipment.id, new File([Buffer.from(await renderFixturePdf(d))], "inv.pdf", { type: "application/pdf" })));
  await as(ctx, () => runValidation(ctx.orgId, shipment.id, ctx.userId));
  const finding = await prisma.finding.findFirstOrThrow({ where: { shipmentId: shipment.id } });
  const check = await prisma.riskCheck.findFirstOrThrow({ where: { plotId: plot.id } });
  return { ctx, user, farmer, plot, ev, purchase, lot, shipment, doc: up.document, jobId: up.jobId, finding, check };
}

describe("N5 tenant isolation — services", () => {
  it("org B cannot list, read, or modify org A data", async () => {
    const a = await orgWithData();
    const { ctx: b } = await makeOrg("ADMIN");
    const nf = { status: 404 };

    // lists are scoped
    expect(await listFarmers(b)).toHaveLength(0);
    expect(await listPlots(b)).toHaveLength(0);
    expect(await listShipments(b)).toHaveLength(0);
    expect(await listPurchases(b)).toHaveLength(0);
    expect(await listLots(b)).toHaveLength(0);
    expect(await listPacks(b)).toHaveLength(0);
    expect((await listUsers(b)).every((u) => u.id !== a.user.id)).toBe(true);
    expect((await listAuditLogs(b, {})).items.every((l) => l.orgId === b.orgId || l.orgId === null)).toBe(true);
    expect((await fieldSnapshot(b)).farmers).toHaveLength(0);

    // direct reads by id
    await expect(getFarmer(b, a.farmer.id)).rejects.toMatchObject(nf);
    await expect(getPlot(b, a.plot.id)).rejects.toMatchObject(nf);
    await expect(listRiskChecks(b, a.plot.id)).rejects.toMatchObject(nf);
    await expect(getShipmentDetail(b, a.shipment.id)).rejects.toMatchObject(nf);
    await expect(listFindings(b, a.shipment.id)).rejects.toMatchObject(nf);
    await expect(getDocumentFields(b, a.doc.id)).rejects.toMatchObject(nf);
    await expect(readDocumentFile(b, a.doc.id)).rejects.toMatchObject(nf);
    await expect(getLot(b, a.lot.id)).rejects.toMatchObject(nf);
    expect(await getJob(b.orgId, a.jobId)).toBeNull();

    // writes by id
    await expect(as(b, () => updateFarmer(b, a.farmer.id, { fullName: "x y" }))).rejects.toMatchObject(nf);
    await expect(as(b, () => updatePlot(b, a.plot.id, { label: "x" }))).rejects.toMatchObject(nf);
    await expect(as(b, () => addEvidence(b, a.plot.id, { type: "NONE" }))).rejects.toMatchObject(nf);
    await expect(as(b, () => requestRiskCheck(b, a.plot.id))).rejects.toMatchObject(nf);
    await expect(as(b, () => decideRiskCheck(b, a.plot.id, a.check.id, { decision: "PASS", note: "mencoba lintas tenant" }))).rejects.toMatchObject(nf);
    await expect(as(b, () => updateShipment(b, a.shipment.id, { buyerName: "hack" }))).rejects.toMatchObject(nf);
    await expect(as(b, () => requestValidation(b, a.shipment.id))).rejects.toMatchObject(nf);
    await expect(as(b, () => correctFields(b, a.doc.id, { fields: [{ name: "amount", value: "1" }] }))).rejects.toMatchObject(nf);
    await expect(as(b, () => updateFinding(b, a.finding.id, { status: "ACCEPTED", acceptReason: "cross tenant" }))).rejects.toMatchObject(nf);
    await expect(as(b, () => lockLot(b, a.lot.id))).rejects.toMatchObject(nf);
    await expect(as(b, () => createLot(b, { code: "STEAL", productForm: "GREEN", weightKg: 1, purchaseIds: [a.purchase.id] }))).rejects.toMatchObject(nf);
    await expect(as(b, () => createPurchase(b, { farmerId: a.farmer.id, plotId: a.plot.id, date: "2026-10-01", weightKg: 1, form: "GREEN" }))).rejects.toMatchObject({ status: 422 });
    await expect(as(b, () => uploadDocument(b, a.shipment.id, new File(["%PDF-1.4"], "x.pdf", { type: "application/pdf" })))).rejects.toMatchObject(nf);
    await expect(getPackFile(b.orgId, "00000000-0000-0000-0000-000000000000", "pdf")).rejects.toMatchObject(nf);
    await expect(as(b, () => createShareLink(b, "00000000-0000-0000-0000-000000000000", {}))).rejects.toMatchObject(nf);

    // b's shipment cannot link a's lot
    const sb = await as(b, () => createShipment(b, { reference: "SHP-B", buyerName: "Buyer GmbH", buyerCountry: "DE", portLoading: "Belawan", portDischarge: "Hamburg", paymentMethod: "TT" }));
    await expect(as(b, () => linkLots(b, sb.id, { lotIds: [a.lot.id] }))).rejects.toMatchObject(nf);

    // sync cannot reference or overwrite another org's records
    const r = await as(b, () => syncBatch(b, { ops: [{ opId: `op-iso-${Date.now()}`, type: "evidence.create", clientId: "e-iso", data: { plotId: a.plot.id, type: "NONE" } }] }));
    expect(r.results[0]!.ok).toBe(false);
    const r2 = await as(b, () => syncBatch(b, { ops: [{ opId: `op-iso2-${Date.now()}`, type: "evidence.create", clientId: "e-iso2", data: { plotId: a.plot.id, type: "SHM", photoKeys: [a.ev.photoKeys[0]] } }] }));
    expect(r2.results[0]!.ok).toBe(false);

    // nothing of A changed
    expect((await prisma.farmer.findUniqueOrThrow({ where: { id: a.farmer.id } })).fullName).toBe("Petani Rahasia");
    expect((await prisma.finding.findUniqueOrThrow({ where: { id: a.finding.id } })).status).toBe("OPEN");
  });
});

describe("N5 tenant isolation — HTTP layer", () => {
  const req = (url: string, token: string) => new NextRequest(new URL(url, "http://localhost"), { headers: { authorization: `Bearer ${token}` } });

  it("API returns 404 for another org's shipment and refuses another org's files", async () => {
    const a = await orgWithData();
    const { ctx: b } = await makeOrg("ADMIN");
    const tokenB = await signSession({ sub: b.userId, orgId: b.orgId, role: b.role });
    const tokenA = await signSession({ sub: a.ctx.userId, orgId: a.ctx.orgId, role: a.ctx.role });

    const resB = await shipmentGET(req(`/api/v1/shipments/${a.shipment.id}`, tokenB), { params: Promise.resolve({ id: a.shipment.id }) });
    expect(resB.status).toBe(404);
    const resA = await shipmentGET(req(`/api/v1/shipments/${a.shipment.id}`, tokenA), { params: Promise.resolve({ id: a.shipment.id }) });
    expect(resA.status).toBe(200);

    const key = a.ev.photoKeys[0]!.split("/");
    expect((await filesGET(req(`/api/v1/files/${key.join("/")}`, tokenB), { params: Promise.resolve({ key }) })).status).toBe(404);
    expect((await filesGET(req(`/api/v1/files/${key.join("/")}`, tokenA), { params: Promise.resolve({ key }) })).status).toBe(200);
    // path traversal is rejected
    const evil = [b.orgId, "..", a.ctx.orgId, ...key.slice(1)];
    expect((await filesGET(req("/api/v1/files/x", tokenB), { params: Promise.resolve({ key: evil }) })).status).toBe(404);
  });

  it("a token whose org claim was tampered with is rejected", async () => {
    const a = await orgWithData();
    const { ctx: b } = await makeOrg("ADMIN");
    const forged = await signSession({ sub: b.userId, orgId: a.ctx.orgId, role: "ADMIN" });
    const res = await shipmentGET(req(`/api/v1/shipments/${a.shipment.id}`, forged), { params: Promise.resolve({ id: a.shipment.id }) });
    expect(res.status).toBe(401);
  });
});
