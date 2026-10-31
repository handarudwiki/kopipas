import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { setJobMode } from "@/lib/jobs";
import { correctFields, uploadDocument } from "@/server/documents";
import { createShipment, refreshShipmentStatus, requestValidation, runValidation, updateFinding } from "@/server/shipments";
import { findingsReportPdf } from "@/server/report";
import { FIXTURE_SETS, type FixtureSet } from "./fixtures/doc-sets";
import { renderFixturePdf } from "./fixtures/render-pdf";
import { as, makeOrg } from "./helpers";

beforeAll(() => setJobMode("inline"));

async function setupSet(set: FixtureSet) {
  const { ctx } = await makeOrg("ADMIN");
  const shipment = await as(ctx, () =>
    createShipment(ctx, {
      reference: `SHP-${set.key}`, buyerName: "Hanseatic Coffee Traders GmbH", buyerCountry: "DE",
      portLoading: "Belawan", portDischarge: "Hamburg", hsCode: "0901.11", paymentMethod: set.paymentMethod,
      presentationDate: set.presentationDate,
    }),
  );
  for (const d of set.docs) {
    const bytes = await renderFixturePdf(d);
    const file = new File([Buffer.from(bytes)], `${d.type.toLowerCase()}.pdf`, { type: "application/pdf" });
    await as(ctx, () => uploadDocument(ctx, shipment.id, file));
  }
  return { ctx, shipment };
}

describe("M1 pipeline: upload → detect → extract → validate", () => {
  it("detects types and extracts fields from real PDFs with page + bbox", async () => {
    const { ctx, shipment } = await setupSet(FIXTURE_SETS[0]!);
    const docs = await prisma.document.findMany({ where: { shipmentId: shipment.id }, include: { fields: { where: { isCurrent: true } } } });
    expect(docs.map((d) => d.type).sort()).toEqual(FIXTURE_SETS[0]!.docs.map((d) => d.type).sort());
    const inv = docs.find((d) => d.type === "INVOICE")!;
    expect(inv.extractionStatus).toBe("DONE");
    expect(inv.pageCount).toBe(1);
    const net = inv.fields.find((f) => f.name === "net_weight_kg")!;
    expect(net.value).toBe("19200");
    expect(Number(net.confidence)).toBeGreaterThanOrEqual(0.8);
    expect(net.page).toBe(1);
    expect(net.bbox).toMatchObject({ x: expect.any(Number), y: expect.any(Number) });

    const job = await as(ctx, () => requestValidation(ctx, shipment.id));
    expect(job.status).toBe("DONE");
    const s = await prisma.shipment.findUniqueOrThrow({ where: { id: shipment.id } });
    // clean documents, but no lot linked yet → D15 keeps it from READY
    const open = await prisma.finding.findMany({ where: { shipmentId: shipment.id, status: "OPEN", severity: { in: ["ERROR", "WARNING"] } } });
    expect(open.map((f) => f.ruleId)).toEqual(["D15"]);
    expect(s.status).toBe("CHECKING");
    expect(s.rulesVersion).toMatch(/^doc-rules-/);
  });

  it("reaches expected recall on all 5 synthetic sets from PDFs (≥95%)", async () => {
    let expected = 0;
    let hit = 0;
    for (const set of FIXTURE_SETS) {
      const { ctx, shipment } = await setupSet(set);
      await as(ctx, () => runValidation(ctx.orgId, shipment.id, ctx.userId));
      const found = new Set(
        (await prisma.finding.findMany({ where: { shipmentId: shipment.id, status: "OPEN", severity: { in: ["ERROR", "WARNING"] } } }))
          .map((f) => f.ruleId)
          .filter((r) => r !== "D15"),
      );
      for (const r of set.expected) {
        expected++;
        if (found.has(r)) hit++;
      }
      if (!set.expected.length) expect([...found], set.key).toEqual([]);
    }
    expect(hit / expected).toBeGreaterThanOrEqual(0.95);
  });

  it("F5.4 correction creates a new version and re-validation resolves the finding", async () => {
    const { ctx, shipment } = await setupSet(FIXTURE_SETS[4]!); // invoice says Robusta
    await as(ctx, () => runValidation(ctx.orgId, shipment.id, ctx.userId));
    const d03 = () => prisma.finding.findMany({ where: { shipmentId: shipment.id, ruleId: "D03" } });
    expect((await d03()).every((f) => f.status === "OPEN")).toBe(true);

    const inv = await prisma.document.findFirstOrThrow({ where: { shipmentId: shipment.id, type: "INVOICE" } });
    await as(ctx, () => correctFields(ctx, inv.id, { fields: [{ name: "goods_description", value: "Indonesian Arabica Green Coffee Beans Grade 1, Sumatra Mandheling, crop 2026" }] }));

    const fields = await prisma.extractedField.findMany({ where: { documentId: inv.id, name: "goods_description" }, orderBy: { version: "asc" } });
    expect(fields).toHaveLength(2);
    expect(fields[0]!.isCurrent).toBe(false);
    expect(fields[1]).toMatchObject({ isCurrent: true, version: 2, correctedBy: ctx.userId });
    expect((await d03()).every((f) => f.status === "RESOLVED")).toBe(true);
  });

  it("F5.7 accepting a finding requires a reason; status READY only with no open ERROR", async () => {
    const { ctx, shipment } = await setupSet(FIXTURE_SETS[0]!);
    await as(ctx, () => runValidation(ctx.orgId, shipment.id, ctx.userId));
    const d15 = await prisma.finding.findFirstOrThrow({ where: { shipmentId: shipment.id, ruleId: "D15", status: "OPEN" } });
    await expect(as(ctx, () => updateFinding(ctx, d15.id, { status: "ACCEPTED", acceptReason: "" }))).rejects.toThrow();
    // manual RESOLVED is not allowed
    await expect(as(ctx, () => updateFinding(ctx, d15.id, { status: "RESOLVED" }))).rejects.toThrow();
    await as(ctx, () => updateFinding(ctx, d15.id, { status: "ACCEPTED", acceptReason: "Lot ditautkan setelah pilot (uji)" }));
    expect((await refreshShipmentStatus(ctx.orgId, shipment.id)).status).toBe("READY");
    // accepted decisions survive re-validation
    await as(ctx, () => runValidation(ctx.orgId, shipment.id, ctx.userId));
    expect((await prisma.finding.findUniqueOrThrow({ where: { id: d15.id } })).status).toBe("ACCEPTED");
  });

  it("N9 re-uploading the same file reuses cached extraction", async () => {
    const { ctx, shipment } = await setupSet({ ...FIXTURE_SETS[0]!, docs: [FIXTURE_SETS[0]!.docs[1]!] });
    const bytes = await renderFixturePdf(FIXTURE_SETS[0]!.docs[1]!);
    const file = new File([Buffer.from(bytes)], "again.pdf", { type: "application/pdf" });
    const r = await as(ctx, () => uploadDocument(ctx, shipment.id, file));
    const job = await prisma.job.findUniqueOrThrow({ where: { id: r.jobId } });
    expect(job.result).toMatchObject({ cached: true, type: "INVOICE" });
  });

  it("rejects non PDF/JPG/PNG uploads", async () => {
    const { ctx } = await makeOrg("DOC_STAFF");
    const s = await as(ctx, () => createShipment(ctx, { reference: "SHP-X", buyerName: "Buyer GmbH", buyerCountry: "DE", portLoading: "Belawan", portDischarge: "Hamburg", paymentMethod: "TT" }));
    const file = new File(["hello"], "x.txt", { type: "text/plain" });
    await expect(as(ctx, () => uploadDocument(ctx, s.id, file))).rejects.toMatchObject({ status: 400 });
  });

  it("F5.6 renders the findings report PDF", async () => {
    const { ctx, shipment } = await setupSet(FIXTURE_SETS[1]!);
    await as(ctx, () => runValidation(ctx.orgId, shipment.id, ctx.userId));
    const pdf = await findingsReportPdf(ctx, shipment.id);
    expect(Buffer.from(pdf).subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.byteLength).toBeGreaterThan(2000);
  });
});
