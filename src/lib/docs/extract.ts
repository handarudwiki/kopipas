import type { DocumentType } from "@/generated/prisma/enums";
import { DOC_SCHEMAS, type FieldDef } from "./schemas";
import { parseCurrency, parseDate, parseNumber, parseWeightKg, splitList } from "./parse";

export type Extracted = {
  name: string;
  value: string | null;
  confidence: number;
  page: number | null;
  bbox: null | { x: number; y: number; w: number; h: number };
};

/**
 * Deterministic label-based extractor (F5.3). It reads "Label: value" structures that trade
 * documents use, normalises values per field kind and scores confidence. It is the default
 * Extractor; an LLM-backed extractor can implement the same interface later (BRD open question on
 * provider / data residency). Pass/fail decisions never depend on the extractor — only the rule engine.
 */
export type Line = { text: string; bbox?: { x: number; y: number; w: number; h: number } | null };
export type Page = Line[];

export interface Extractor {
  extract(type: DocumentType, pages: Page[]): Extracted[];
}

/** Plain text → pages of lines (pages split on form feed). */
export const textToPages = (text: string): Page[] =>
  text.split("\f").map((p) => p.split(/\r?\n/).map((t) => ({ text: t })));

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

function normaliseValue(def: FieldDef, raw: string): { value: string | null; ok: boolean } {
  const v = raw.trim().replace(/\s+/g, " ");
  if (!v) return { value: null, ok: false };
  switch (def.kind) {
    case "date": {
      const d = parseDate(v);
      return d ? { value: d, ok: true } : { value: v, ok: false };
    }
    case "number": {
      const n = def.name.endsWith("_kg") ? parseWeightKg(v) : parseNumber(v);
      return n != null ? { value: String(n), ok: true } : { value: v, ok: false };
    }
    case "money": {
      const n = parseNumber(v);
      return n != null ? { value: String(n), ok: true } : { value: v, ok: false };
    }
    case "list": {
      const items = splitList(v);
      return items.length ? { value: items.join(", "), ok: true } : { value: v, ok: false };
    }
    default:
      return { value: v, ok: true };
  }
}

export const labelExtractor: Extractor = {
  extract(type, pages) {
    const schema = DOC_SCHEMAS[type];
    // longest synonyms first so "exporter address" wins over "exporter"
    const matchers = schema
      .flatMap((def) => def.synonyms.map((syn) => ({ def, syn })))
      .sort((a, b) => b.syn.length - a.syn.length)
      .map((m) => ({ ...m, re: new RegExp(`^\\s*${escape(m.syn)}\\b\\s*(?:\\([^)]*\\))?\\s*(?:[:：]|\\s{2,}|\\t)\\s*(.*)$`, "i") }));

    const found = new Map<string, Extracted>();
    const currencyHints: { value: string; page: number }[] = [];

    pages.forEach((pageLines, pi) => {
      const lines = pageLines.map((l) => l.text);
      lines.forEach((line, li) => {
        const cur = parseCurrency(line);
        if (cur) currencyHints.push({ value: cur, page: pi + 1 });
        for (const m of matchers) {
          const hit = line.match(m.re);
          if (!hit) continue;
          let raw = hit[1] ?? "";
          let base = m.syn.length <= 4 ? 0.86 : 0.95;
          if (!raw.trim()) {
            raw = lines.slice(li + 1).find((l) => l.trim()) ?? "";
            base -= 0.25;
          }
          const { value, ok } = normaliseValue(m.def, raw);
          const confidence = Number((ok ? base : base - 0.3).toFixed(3));
          const prev = found.get(m.def.name);
          if (value && (!prev || prev.confidence < confidence)) {
            found.set(m.def.name, { name: m.def.name, value, confidence, page: pi + 1, bbox: pageLines[li]?.bbox ?? null });
          }
          // a line belongs to exactly one field (the longest matching label)
          break;
        }
      });
    });

    // currency: explicit field, else inferred from an amount line
    if (schema.some((d) => d.name === "currency")) {
      const explicit = found.get("currency");
      if (explicit) {
        explicit.value = parseCurrency(explicit.value) ?? explicit.value;
      } else if (currencyHints.length) {
        found.set("currency", { name: "currency", value: currencyHints[0]!.value, confidence: 0.75, page: currencyHints[0]!.page, bbox: null });
      }
    }

    return schema.map((def) => found.get(def.name) ?? { name: def.name, value: null, confidence: 0, page: null, bbox: null });
  },
};

/**
 * Pull text lines (with bounding boxes in PDF points, origin top-left) per page from a PDF.
 * Text items are grouped into lines by baseline. Scanned/image PDFs yield no lines (→ manual review).
 */
export async function pdfPages(data: Uint8Array): Promise<Page[]> {
  const { getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(data);
  const pages: Page[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const { height } = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    type Item = { str: string; transform: number[]; width: number; height: number };
    const items = (content.items as Item[]).filter((it) => typeof it.str === "string" && it.str.trim() !== "");
    const rows: { y: number; items: Item[] }[] = [];
    for (const it of items) {
      const y = it.transform[5]!;
      const row = rows.find((r) => Math.abs(r.y - y) < 2.5);
      if (row) row.items.push(it);
      else rows.push({ y, items: [it] });
    }
    rows.sort((a, b) => b.y - a.y);
    pages.push(
      rows.map((r) => {
        r.items.sort((a, b) => a.transform[4]! - b.transform[4]!);
        let text = "";
        let lastEnd: number | null = null;
        for (const it of r.items) {
          const x = it.transform[4]!;
          if (lastEnd != null) text += x - lastEnd > 12 ? "   " : x - lastEnd > 1 ? " " : "";
          text += it.str;
          lastEnd = x + it.width;
        }
        const x0 = Math.min(...r.items.map((it) => it.transform[4]!));
        const x1 = Math.max(...r.items.map((it) => it.transform[4]! + it.width));
        const h = Math.max(...r.items.map((it) => it.height || 10));
        const bbox = { x: Math.round(x0), y: Math.round(height - r.y - h), w: Math.round(x1 - x0), h: Math.round(h) };
        return { text, bbox };
      }),
    );
  }
  return pages;
}
