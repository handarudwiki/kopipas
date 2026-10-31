import { describe, expect, it } from "vitest";
import { evaluate, loadRuleSet } from "@/lib/rules/engine";
import { parseRequiredDocs } from "@/lib/rules/checks";
import type { DocFacts, ShipmentFacts } from "@/lib/rules/types";
import { labelExtractor, textToPages } from "@/lib/docs/extract";
import { detectDocumentType } from "@/lib/docs/detect";
import { normalizeName, parseDate, parseNumber } from "@/lib/docs/parse";
import { FIXTURE_SETS, fixtureText, type FixtureSet } from "./fixtures/doc-sets";

const SETTINGS = { weightTolerancePct: 0.5, presentationDays: 21, certMaxDaysBefore: 30, certMaxDaysAfter: 7 };

function factsFromSet(set: FixtureSet): ShipmentFacts {
  const docs: DocFacts[] = set.docs.map((d, i) => {
    const fields = Object.fromEntries(labelExtractor.extract(d.type, textToPages(fixtureText(d))).map((f) => [f.name, f.value]));
    return { id: `doc-${i}`, type: d.type, fields };
  });
  return { paymentMethod: set.paymentMethod, presentationDate: set.presentationDate, docs, shipmentNetWeightKg: 19200, lots: { count: 1, totalGreenKg: 20000 }, settings: SETTINGS };
}

const clean = () => factsFromSet(FIXTURE_SETS[0]!);
const cleanTT = () => factsFromSet(FIXTURE_SETS[2]!);
const doc = (f: ShipmentFacts, t: DocFacts["type"]) => f.docs.find((d) => d.type === t)!;
const ids = (f: ShipmentFacts, only?: string[]) => evaluate(f, loadRuleSet(), only).filter((x) => x.severity !== "INFO").map((x) => x.ruleId);

describe("parsers", () => {
  it("parses dates in trade formats", () => {
    expect(parseDate("03 Nov 2026")).toBe("2026-11-03");
    expect(parseDate("November 3, 2026")).toBe("2026-11-03");
    expect(parseDate("03/11/2026")).toBe("2026-11-03");
    expect(parseDate("2026-11-03")).toBe("2026-11-03");
    expect(parseDate("261103")).toBe("2026-11-03");
  });
  it("parses numbers in EN and ID formats", () => {
    expect(parseNumber("19,200.00 kg")).toBe(19200);
    expect(parseNumber("19.200,00")).toBe(19200);
    expect(parseNumber("USD 98,400.50")).toBe(98400.5);
    expect(parseNumber("320 bags")).toBe(320);
  });
  it("normalises company names (PT, Tbk, GmbH, punctuation)", () => {
    expect(normalizeName("PT. Kopi Nusantara Ekspor, Tbk")).toBe(normalizeName("Kopi Nusantara Ekspor"));
    expect(normalizeName("Hanseatic Coffee Traders GmbH")).toBe("hanseatic coffee traders");
  });
  it("maps L/C required documents to document types", () => {
    expect(parseRequiredDocs("Commercial Invoice; Packing List; Full set clean on board Bill of Lading; Certificate of Origin; Phytosanitary Certificate").sort())
      .toEqual(["BILL_OF_LADING", "COO", "INVOICE", "PACKING_LIST", "PHYTO"].sort());
  });
});

describe("document type detection (F5.2)", () => {
  it("detects every fixture document type from its text", () => {
    for (const set of FIXTURE_SETS) for (const d of set.docs) {
      expect(detectDocumentType(fixtureText(d)).type, d.title).toBe(d.type);
    }
  });
});

describe("extraction (F5.3)", () => {
  it("extracts fields with confidence and page", () => {
    const inv = FIXTURE_SETS[0]!.docs.find((d) => d.type === "INVOICE")!;
    const out = labelExtractor.extract("INVOICE", textToPages(fixtureText(inv)));
    const by = Object.fromEntries(out.map((f) => [f.name, f]));
    expect(by.exporter_name!.value).toBe("PT Kopi Nusantara Ekspor");
    expect(by.exporter_address!.value).toContain("Gatot Subroto");
    expect(by.net_weight_kg!.value).toBe("19200");
    expect(by.amount!.value).toBe("98400");
    expect(by.currency!.value).toBe("USD");
    expect(by.document_date!.value).toBe("2026-11-02");
    expect(by.net_weight_kg!.confidence).toBeGreaterThanOrEqual(0.8);
    expect(by.net_weight_kg!.page).toBe(1);
  });
  it("missing fields get confidence 0 (flagged for review)", () => {
    const out = labelExtractor.extract("INVOICE", textToPages("COMMERCIAL INVOICE\nInvoice No: X1"));
    expect(out.find((f) => f.name === "amount")).toMatchObject({ value: null, confidence: 0 });
  });
});

describe("clean sets raise no ERROR/WARNING", () => {
  it("L/C clean set", () => expect(ids(clean())).toEqual([]));
  it("T/T clean set", () => expect(ids(cleanTT())).toEqual([]));
});

describe("rules D01–D15", () => {
  it("D01 exporter name differs", () => {
    const f = clean();
    doc(f, "PACKING_LIST").fields.exporter_name = "CV Kopi Lain";
    expect(ids(f, ["D01"])).toEqual(["D01"]);
    // normalisation: legal-form and punctuation differences are not discrepancies
    doc(f, "PACKING_LIST").fields.exporter_name = "Kopi Nusantara Ekspor, PT.";
    expect(ids(f, ["D01"])).toEqual([]);
  });

  it("D02 consignee name or address inconsistent", () => {
    const f = clean();
    doc(f, "BILL_OF_LADING").fields.consignee_name = "Nordic Roasters AB";
    expect(ids(f, ["D02"])).toContain("D02");
    const g = clean();
    doc(g, "INVOICE").fields.consignee_address = "Rue de la Loi 1, Brussels";
    expect(ids(g, ["D02"])).toEqual(["D02"]);
  });

  it("D03 invoice description does not match L/C, or other doc contradicts", () => {
    const f = clean();
    doc(f, "INVOICE").fields.goods_description = "Coffee";
    expect(ids(f, ["D03"])).toContain("D03");
    const g = clean();
    doc(g, "BILL_OF_LADING").fields.goods_description = "Roasted Coffee Beans";
    expect(ids(g, ["D03"])).toEqual(["D03"]);
    // more general wording is allowed
    const h = clean();
    doc(h, "BILL_OF_LADING").fields.goods_description = "Coffee beans";
    expect(ids(h, ["D03"])).toEqual([]);
  });

  it("D03 only applies to L/C shipments", () => {
    const f = cleanTT();
    doc(f, "INVOICE").fields.goods_description = "Something else";
    expect(ids(f, ["D03"])).toEqual([]);
  });

  it("D04 weights outside tolerance", () => {
    const f = clean();
    doc(f, "PEB").fields.net_weight_kg = "19100";
    expect(ids(f, ["D04"])).toEqual(["D04"]);
    const g = clean();
    doc(g, "BILL_OF_LADING").fields.net_weight_kg = "19250"; // 0.26% < 0.5% tolerance
    expect(ids(g, ["D04"])).toEqual([]);
  });

  it("D05 package count differs between packing list and B/L", () => {
    const f = clean();
    doc(f, "BILL_OF_LADING").fields.packages_count = "319";
    expect(ids(f, ["D05"])).toEqual(["D05"]);
  });

  it("D06 container or seal numbers differ", () => {
    const f = clean();
    doc(f, "BILL_OF_LADING").fields.seal_numbers = "ML-0000001";
    expect(ids(f, ["D06"])).toEqual(["D06"]);
    const g = clean();
    doc(g, "BILL_OF_LADING").fields.container_numbers = "msku1234565"; // formatting only
    expect(ids(g, ["D06"])).toEqual([]);
  });

  it("D07 HS code not 0901 or inconsistent", () => {
    const f = clean();
    doc(f, "COO").fields.hs_code = "0902.10";
    expect(ids(f, ["D07"])).toContain("D07");
    const g = clean();
    doc(g, "PEB").fields.hs_code = "0901.12";
    expect(ids(g, ["D07"])).toEqual(["D07"]);
  });

  it("D08 ports differ from L/C", () => {
    const f = clean();
    doc(f, "BILL_OF_LADING").fields.port_loading = "Tanjung Priok, Jakarta";
    expect(ids(f, ["D08"])).toEqual(["D08"]);
    const g = clean();
    doc(g, "BILL_OF_LADING").fields.port_discharge = "HAMBURG";
    expect(ids(g, ["D08"])).toEqual([]);
  });

  it("D09 B/L date after latest shipment date", () => {
    const f = clean();
    doc(f, "BILL_OF_LADING").fields.shipped_on_board_date = "2026-11-16";
    expect(ids(f, ["D09"])).toEqual(["D09"]);
  });

  it("D10 presentation later than 21 days or after expiry", () => {
    const f = clean();
    f.presentationDate = "2026-11-25"; // 22 days after 2026-11-03
    expect(ids(f, ["D10"])).toEqual(["D10"]);
    const g = clean();
    g.presentationDate = "2026-11-24"; // exactly 21 days
    expect(ids(g, ["D10"])).toEqual([]);
    const h = clean();
    doc(h, "LC").fields.expiry_date = "2026-11-05";
    expect(ids(h, ["D10"])).toEqual(["D10"]);
  });

  it("D11 invoice exceeds L/C amount or currency differs", () => {
    const f = clean();
    doc(f, "INVOICE").fields.amount = "100000.01";
    expect(ids(f, ["D11"])).toEqual(["D11"]);
    const g = clean();
    doc(g, "INVOICE").fields.currency = "EUR";
    expect(ids(g, ["D11"])).toEqual(["D11"]);
  });

  it("D12 incoterm or L/C number missing / different (WARNING)", () => {
    const f = clean();
    doc(f, "INVOICE").fields.incoterm = "CIF Hamburg";
    const r = evaluate(f, loadRuleSet(), ["D12"]);
    expect(r.map((x) => x.ruleId)).toEqual(["D12"]);
    expect(r[0]!.severity).toBe("WARNING");
    const g = clean();
    doc(g, "INVOICE").fields.lc_number = null;
    expect(ids(g, ["D12"])).toEqual(["D12"]);
  });

  it("D13 certificate dates far from shipment (WARNING)", () => {
    const f = clean();
    doc(f, "PHYTO").fields.document_date = "2026-11-20"; // 17 days after shipment
    const r = evaluate(f, loadRuleSet(), ["D13"]);
    expect(r.map((x) => [x.ruleId, x.severity])).toEqual([["D13", "WARNING"]]);
  });

  it("D14 required documents missing", () => {
    const f = clean();
    f.docs = f.docs.filter((d) => d.type !== "PHYTO");
    const r = evaluate(f, loadRuleSet(), ["D14"]);
    expect(r).toHaveLength(1);
    expect(r[0]!.message).toContain("Fitosanitari");
    const g = clean();
    g.docs = g.docs.filter((d) => d.type !== "LC");
    expect(ids(g, ["D14"])).toEqual(["D14"]);
  });

  it("D15 shipment weight exceeds linked lots", () => {
    const f = clean();
    f.lots = { count: 2, totalGreenKg: 19000 };
    expect(ids(f, ["D15"])).toEqual(["D15"]);
    f.lots = { count: 2, totalGreenKg: 19200 };
    expect(ids(f, ["D15"])).toEqual([]);
    f.lots = { count: 0, totalGreenKg: 0 };
    expect(ids(f, ["D15"])).toEqual(["D15"]);
  });
});

describe("recall on the synthetic fixture sets (target ≥ 95%)", () => {
  it("finds every expected discrepancy and none in clean sets", () => {
    let expected = 0;
    let hit = 0;
    for (const set of FIXTURE_SETS) {
      const found = new Set(ids(factsFromSet(set)));
      for (const r of set.expected) {
        expected++;
        if (found.has(r)) hit++;
      }
      if (!set.expected.length) expect([...found], set.key).toEqual([]);
    }
    const recall = hit / expected;
    expect(recall).toBeGreaterThanOrEqual(0.95);
  });
});
