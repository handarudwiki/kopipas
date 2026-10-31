/** Value parsers/normalisers shared by the extractor and the rule engine. */

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, januari: 1, feb: 2, february: 2, februari: 2, mar: 3, march: 3, maret: 3,
  apr: 4, april: 4, may: 5, mei: 5, jun: 6, june: 6, juni: 6, jul: 7, july: 7, juli: 7,
  aug: 8, august: 8, agu: 8, agt: 8, agustus: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, okt: 10, oktober: 10, nov: 11, november: 11, dec: 12, december: 12, des: 12, desember: 12,
};

const iso = (y: number, m: number, d: number) => {
  if (y < 100) y += 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null;
  return dt.toISOString().slice(0, 10);
};

/** Parses common trade-document date formats into YYYY-MM-DD. Day-first for numeric dates (Indonesian/EU convention). */
export function parseDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase().replace(/(\d)(st|nd|rd|th)\b/g, "$1");
  let m = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return iso(+m[1]!, +m[2]!, +m[3]!);
  m = s.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  if (m) return iso(+m[3]!, +m[2]!, +m[1]!);
  m = s.match(/(\d{1,2})[\s-]+([a-z]{3,9})\.?[\s-,]+(\d{2,4})/);
  if (m && MONTHS[m[2]!]) return iso(+m[3]!, MONTHS[m[2]!]!, +m[1]!);
  m = s.match(/([a-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})/);
  if (m && MONTHS[m[1]!]) return iso(+m[3]!, MONTHS[m[1]!]!, +m[2]!);
  m = s.match(/^(\d{2})(\d{2})(\d{2})$/); // SWIFT YYMMDD
  if (m) return iso(+m[1]!, +m[2]!, +m[3]!);
  return null;
}

/** Parses "19,200.00", "19.200,00", "19 200 kg", "USD 98,400.50" into a number. */
export function parseNumber(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const m = String(raw).match(/-?\d[\d.,\s]*/);
  if (!m) return null;
  let s = m[0].replace(/\s+/g, "");
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > -1 && lastDot > -1) {
    // the later separator is the decimal one
    s = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (lastComma > -1) {
    const decimals = s.length - lastComma - 1;
    s = decimals === 3 || s.split(",").length > 2 ? s.replace(/,/g, "") : s.replace(",", ".");
  } else if (lastDot > -1) {
    const decimals = s.length - lastDot - 1;
    if (decimals === 3 && s.split(".").length >= 2 && !/^0\./.test(s)) s = s.replace(/\./g, "");
  }
  s = s.replace(/[.,]$/, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Converts weights to kg when the value states MT/tons/lbs. */
export function parseWeightKg(raw: string | null | undefined): number | null {
  const n = parseNumber(raw);
  if (n == null || !raw) return n;
  const s = raw.toLowerCase();
  if (/\b(mt|metric tons?|tonnes?|tons?|ton)\b/.test(s)) return n * 1000;
  if (/\b(lbs?|pounds?)\b/.test(s)) return Math.round(n * 0.45359237 * 100) / 100;
  return n;
}

export function parseCurrency(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = raw.toUpperCase().match(/\b(USD|EUR|IDR|GBP|JPY|CHF|SGD|AUD)\b/);
  if (m) return m[1]!;
  if (raw.includes("€")) return "EUR";
  if (raw.includes("$")) return "USD";
  return null;
}

export function splitList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[,;\n]|\s{2,}|\s\/\s|\band\b/i)
    .map((s) => s.trim())
    .filter(Boolean);
}

const COMPANY_TOKENS = /\b(pt|tbk|cv|ud|persero|ltd|limited|llc|inc|incorporated|gmbh|bv|b\s?v|nv|sa|sas|srl|spa|ag|co|company|corp|corporation|plc|kg|oy|ab)\b/g;

/** D01/D02 — name normalisation: case, punctuation, legal-form tokens (PT, Tbk, GmbH, …). */
export function normalizeName(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[.,'’"()&/\\-]/g, " ")
    .replace(COMPANY_TOKENS, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokens(raw: string | null | undefined): Set<string> {
  return new Set(
    normalizeName(raw)
      .replace(/[^a-z0-9 ]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 1),
  );
}

/** Jaccard similarity over normalised tokens. */
export function similarity(a: string | null | undefined, b: string | null | undefined): number {
  const A = tokens(a);
  const B = tokens(b);
  if (!A.size && !B.size) return 1;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

/** Container / seal ids: uppercase alphanumerics only. */
export const normalizeId = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

export const normalizeHs = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

const PORT_ALIASES: Record<string, string> = {
  "tanjung priok": "jakarta", "tanjung perak": "surabaya", belawan: "medan", "tanjung emas": "semarang",
  "teluk bayur": "padang", "panjang": "lampung", rotterdam: "rotterdam", hamburg: "hamburg", antwerpen: "antwerp",
};

/** Ports: strip country suffix, "port of", punctuation; apply a few common aliases. */
export function normalizePort(raw: string | null | undefined): string {
  if (!raw) return "";
  let s = raw.toLowerCase().replace(/\(.*?\)/g, " ").split(/,/)[0]!;
  s = s.replace(/\b(port of|port|seaport|harbour|harbor|pelabuhan)\b/g, " ").replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
  for (const [k, v] of Object.entries(PORT_ALIASES)) if (s.includes(k)) return v;
  return s;
}

export function portsMatch(a: string | null | undefined, b: string | null | undefined) {
  const x = normalizePort(a);
  const y = normalizePort(b);
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
}

export const normalizeIncoterm = (s: string | null | undefined) => {
  const m = (s ?? "").toUpperCase().match(/\b(EXW|FCA|FAS|FOB|CFR|CNF|CIF|CPT|CIP|DAP|DPU|DDP)\b/);
  if (!m) return "";
  return m[1] === "CNF" ? "CFR" : m[1]!;
};

export const normalizeRef = (s: string | null | undefined) => (s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

export const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
