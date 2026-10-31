import type { DocumentType } from "@/generated/prisma/enums";

/** Keyword signatures used to detect the document type (F5.2). Higher weight = stronger signal. */
const SIGNATURES: [DocumentType, [RegExp, number][]][] = [
  ["LC", [[/documentary credit/i, 5], [/letter of credit/i, 5], [/\bmt\s?700\b/i, 5], [/\bl\/c\b/i, 1], [/latest (date of )?shipment/i, 2], [/beneficiary/i, 1], [/applicant/i, 1]]],
  ["BILL_OF_LADING", [[/bill of lading/i, 6], [/\bb\/l\b/i, 2], [/shipped on board/i, 3], [/ocean vessel/i, 2], [/notify party/i, 2], [/freight (prepaid|collect)/i, 1]]],
  ["PACKING_LIST", [[/packing list/i, 6], [/\bnet\s*weight\b[\s\S]*\bgross\s*weight\b/i, 1], [/container/i, 0.5]]],
  ["INVOICE", [[/commercial invoice/i, 6], [/\binvoice\b/i, 2], [/unit price/i, 2], [/total amount/i, 1]]],
  ["PHYTO", [[/phytosanitary/i, 7], [/fitosanitari/i, 7], [/plant protection/i, 2], [/karantina/i, 2]]],
  ["COO", [[/certificate of origin/i, 7], [/surat keterangan asal/i, 7], [/\bska\b/i, 2], [/form\s+[a-z]\b/i, 1], [/country of origin/i, 1]]],
  ["PEB", [[/pemberitahuan ekspor barang/i, 8], [/\bpeb\b/i, 3], [/bea cukai|customs/i, 1], [/\bnpe\b/i, 1]]],
  ["CONTRACT", [[/sales contract/i, 6], [/purchase contract/i, 6], [/\bcontract\b/i, 2], [/terms and conditions/i, 1], [/the seller/i, 1], [/the buyer/i, 1]]],
];

const FILENAME_HINTS: [DocumentType, RegExp][] = [
  ["LC", /(^|[^a-z])(lc|l-c|letter.?of.?credit|mt700)([^a-z]|$)/i],
  ["BILL_OF_LADING", /(^|[^a-z])(bl|b-l|bol|bill.?of.?lading)([^a-z]|$)/i],
  ["PACKING_LIST", /(packing|^pl[^a-z]|[^a-z]pl[^a-z])/i],
  ["INVOICE", /(invoice|^inv[^a-z])/i],
  ["PHYTO", /(phyto|fito)/i],
  ["COO", /(coo|ska|origin)/i],
  ["PEB", /peb/i],
  ["CONTRACT", /(contract|kontrak)/i],
];

export function detectDocumentType(text: string, fileName = ""): { type: DocumentType; confidence: number } {
  const head = text.slice(0, 4000);
  // the heading (first few non-empty lines) is the strongest signal: a contract may *mention*
  // "commercial invoice" in its required-documents clause, but its title says "Sales Contract"
  const title = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 3).join("\n");
  const scores = new Map<DocumentType, number>();
  for (const [type, sigs] of SIGNATURES) {
    let s = 0;
    for (const [re, w] of sigs) {
      if (re.test(head)) s += w;
      if (w >= 5 && re.test(title)) s += 6;
    }
    scores.set(type, s);
  }
  for (const [type, re] of FILENAME_HINTS) {
    if (re.test(fileName)) scores.set(type, (scores.get(type) ?? 0) + 3);
  }
  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  const [best, second] = ranked;
  if (!best || best[1] < 2) return { type: "OTHER", confidence: 0.3 };
  const margin = best[1] - (second?.[1] ?? 0);
  const confidence = Math.min(0.99, 0.55 + Math.min(best[1], 10) * 0.03 + Math.min(margin, 6) * 0.03);
  return { type: best[0], confidence: Number(confidence.toFixed(3)) };
}
