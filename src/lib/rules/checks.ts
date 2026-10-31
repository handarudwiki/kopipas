import type { DocumentType } from "@/generated/prisma/enums";
import { DOC_TYPE_LABEL } from "@/lib/docs/schemas";
import {
  daysBetween, normalizeHs, normalizeId, normalizeIncoterm, normalizeName, normalizeRef,
  parseDate, parseNumber, portsMatch, similarity, splitList, tokens,
} from "@/lib/docs/parse";
import type { Check, DocFacts, Problem, Ref, ShipmentFacts } from "./types";

const L = (t: DocumentType) => DOC_TYPE_LABEL[t];
const ref = (d: DocFacts, field: string): Ref => ({ documentId: d.id, documentType: d.type, field, value: d.fields[field] ?? null });
const has = (d: DocFacts, f: string) => d.fields[f] != null && String(d.fields[f]).trim() !== "";
const docsOf = (f: ShipmentFacts, types?: DocumentType[]) => f.docs.filter((d) => !types || types.includes(d.type));
const withField = (docs: DocFacts[], field: string) => docs.filter((d) => has(d, field));
/** The governing credit document: L/C when paying by L/C, else the sales contract. */
const credit = (f: ShipmentFacts) =>
  (f.paymentMethod === "LC" ? f.docs.find((d) => d.type === "LC") : undefined) ??
  f.docs.find((d) => d.type === "CONTRACT") ??
  f.docs.find((d) => d.type === "LC");
const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

/** Values that disagree, grouped: [{key, docs}] */
function groupBy(docs: DocFacts[], field: string, key: (v: string) => string) {
  const groups = new Map<string, DocFacts[]>();
  for (const d of docs) {
    const k = key(String(d.fields[field]));
    groups.set(k, [...(groups.get(k) ?? []), d]);
  }
  return groups;
}

const describe = (docs: DocFacts[], field: string) =>
  docs.map((d) => `${L(d.type)}: "${d.fields[field]}"`).join("; ");

// ---------------------------------------------------------------------------------------------

/** D01 — the same normalised name everywhere. */
const same_name: Check = (f, p) => {
  const field = String(p.field);
  const docs = withField(f.docs, field);
  const groups = groupBy(docs, field, normalizeName);
  if (groups.size <= 1) return [];
  return [{ message: `Nama ${p.label ?? field} berbeda antar dokumen — ${describe(docs, field)}`, refs: docs.map((d) => ref(d, field)) }];
};

/** D02 — consignee name equal (normalised) and address similar across docs and vs L/C/contract. */
const consignee_consistent: Check = (f, p) => {
  const out: Problem[] = [];
  const names = withField(f.docs, "consignee_name");
  if (groupBy(names, "consignee_name", normalizeName).size > 1) {
    out.push({ message: `Nama pembeli/consignee berbeda antar dokumen — ${describe(names, "consignee_name")}`, refs: names.map((d) => ref(d, "consignee_name")) });
  }
  const min = Number(p.addressMinSimilarity ?? 0.6);
  const addrs = withField(f.docs, "consignee_address");
  const base = credit(f);
  const anchor = base && has(base, "consignee_address") ? base : addrs[0];
  if (anchor) {
    const bad = addrs.filter((d) => d.id !== anchor.id && similarity(d.fields.consignee_address, anchor.fields.consignee_address) < min);
    if (bad.length) {
      out.push({
        message: `Alamat consignee tidak konsisten dengan ${L(anchor.type)} ("${anchor.fields.consignee_address}") — ${describe(bad, "consignee_address")}`,
        refs: [ref(anchor, "consignee_address"), ...bad.map((d) => ref(d, "consignee_address"))],
      });
    }
  }
  return out;
};

/** D03 — invoice description corresponds to the L/C; others must not contradict it. */
const goods_description: Check = (f, p) => {
  const lc = f.docs.find((d) => d.type === "LC");
  if (!lc || !has(lc, "goods_description")) {
    return lc ? [{ message: "Deskripsi barang di L/C tidak terbaca; periksa manual.", refs: [ref(lc, "goods_description")], severity: "WARNING" }] : [];
  }
  const out: Problem[] = [];
  const lcDesc = String(lc.fields.goods_description);
  const lcTokens = tokens(lcDesc);
  const inv = f.docs.find((d) => d.type === "INVOICE");
  if (inv && has(inv, "goods_description")) {
    const invTokens = tokens(inv.fields.goods_description);
    const covered = [...lcTokens].filter((t) => invTokens.has(t)).length / Math.max(lcTokens.size, 1);
    if (covered < Number(p.invoiceMinSimilarity ?? 0.7)) {
      out.push({
        message: `Deskripsi barang di invoice tidak sesuai L/C. L/C: "${lcDesc}"; invoice: "${inv.fields.goods_description}"`,
        refs: [ref(lc, "goods_description"), ref(inv, "goods_description")],
      });
    }
  }
  const groups = (p.exclusiveGroups as string[][]) ?? [];
  for (const d of withField(f.docs, "goods_description")) {
    if (d.id === lc.id) continue;
    const t = tokens(d.fields.goods_description);
    for (const g of groups) {
      const inLc = g.filter((w) => lcTokens.has(w));
      const inDoc = g.filter((w) => t.has(w));
      if (inLc.length && inDoc.some((w) => !inLc.includes(w))) {
        out.push({
          message: `${L(d.type)} menyebut "${inDoc.join(", ")}" sedangkan L/C menyebut "${inLc.join(", ")}" — deskripsi bertentangan`,
          refs: [ref(lc, "goods_description"), ref(d, "goods_description")],
        });
        break;
      }
    }
  }
  return out;
};

/** D04 — net & gross weights within tolerance across the listed documents. */
const weights_consistent: Check = (f, p) => {
  const tol = f.settings.weightTolerancePct / 100;
  const out: Problem[] = [];
  for (const field of ["net_weight_kg", "gross_weight_kg"]) {
    const docs = withField(docsOf(f, p.docs as DocumentType[]), field);
    const vals = docs.map((d) => parseNumber(d.fields[field])).filter((n): n is number => n != null);
    if (vals.length < 2) continue;
    const max = Math.max(...vals);
    const min = Math.min(...vals);
    if (max > 0 && (max - min) / max > tol) {
      out.push({
        message: `${field === "net_weight_kg" ? "Berat bersih" : "Berat kotor"} tidak konsisten (selisih ${fmt(max - min)} kg, toleransi ${f.settings.weightTolerancePct}%) — ${docs.map((d) => `${L(d.type)}: ${fmt(parseNumber(d.fields[field]) ?? 0)} kg`).join("; ")}`,
        refs: docs.map((d) => ref(d, field)),
      });
    }
  }
  const pl = f.docs.find((d) => d.type === "PACKING_LIST");
  if (pl && !has(pl, "net_weight_kg")) {
    out.push({ message: "Berat bersih di packing list tidak terbaca; periksa manual.", refs: [ref(pl, "net_weight_kg")], severity: "WARNING" });
  }
  return out;
};

/** D05 — identical numeric value across docs. */
const same_number: Check = (f, p) => {
  const field = String(p.field);
  const docs = withField(docsOf(f, p.docs as DocumentType[]), field);
  const vals = new Set(docs.map((d) => parseNumber(d.fields[field])));
  if (docs.length < 2 || vals.size <= 1) return [];
  return [{ message: `${p.label ?? field} berbeda — ${describe(docs, field)}`, refs: docs.map((d) => ref(d, field)) }];
};

/** D06 — container / seal number sets identical. */
const same_id_sets: Check = (f, p) => {
  const out: Problem[] = [];
  for (const field of p.fields as string[]) {
    const docs = withField(docsOf(f, p.docs as DocumentType[]), field);
    if (docs.length < 2) continue;
    const sets = docs.map((d) => new Set(splitList(d.fields[field]).map(normalizeId).filter(Boolean)));
    const [a, ...rest] = sets;
    const differs = rest.some((s) => s.size !== a!.size || [...s].some((x) => !a!.has(x)));
    if (differs) {
      const label = field === "container_numbers" ? "Nomor kontainer" : "Nomor segel";
      out.push({ message: `${label} tidak sama — ${describe(docs, field)}`, refs: docs.map((d) => ref(d, field)) });
    }
  }
  return out;
};

/** D07 — HS codes consistent and under heading 0901. */
const hs_code: Check = (f, p) => {
  const prefix = String(p.prefix ?? "0901");
  const docs = withField(f.docs, "hs_code");
  const out: Problem[] = [];
  const bad = docs.filter((d) => !normalizeHs(d.fields.hs_code).startsWith(prefix));
  if (bad.length) out.push({ message: `HS code bukan ${prefix} (kopi) — ${describe(bad, "hs_code")}`, refs: bad.map((d) => ref(d, "hs_code")) });
  const codes = docs.map((d) => normalizeHs(d.fields.hs_code));
  const inconsistent = codes.some((a) => codes.some((b) => !(a.startsWith(b) || b.startsWith(a))));
  if (inconsistent) out.push({ message: `HS code tidak konsisten antar dokumen — ${describe(docs, "hs_code")}`, refs: docs.map((d) => ref(d, "hs_code")) });
  return out;
};

/** D08 — ports of loading and discharge match the L/C or contract. */
const ports: Check = (f) => {
  const base = credit(f);
  if (!base) return [];
  const out: Problem[] = [];
  for (const [field, label] of [["port_loading", "Pelabuhan muat"], ["port_discharge", "Pelabuhan bongkar"]] as const) {
    if (!has(base, field)) continue;
    const bad = withField(f.docs, field).filter((d) => d.id !== base.id && !portsMatch(d.fields[field], base.fields[field]));
    if (bad.length) {
      out.push({
        message: `${label} tidak sesuai ${L(base.type)} ("${base.fields[field]}") — ${describe(bad, field)}`,
        refs: [ref(base, field), ...bad.map((d) => ref(d, field))],
      });
    }
  }
  return out;
};

const blDate = (f: ShipmentFacts) => {
  const bl = f.docs.find((d) => d.type === "BILL_OF_LADING");
  return bl ? { bl, date: parseDate(bl.fields.shipped_on_board_date ?? null) } : null;
};

/** D09 — on-board date not after the latest shipment date. */
const latest_shipment: Check = (f) => {
  const lc = f.docs.find((d) => d.type === "LC");
  const b = blDate(f);
  if (!lc || !b) return [];
  const latest = parseDate(lc.fields.latest_shipment_date ?? null);
  if (!b.date || !latest) {
    return [{ message: "Tanggal on-board B/L atau batas pengapalan L/C tidak terbaca; periksa manual.", refs: [ref(b.bl, "shipped_on_board_date"), ref(lc, "latest_shipment_date")], severity: "WARNING" }];
  }
  if (b.date > latest) {
    return [{ message: `Tanggal pengapalan ${b.date} melewati batas pengapalan terakhir L/C ${latest} (${daysBetween(latest, b.date)} hari).`, refs: [ref(b.bl, "shipped_on_board_date"), ref(lc, "latest_shipment_date")] }];
  }
  return [];
};

/** D10 — presentation within N days after shipment and before L/C expiry. */
const presentation_period: Check = (f, p) => {
  const lc = f.docs.find((d) => d.type === "LC");
  const b = blDate(f);
  if (!lc || !b?.date) return [];
  const out: Problem[] = [];
  const days = parseNumber(lc.fields.presentation_days ?? null) ?? f.settings.presentationDays ?? Number(p.defaultDays ?? 21);
  const elapsed = daysBetween(b.date, f.presentationDate);
  if (elapsed > days) {
    out.push({ message: `Presentasi ${f.presentationDate} adalah ${elapsed} hari setelah pengapalan ${b.date}; batas ${days} hari.`, refs: [ref(b.bl, "shipped_on_board_date"), ref(lc, "presentation_days")] });
  }
  const expiry = parseDate(lc.fields.expiry_date ?? null);
  if (expiry && f.presentationDate > expiry) {
    out.push({ message: `Presentasi ${f.presentationDate} setelah L/C kedaluwarsa (${expiry}).`, refs: [ref(lc, "expiry_date")] });
  }
  return out;
};

/** D11 — invoice amount ≤ L/C amount, same currency. */
const invoice_amount: Check = (f) => {
  const lc = f.docs.find((d) => d.type === "LC");
  const inv = f.docs.find((d) => d.type === "INVOICE");
  if (!lc || !inv) return [];
  const out: Problem[] = [];
  const cl = String(lc.fields.currency ?? "").toUpperCase();
  const ci = String(inv.fields.currency ?? "").toUpperCase();
  if (cl && ci && cl !== ci) out.push({ message: `Mata uang invoice (${ci}) berbeda dengan L/C (${cl}).`, refs: [ref(inv, "currency"), ref(lc, "currency")] });
  const al = parseNumber(lc.fields.amount ?? null);
  const ai = parseNumber(inv.fields.amount ?? null);
  if (al != null && ai != null && ai > al) {
    out.push({ message: `Nilai invoice ${fmt(ai)} melebihi nilai L/C ${fmt(al)} (selisih ${fmt(ai - al)}).`, refs: [ref(inv, "amount"), ref(lc, "amount")] });
  }
  if (al == null || ai == null) out.push({ message: "Nilai invoice atau L/C tidak terbaca; periksa manual.", refs: [ref(inv, "amount"), ref(lc, "amount")], severity: "WARNING" });
  return out;
};

/** D12 — invoice states the same Incoterm and cites the L/C or contract number. */
const incoterm_reference: Check = (f) => {
  const base = credit(f);
  const inv = f.docs.find((d) => d.type === "INVOICE");
  if (!base || !inv) return [];
  const out: Problem[] = [];
  const ib = normalizeIncoterm(base.fields.incoterm);
  const ii = normalizeIncoterm(inv.fields.incoterm);
  if (!ii) out.push({ message: "Incoterm tidak tercantum di invoice.", refs: [ref(inv, "incoterm")] });
  else if (ib && ib !== ii) out.push({ message: `Incoterm invoice (${ii}) berbeda dengan ${L(base.type)} (${ib}).`, refs: [ref(inv, "incoterm"), ref(base, "incoterm")] });
  const field = base.type === "LC" ? "lc_number" : "contract_number";
  const want = normalizeRef(base.fields[field]);
  const got = normalizeRef(inv.fields[field]);
  if (!got) out.push({ message: `Nomor ${base.type === "LC" ? "L/C" : "kontrak"} tidak tercantum di invoice.`, refs: [ref(inv, field)] });
  else if (want && want !== got) out.push({ message: `Nomor ${base.type === "LC" ? "L/C" : "kontrak"} di invoice (${inv.fields[field]}) berbeda dengan ${L(base.type)} (${base.fields[field]}).`, refs: [ref(inv, field), ref(base, field)] });
  return out;
};

/** D13 — certificate dates within a window around the shipment date. */
const certificate_dates: Check = (f, p) => {
  const b = blDate(f);
  if (!b?.date) return [];
  const out: Problem[] = [];
  for (const d of docsOf(f, p.docs as DocumentType[])) {
    const date = parseDate(d.fields.document_date ?? null);
    if (!date) {
      out.push({ message: `Tanggal ${L(d.type)} tidak terbaca; periksa manual.`, refs: [ref(d, "document_date")], severity: "INFO" });
      continue;
    }
    const diff = daysBetween(b.date, date); // + = after shipment
    if (diff < -f.settings.certMaxDaysBefore || diff > f.settings.certMaxDaysAfter) {
      out.push({
        message: `Tanggal ${L(d.type)} ${date} berjarak ${Math.abs(diff)} hari ${diff < 0 ? "sebelum" : "setelah"} pengapalan ${b.date} (batas ${f.settings.certMaxDaysBefore} hari sebelum / ${f.settings.certMaxDaysAfter} hari sesudah).`,
        refs: [ref(d, "document_date"), ref(b.bl, "shipped_on_board_date")],
      });
    }
  }
  return out;
};

const DOC_KEYWORDS: [DocumentType, RegExp][] = [
  ["INVOICE", /invoice/i],
  ["PACKING_LIST", /packing/i],
  ["BILL_OF_LADING", /bill of lading|\bb\/l\b|\bbl\b/i],
  ["COO", /origin|\bska\b|\bcoo\b/i],
  ["PHYTO", /phyto|fitosanitari/i],
  ["PEB", /\bpeb\b|export declaration|pemberitahuan ekspor/i],
];

/** Map "Commercial invoice in 3 originals; Full set clean on board B/L; …" → document types. */
export function parseRequiredDocs(raw: string | null | undefined): DocumentType[] {
  const out = new Set<DocumentType>();
  for (const item of splitList(raw)) {
    for (const [t, re] of DOC_KEYWORDS) if (re.test(item)) out.add(t);
  }
  return [...out];
}

/** D14 — all documents required by the L/C / contract are present. */
const required_documents: Check = (f, p) => {
  const base = credit(f);
  if (!base) {
    const need = f.paymentMethod === "LC" ? "L/C" : "L/C atau kontrak penjualan";
    return [{ message: `${need} belum diunggah — dokumen acuan untuk validasi tidak ada.`, refs: [] }];
  }
  const fromDoc = parseRequiredDocs(base.fields.required_documents);
  const required = fromDoc.length ? fromDoc : ((p.defaultRequired as DocumentType[]) ?? []);
  const present = new Set(f.docs.map((d) => d.type));
  const missing = required.filter((t) => !present.has(t));
  if (!missing.length) return [];
  return [{ message: `Dokumen yang disyaratkan ${L(base.type)} belum ada: ${missing.map(L).join(", ")}.`, refs: [ref(base, "required_documents")] }];
};

/** D15 — shipment weight ≤ total weight of linked lots (green-bean equivalent). */
const lot_weight: Check = (f) => {
  if (!f.lots.count) return [{ message: "Belum ada lot yang ditautkan ke pengiriman; asal kebun tidak dapat ditelusuri.", refs: [] }];
  if (f.shipmentNetWeightKg == null) return [{ message: "Berat bersih pengiriman belum diketahui; tidak dapat dibandingkan dengan lot.", refs: [], severity: "WARNING" }];
  if (f.shipmentNetWeightKg > f.lots.totalGreenKg + 1e-6) {
    return [{ message: `Berat pengiriman ${fmt(f.shipmentNetWeightKg)} kg melebihi total lot tertaut ${fmt(f.lots.totalGreenKg)} kg (setara green bean).`, refs: [] }];
  }
  return [];
};

export const CHECKS: Record<string, Check> = {
  same_name, consignee_consistent, goods_description, weights_consistent, same_number, same_id_sets,
  hs_code, ports, latest_shipment, presentation_period, invoice_amount, incoterm_reference,
  certificate_dates, required_documents, lot_weight,
};

