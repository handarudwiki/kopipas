import type { DocumentType } from "@/generated/prisma/enums";

/**
 * F5.3 — field schema per document type. Field names are shared across types so the rule engine
 * can compare like with like (e.g. `exporter_name` is the shipper on a B/L and the beneficiary on an L/C).
 */
export type FieldKind = "text" | "number" | "date" | "list" | "money";

export type FieldDef = {
  name: string;
  label: string;
  kind: FieldKind;
  /** label synonyms searched in the document text (lowercase) */
  synonyms: string[];
};

const F = (name: string, label: string, kind: FieldKind, synonyms: string[]): FieldDef => ({ name, label, kind, synonyms });

export const FIELDS = {
  document_number: F("document_number", "Nomor dokumen", "text", ["invoice no", "invoice number", "b/l no", "bill of lading no", "certificate no", "certificate number", "peb no", "nomor peb", "nomor pendaftaran", "packing list no", "document no"]),
  document_date: F("document_date", "Tanggal dokumen", "date", ["invoice date", "date of issue", "issue date", "date issued", "tanggal", "certificate date", "date"]),
  exporter_name: F("exporter_name", "Nama eksportir / beneficiary", "text", ["exporter", "shipper", "seller", "beneficiary", "eksportir", "consignor"]),
  exporter_address: F("exporter_address", "Alamat eksportir", "text", ["exporter address", "shipper address", "seller address", "beneficiary address"]),
  consignee_name: F("consignee_name", "Nama pembeli / consignee", "text", ["consignee", "buyer", "applicant", "importer", "pembeli"]),
  consignee_address: F("consignee_address", "Alamat pembeli / consignee", "text", ["consignee address", "buyer address", "applicant address", "importer address"]),
  goods_description: F("goods_description", "Deskripsi barang", "text", ["description of goods", "goods description", "description", "commodity", "uraian barang"]),
  hs_code: F("hs_code", "HS code", "text", ["hs code", "h.s. code", "hs", "pos tarif", "tariff code"]),
  net_weight_kg: F("net_weight_kg", "Berat bersih (kg)", "number", ["net weight", "nett weight", "berat bersih", "net wt"]),
  gross_weight_kg: F("gross_weight_kg", "Berat kotor (kg)", "number", ["gross weight", "berat kotor", "gross wt"]),
  packages_count: F("packages_count", "Jumlah kemasan", "number", ["number of packages", "no. of packages", "packages", "total bags", "jumlah kemasan", "bags"]),
  container_numbers: F("container_numbers", "Nomor kontainer", "list", ["container no", "container number", "container nos", "container", "nomor kontainer"]),
  seal_numbers: F("seal_numbers", "Nomor segel", "list", ["seal no", "seal number", "seal nos", "seal", "nomor segel"]),
  port_loading: F("port_loading", "Pelabuhan muat", "text", ["port of loading", "loading port", "pelabuhan muat", "pol"]),
  port_discharge: F("port_discharge", "Pelabuhan bongkar", "text", ["port of discharge", "discharge port", "pelabuhan bongkar", "pelabuhan tujuan", "pod"]),
  incoterm: F("incoterm", "Incoterm", "text", ["incoterm", "incoterms", "terms of delivery", "delivery terms"]),
  lc_number: F("lc_number", "Nomor L/C", "text", ["l/c no", "lc no", "l/c number", "documentary credit no", "credit number", "dc no"]),
  contract_number: F("contract_number", "Nomor kontrak", "text", ["contract no", "contract number", "sales contract", "nomor kontrak"]),
  currency: F("currency", "Mata uang", "text", ["currency", "mata uang"]),
  amount: F("amount", "Nilai", "money", ["total amount", "invoice amount", "amount", "credit amount", "contract value", "total value", "nilai"]),
  shipped_on_board_date: F("shipped_on_board_date", "Tanggal shipped on board", "date", ["shipped on board", "on board date", "date of shipment", "shipment date", "laden on board"]),
  vessel: F("vessel", "Kapal / voyage", "text", ["vessel", "ocean vessel", "vessel / voyage", "nama kapal"]),
  latest_shipment_date: F("latest_shipment_date", "Batas pengapalan terakhir", "date", ["latest shipment date", "latest date of shipment", "latest shipment"]),
  expiry_date: F("expiry_date", "Tanggal kedaluwarsa L/C", "date", ["expiry date", "date of expiry", "expiry"]),
  presentation_days: F("presentation_days", "Periode presentasi (hari)", "number", ["period for presentation", "presentation period", "documents to be presented within"]),
  required_documents: F("required_documents", "Dokumen yang disyaratkan", "list", ["documents required", "required documents", "dokumen yang disyaratkan"]),
} as const;

export type FieldName = keyof typeof FIELDS;

const pick = (...names: FieldName[]) => names.map((n) => FIELDS[n]);

export const DOC_SCHEMAS: Record<DocumentType, FieldDef[]> = {
  INVOICE: pick("document_number", "document_date", "exporter_name", "exporter_address", "consignee_name", "consignee_address", "goods_description", "hs_code", "net_weight_kg", "gross_weight_kg", "packages_count", "currency", "amount", "incoterm", "lc_number", "contract_number", "port_loading", "port_discharge"),
  PACKING_LIST: pick("document_number", "document_date", "exporter_name", "consignee_name", "consignee_address", "goods_description", "hs_code", "net_weight_kg", "gross_weight_kg", "packages_count", "container_numbers", "seal_numbers"),
  BILL_OF_LADING: pick("document_number", "exporter_name", "consignee_name", "consignee_address", "goods_description", "hs_code", "net_weight_kg", "gross_weight_kg", "packages_count", "container_numbers", "seal_numbers", "port_loading", "port_discharge", "vessel", "shipped_on_board_date"),
  COO: pick("document_number", "document_date", "exporter_name", "consignee_name", "consignee_address", "goods_description", "hs_code", "net_weight_kg", "port_loading", "port_discharge"),
  PHYTO: pick("document_number", "document_date", "exporter_name", "consignee_name", "consignee_address", "goods_description", "net_weight_kg", "port_loading", "port_discharge"),
  PEB: pick("document_number", "document_date", "exporter_name", "consignee_name", "hs_code", "net_weight_kg", "gross_weight_kg", "packages_count", "port_loading", "port_discharge", "currency", "amount"),
  LC: pick("lc_number", "document_date", "exporter_name", "exporter_address", "consignee_name", "consignee_address", "goods_description", "currency", "amount", "incoterm", "port_loading", "port_discharge", "latest_shipment_date", "expiry_date", "presentation_days", "required_documents"),
  CONTRACT: pick("contract_number", "document_date", "exporter_name", "exporter_address", "consignee_name", "consignee_address", "goods_description", "hs_code", "currency", "amount", "incoterm", "port_loading", "port_discharge", "latest_shipment_date", "required_documents"),
  OTHER: pick("document_number", "document_date"),
};

export const DOC_TYPE_LABEL: Record<DocumentType, string> = {
  INVOICE: "Commercial Invoice",
  PACKING_LIST: "Packing List",
  BILL_OF_LADING: "Bill of Lading",
  COO: "SKA / Certificate of Origin",
  PHYTO: "Sertifikat Fitosanitari",
  PEB: "PEB",
  LC: "Letter of Credit",
  CONTRACT: "Kontrak Penjualan",
  OTHER: "Lainnya",
};

export const DOC_TYPES = Object.keys(DOC_TYPE_LABEL) as DocumentType[];

/** F5.3 — fields with confidence below this are flagged for human review. */
export const REVIEW_CONFIDENCE = 0.8;
