import { describe, expect, it } from "vitest";
import type { Polygon } from "geojson";
import { prisma } from "@/lib/db";
import { sha256 } from "@/lib/crypto";
import { pdfPages } from "@/lib/docs/extract";
import { getObject } from "@/lib/storage";
import { uploadDocument } from "@/server/documents";
import { addEvidence, createFarmer, createPlot } from "@/server/farmers";
import { createLot, createPurchase, linkLots, lockLot } from "@/server/lots";
import { createShareLink, generatePack, packBlockers, publicPackFile, publicPackSummary, revokeShareLink } from "@/server/packs";
import { createDataset, decideRiskCheck } from "@/server/risk";
import { createShipment, runValidation, updateShipment } from "@/server/shipments";
import { FIXTURE_SETS } from "./fixtures/doc-sets";
import { renderFixturePdf } from "./fixtures/render-pdf";
import { as, makeOrg } from "./helpers";

const sq = (x: number, y: number, d: number): Polygon => ({ type: "Polygon", coordinates: [[[x, y], [x + d, y], [x + d, y + d], [x, y + d], [x, y]]] });
const JPEG = () => new File([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 9, 9, 9])], "shm.jpg", { type: "image/jpeg" });

/** Builds a shipment that is READY with one locked lot from two plots. */
async function readyShipment() {
  const { ctx } = await makeOrg("ADMIN", "PT Kopi Nusantara Ekspor");
  await as(ctx, () => createDataset({ ...ctx, role: "SUPER_ADMIN" }, { kind: "FOREST_COVER_2020", version: `pk-${Date.now()}`, name: "test" }, { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: sq(110, 0, 0.002) }] }));
  const farmer = await as(ctx, () => createFarmer(ctx, { fullName: "Pak Batara Sihombing", village: "Pegagan", district: "Sumbul", regency: "Dairi", province: "Sumatera Utara", consent: true }));
  const clean = await as(ctx, () => createPlot(ctx, { farmerId: farmer.id, label: "Kebun bersih", declaredAreaHa: 3, polygon: sq(98.32, 2.74, 0.01) }));
  const forested = await as(ctx, () => createPlot(ctx, { farmerId: farmer.id, label: "Kebun naungan", declaredAreaHa: 1, point: { type: "Point", coordinates: [110.001, 0.001] } }));
  for (const p of [clean, forested]) await as(ctx, () => addEvidence(ctx, p.id, { type: "SHM", documentNumber: `SHM-${p.id.slice(0, 4)}` }, [JPEG()]));
  const pu1 = await as(ctx, () => createPurchase(ctx, { farmerId: farmer.id, plotId: clean.id, date: "2026-09-10", weightKg: 15000, form: "GREEN" }));
  const pu2 = await as(ctx, () => createPurchase(ctx, { farmerId: farmer.id, plotId: forested.id, date: "2026-09-25", weightKg: 5000, form: "GREEN" }));
  const lot = await as(ctx, () => createLot(ctx, { code: "LOT-PK-1", productForm: "GREEN", weightKg: 20000, purchaseIds: [pu1.id, pu2.id] }));
  await as(ctx, () => lockLot(ctx, lot.id));

  const set = FIXTURE_SETS[0]!;
  const s = await as(ctx, () => createShipment(ctx, { reference: "SHP-PACK-1", buyerName: "Hanseatic Coffee Traders GmbH", buyerAddress: "Am Sandtorkai 48, 20457 Hamburg", buyerCountry: "DE", portLoading: "Belawan", portDischarge: "Hamburg", paymentMethod: "LC", presentationDate: set.presentationDate }));
  for (const d of set.docs) await as(ctx, async () => uploadDocument(ctx, s.id, new File([Buffer.from(await renderFixturePdf(d))], `${d.type}.pdf`, { type: "application/pdf" })));
  await as(ctx, () => linkLots(ctx, s.id, { lotIds: [lot.id] }));
  await as(ctx, () => runValidation(ctx.orgId, s.id, ctx.userId));
  return { ctx, shipment: s, clean, forested };
}

describe("evidence pack (F6.1–F6.3)", () => {
  it("is blocked until every origin plot passes or is verified (F6.2)", async () => {
    const { ctx, shipment, forested } = await readyShipment();
    expect((await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } })).status).toBe("READY");
    expect((await prisma.plot.findUniqueOrThrow({ where: { id: forested.id } })).riskStatus).toBe("RISK");
    const blockers = await packBlockers(ctx.orgId, shipment.id);
    expect(blockers.join(" ")).toMatch(/1 kebun asal belum LOLOS/);
    await expect(as(ctx, () => generatePack(ctx.orgId, shipment.id, ctx.userId))).rejects.toMatchObject({ status: 422 });

    const check = await prisma.riskCheck.findFirstOrThrow({ where: { plotId: forested.id }, orderBy: { createdAt: "desc" } });
    await as(ctx, () => decideRiskCheck(ctx, forested.id, check.id, { decision: "PASS", note: "Kebun kopi di bawah naungan, ditanam 2012 — diverifikasi lapangan." }));
    expect(await packBlockers(ctx.orgId, shipment.id)).toEqual([]);

    // generate: PDF + GeoJSON + JSON, hash printed in PDF, < 2 min
    const r = await as(ctx, () => generatePack(ctx.orgId, shipment.id, ctx.userId));
    expect(r).toMatchObject({ version: 1, reused: false });
    expect(r.durationMs).toBeLessThan(120_000);
    const pack = await prisma.evidencePack.findUniqueOrThrow({ where: { id: r.packId } });
    const pdfText = (await pdfPages(new Uint8Array(await getObject(pack.pdfKey)))).flat().map((l) => l.text).join("\n");
    expect(pdfText).toContain(pack.sha256);
    expect(pdfText).toContain("EUDR Evidence Pack");
    const geo = JSON.parse((await getObject(pack.geojsonKey)).toString());
    expect(geo.features).toHaveLength(2);
    const json = JSON.parse((await getObject(pack.jsonKey)).toString());
    expect(json).toMatchObject({ countryOfProduction: "ID", product: { hsCode: "0901", netWeightKg: 19200 }, harvestOrPurchasePeriod: { from: "2026-09-10", to: "2026-09-25" } });
    expect(json.plots.find((p: { label?: string; risk: { verification: unknown } }) => p.risk.verification)).toBeTruthy();
    expect(JSON.stringify(json)).not.toContain("Batara"); // farmer names are not shared
    expect(json.documentValidation.openErrors).toBe(0);

    // no data change → same version; data change → new version with new hash
    expect(await as(ctx, () => generatePack(ctx.orgId, shipment.id, ctx.userId))).toMatchObject({ version: 1, reused: true });
    await as(ctx, () => updateShipment(ctx, shipment.id, { productDescription: "Green coffee beans, Arabica, Sumatra Mandheling Grade 1" }));
    const v2 = await as(ctx, () => generatePack(ctx.orgId, shipment.id, ctx.userId));
    expect(v2.version).toBe(2);
    expect(v2.sha256).not.toBe(r.sha256);
  });
});

describe("share links (F6.4)", () => {
  it("stores only the token hash, logs every access, can be revoked, expires", async () => {
    const { ctx, shipment, forested } = await readyShipment();
    const check = await prisma.riskCheck.findFirstOrThrow({ where: { plotId: forested.id }, orderBy: { createdAt: "desc" } });
    await as(ctx, () => decideRiskCheck(ctx, forested.id, check.id, { decision: "PASS", note: "Diverifikasi lapangan: kopi naungan, bukan hutan." }));
    const { packId } = await as(ctx, () => generatePack(ctx.orgId, shipment.id, ctx.userId));

    const link = await as(ctx, () => createShareLink(ctx, packId, {}));
    const token = link.url.split("/p/")[1]!;
    const row = await prisma.shareLink.findUniqueOrThrow({ where: { id: link.id } });
    expect(row.tokenHash).toBe(sha256(token));
    expect(row.tokenHash).not.toContain(token);
    // default 90 days
    expect(Math.round((row.expiresAt.getTime() - Date.now()) / 864e5)).toBe(90);

    const summary = await publicPackSummary(token, { ip: "203.0.113.7", ua: "importer-test" });
    expect(summary.pack.version).toBe(1);
    await publicPackFile(token, "geojson", { ip: "203.0.113.7", ua: "importer-test" });
    expect((await prisma.shareLink.findUniqueOrThrow({ where: { id: link.id } })).accessCount).toBe(2);
    expect(await prisma.auditLog.count({ where: { entity: "shareLink", entityId: link.id, action: "ACCESS" } })).toBe(2);

    await as(ctx, () => revokeShareLink(ctx, link.id));
    await expect(publicPackSummary(token, {})).rejects.toMatchObject({ status: 410 });

    const short = await as(ctx, () => createShareLink(ctx, packId, { expiresInDays: 1 }));
    await prisma.shareLink.update({ where: { id: short.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await expect(publicPackSummary(short.url.split("/p/")[1]!, {})).rejects.toMatchObject({ status: 410 });
    await expect(publicPackSummary("x".repeat(43), {})).rejects.toMatchObject({ status: 404 });
  });
});
