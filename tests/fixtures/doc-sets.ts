/**
 * Five synthetic export document sets (BRD M1). Each set lists the documents as "Label: value"
 * lines (rendered to PDF by the generator) and the discrepancies a correct validator must report.
 * All companies, numbers and people are fictitious.
 */
import type { DocumentType, PaymentMethod } from "@/generated/prisma/enums";

export type FixtureDoc = { type: DocumentType; title: string; lines: [string, string][] };
export type FixtureSet = {
  key: string;
  description: string;
  paymentMethod: PaymentMethod;
  presentationDate: string;
  docs: FixtureDoc[];
  /** rule ids expected to raise ERROR/WARNING findings (may repeat for distinct problems) */
  expected: string[];
};

const EXPORTER = "PT Kopi Nusantara Ekspor";
const EXPORTER_ADDR = "Jl. Gatot Subroto No. 21, Medan 20112, Indonesia";
const BUYER = "Hanseatic Coffee Traders GmbH";
const BUYER_ADDR = "Am Sandtorkai 48, 20457 Hamburg, Germany";
const DESC = "Indonesian Arabica Green Coffee Beans Grade 1, Sumatra Mandheling, crop 2026";

type Over = Partial<Record<string, string>>;

function base(o: Over = {}) {
  const v = {
    exporter: EXPORTER, exporterAddr: EXPORTER_ADDR, buyer: BUYER, buyerAddr: BUYER_ADDR, desc: DESC,
    hs: "0901.11.10", net: "19,200.00 kg", gross: "19,520.00 kg", bags: "320", containers: "MSKU 123456-5", seals: "ML-4471902",
    pol: "Belawan, Indonesia", pod: "Hamburg, Germany", incoterm: "FOB Belawan", lcNo: "DC-HH-2026-0815",
    contractNo: "SC-KNE-2026-041", currency: "USD", invAmount: "USD 98,400.00", lcAmount: "USD 100,000.00",
    onBoard: "2026-11-03", latest: "2026-11-15", expiry: "2026-12-10", invDate: "2026-11-02",
    phytoDate: "2026-10-31", cooDate: "2026-11-01", pebDate: "2026-10-30",
    ...o,
  };
  return v;
}

function lcSet(o: Over = {}, docs: DocumentType[] = ["LC", "INVOICE", "PACKING_LIST", "BILL_OF_LADING", "COO", "PHYTO", "PEB"]): FixtureDoc[] {
  const v = base(o);
  const all: Record<DocumentType, FixtureDoc> = {
    LC: {
      type: "LC", title: "IRREVOCABLE DOCUMENTARY CREDIT (MT700)", lines: [
        ["Documentary Credit No", v.lcNo], ["Date of Issue", "2026-10-01"], ["Expiry Date", v.expiry],
        ["Applicant", v.buyer], ["Applicant Address", v.buyerAddr], ["Beneficiary", v.exporter], ["Beneficiary Address", v.exporterAddr],
        ["Currency", v.currency], ["Credit Amount", v.lcAmount], ["Port of Loading", v.pol], ["Port of Discharge", v.pod],
        ["Latest Shipment Date", v.latest], ["Incoterms", v.incoterm], ["Description of Goods", v.desc],
        ["Documents Required", "Commercial Invoice; Packing List; Full set clean on board Bill of Lading; Certificate of Origin; Phytosanitary Certificate"],
        ["Period for Presentation", "21 days"],
      ],
    },
    CONTRACT: {
      type: "CONTRACT", title: "SALES CONTRACT", lines: [
        ["Contract No", v.contractNo], ["Date", "2026-09-20"], ["Seller", v.exporter], ["Seller Address", v.exporterAddr],
        ["Buyer", v.buyer], ["Buyer Address", v.buyerAddr], ["Description of Goods", v.desc], ["HS Code", v.hs],
        ["Currency", v.currency], ["Contract Value", v.lcAmount], ["Incoterms", v.incoterm], ["Port of Loading", v.pol],
        ["Port of Discharge", v.pod], ["Latest Shipment Date", v.latest],
        ["Required Documents", "Commercial Invoice; Packing List; Bill of Lading; Certificate of Origin; Phytosanitary Certificate; PEB"],
      ],
    },
    INVOICE: {
      type: "INVOICE", title: "COMMERCIAL INVOICE", lines: [
        ["Invoice No", "INV-KNE-2026-118"], ["Invoice Date", v.invDate], ["Exporter", v.exporter], ["Exporter Address", v.exporterAddr],
        ["Consignee", v.buyer], ["Consignee Address", v.buyerAddr], ["Description of Goods", v.desc], ["HS Code", v.hs],
        ["Number of Packages", `${v.bags} bags`], ["Net Weight", v.net], ["Gross Weight", v.gross], ["Incoterms", v.incoterm],
        ["L/C No", v.lcNo], ["Contract No", v.contractNo], ["Port of Loading", v.pol], ["Port of Discharge", v.pod], ["Total Amount", v.invAmount],
      ],
    },
    PACKING_LIST: {
      type: "PACKING_LIST", title: "PACKING LIST", lines: [
        ["Packing List No", "PL-KNE-2026-118"], ["Date", v.invDate], ["Exporter", v.exporter], ["Consignee", v.buyer],
        ["Consignee Address", v.buyerAddr], ["Description of Goods", "Green Coffee Beans, Arabica"], ["HS Code", v.hs],
        ["Number of Packages", `${v.bags} jute bags x 60 kg`], ["Net Weight", v.net], ["Gross Weight", v.gross],
        ["Container No", v.containers], ["Seal No", v.seals],
      ],
    },
    BILL_OF_LADING: {
      type: "BILL_OF_LADING", title: "BILL OF LADING", lines: [
        ["B/L No", "MAEU-BLW-778812"], ["Shipper", v.exporter], ["Consignee", v.buyer], ["Consignee Address", v.buyerAddr],
        ["Notify Party", "Same as consignee"], ["Ocean Vessel", "MAERSK BELAWAN V.412W"], ["Port of Loading", v.pol],
        ["Port of Discharge", v.pod], ["Shipped on Board", v.onBoard], ["Container No", v.containers], ["Seal No", v.seals],
        ["Number of Packages", `${v.bags} bags`], ["Description of Goods", "Green Coffee Beans"], ["HS Code", v.hs],
        ["Gross Weight", v.gross], ["Net Weight", v.net], ["Freight", "Freight collect"],
      ],
    },
    COO: {
      type: "COO", title: "CERTIFICATE OF ORIGIN / SURAT KETERANGAN ASAL", lines: [
        ["Certificate No", "SKA-0012345/MDN/2026"], ["Date of Issue", v.cooDate], ["Exporter", v.exporter], ["Consignee", v.buyer],
        ["Consignee Address", v.buyerAddr], ["Description of Goods", "Green Coffee Beans, Arabica"], ["HS Code", v.hs],
        ["Net Weight", v.net], ["Port of Loading", v.pol], ["Port of Discharge", v.pod],
      ],
    },
    PHYTO: {
      type: "PHYTO", title: "PHYTOSANITARY CERTIFICATE", lines: [
        ["Certificate No", "KT-2026-MDN-55821"], ["Date of Issue", v.phytoDate], ["Exporter", v.exporter], ["Consignee", v.buyer],
        ["Consignee Address", v.buyerAddr], ["Description of Goods", "Coffee beans (Coffea arabica), green"], ["Net Weight", v.net],
        ["Port of Loading", v.pol], ["Port of Discharge", v.pod],
      ],
    },
    PEB: {
      type: "PEB", title: "PEMBERITAHUAN EKSPOR BARANG (PEB)", lines: [
        ["Nomor Pendaftaran", "PEB-010203-2026"], ["Tanggal", v.pebDate], ["Eksportir", v.exporter], ["Pembeli", v.buyer],
        ["HS Code", v.hs], ["Number of Packages", v.bags], ["Net Weight", v.net], ["Gross Weight", v.gross],
        ["Pelabuhan Muat", v.pol], ["Pelabuhan Tujuan", v.pod], ["Currency", v.currency], ["Nilai", v.invAmount],
      ],
    },
    OTHER: { type: "OTHER", title: "OTHER", lines: [] },
  };
  return docs.map((t) => all[t]);
}

export const FIXTURE_SETS: FixtureSet[] = [
  {
    key: "set1-lc-clean",
    description: "L/C, semua dokumen konsisten",
    paymentMethod: "LC",
    presentationDate: "2026-11-10",
    docs: lcSet(),
    expected: [],
  },
  {
    key: "set2-lc-weights-containers",
    description: "L/C — berat B/L beda, kontainer B/L beda, pengapalan terlambat, invoice > L/C, alamat consignee beda di COO",
    paymentMethod: "LC",
    presentationDate: "2026-11-25",
    docs: (() => {
      const docs = lcSet({ onBoard: "2026-11-18", invAmount: "USD 101,250.00", phytoDate: "2026-11-14", cooDate: "2026-11-15" });
      const bl = docs.find((d) => d.type === "BILL_OF_LADING")!;
      bl.lines = bl.lines.map(([k, v]) => [k, k === "Gross Weight" ? "19,980.00 kg" : k === "Container No" ? "MSKU 654321-0" : v]);
      const coo = docs.find((d) => d.type === "COO")!;
      coo.lines = coo.lines.map(([k, v]) => [k, k === "Consignee Address" ? "Bahnhofstrasse 5, 8001 Zurich, Switzerland" : v]);
      return docs;
    })(),
    expected: ["D04", "D06", "D09", "D11", "D02"],
  },
  {
    key: "set3-tt-clean",
    description: "T/T dengan kontrak, semua konsisten",
    paymentMethod: "TT",
    presentationDate: "2026-11-10",
    docs: lcSet({ incoterm: "FOB Belawan" }, ["CONTRACT", "INVOICE", "PACKING_LIST", "BILL_OF_LADING", "COO", "PHYTO", "PEB"]),
    expected: [],
  },
  {
    key: "set4-tt-many",
    description: "T/T — nama eksportir beda, HS 0902, pelabuhan bongkar beda, phyto tidak ada, COO terlalu awal, incoterm beda, jumlah karung beda",
    paymentMethod: "TT",
    presentationDate: "2026-11-10",
    docs: (() => {
      const docs = lcSet({ cooDate: "2026-08-01" }, ["CONTRACT", "INVOICE", "PACKING_LIST", "BILL_OF_LADING", "COO", "PEB"]);
      const inv = docs.find((d) => d.type === "INVOICE")!;
      inv.lines = inv.lines.map(([k, v]) => [k, k === "Exporter" ? "PT Kopi Nusa Ekspor" : k === "Incoterms" ? "CIF Hamburg" : v]);
      const peb = docs.find((d) => d.type === "PEB")!;
      peb.lines = peb.lines.map(([k, v]) => [k, k === "HS Code" ? "0902.30.00" : v]);
      const bl = docs.find((d) => d.type === "BILL_OF_LADING")!;
      bl.lines = bl.lines.map(([k, v]) => [k, k === "Port of Discharge" ? "Antwerp, Belgium" : k === "Number of Packages" ? "318 bags" : v]);
      return docs;
    })(),
    expected: ["D01", "D07", "D08", "D14", "D13", "D12", "D05"],
  },
  {
    key: "set5-lc-description-late",
    description: "L/C — invoice menyebut Robusta, presentasi terlambat (>21 hari)",
    paymentMethod: "LC",
    presentationDate: "2026-12-01",
    docs: (() => {
      const docs = lcSet();
      const inv = docs.find((d) => d.type === "INVOICE")!;
      inv.lines = inv.lines.map(([k, v]) => [k, k === "Description of Goods" ? "Indonesian Robusta Green Coffee Beans Grade 4, Lampung" : v]);
      return docs;
    })(),
    expected: ["D03", "D10"],
  },
];

/** Render a fixture doc as plain text (one "Label: value" per line). */
export const fixtureText = (d: FixtureDoc) => [d.title, "", ...d.lines.map(([k, v]) => `${k}: ${v}`)].join("\n");
