import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";

/** Standard fonts are WinAnsi-only: map common Unicode punctuation and drop the rest. */
export function ansi(s: unknown): string {
  return String(s ?? "")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/≤/g, "<=")
    .replace(/≥/g, ">=")
    .replace(/…/g, "...")
    .replace(/→/g, "->")
    .replace(/[ ]/g, " ")
    .replace(/[^\x09\x0a\x0d\x20-\x7e\xa0-\xff]/g, "?");
}

export const COLORS = {
  ink: rgb(0.07, 0.09, 0.15),
  muted: rgb(0.45, 0.49, 0.53),
  line: rgb(0.88, 0.9, 0.9),
  primary: rgb(0.055, 0.56, 0.49),
  soft: rgb(0.95, 0.97, 0.97),
  err: rgb(0.82, 0.15, 0.15),
  warn: rgb(0.7, 0.4, 0.03),
  ok: rgb(0.08, 0.5, 0.24),
};

const A4: [number, number] = [595.28, 841.89];
const M = 48;

export class PdfWriter {
  doc!: PDFDocument;
  page!: PDFPage;
  font!: PDFFont;
  bold!: PDFFont;
  mono!: PDFFont;
  y = 0;
  footer = "";
  readonly width = A4[0] - 2 * M;

  static async create(meta: { title: string; footer?: string }) {
    const w = new PdfWriter();
    w.doc = await PDFDocument.create();
    w.doc.setTitle(ansi(meta.title));
    w.doc.setProducer("KopiPass");
    w.doc.setCreator("KopiPass");
    w.font = await w.doc.embedFont(StandardFonts.Helvetica);
    w.bold = await w.doc.embedFont(StandardFonts.HelveticaBold);
    w.mono = await w.doc.embedFont(StandardFonts.Courier);
    w.footer = meta.footer ?? "";
    w.newPage();
    return w;
  }

  newPage() {
    this.page = this.doc.addPage(A4);
    this.y = A4[1] - M;
  }

  ensure(h: number) {
    if (this.y - h < M + 24) this.newPage();
  }

  wrap(text: string, font: PDFFont, size: number, width: number): string[] {
    const out: string[] = [];
    for (const para of ansi(text).split("\n")) {
      let line = "";
      for (const word of para.split(/\s+/)) {
        const next = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(next, size) <= width) line = next;
        else {
          if (line) out.push(line);
          // hard-break very long tokens (hashes, URLs)
          let w = word;
          while (font.widthOfTextAtSize(w, size) > width) {
            let i = w.length;
            while (i > 1 && font.widthOfTextAtSize(w.slice(0, i), size) > width) i--;
            out.push(w.slice(0, i));
            w = w.slice(i);
          }
          line = w;
        }
      }
      out.push(line);
    }
    return out;
  }

  text(t: string, o: { size?: number; bold?: boolean; color?: RGB; x?: number; width?: number; gap?: number; mono?: boolean } = {}) {
    const size = o.size ?? 10;
    const font = o.mono ? this.mono : o.bold ? this.bold : this.font;
    const lines = this.wrap(t, font, size, o.width ?? this.width - (o.x ?? 0));
    for (const l of lines) {
      this.ensure(size * 1.4);
      this.page.drawText(l, { x: M + (o.x ?? 0), y: this.y - size, size, font, color: o.color ?? COLORS.ink });
      this.y -= size * 1.4;
    }
    this.y -= o.gap ?? 0;
  }

  heading(t: string, size = 13) {
    this.ensure(size * 3);
    this.y -= 8;
    this.text(t, { size, bold: true, gap: 4 });
    this.rule();
  }

  rule(color = COLORS.line) {
    this.page.drawLine({ start: { x: M, y: this.y }, end: { x: M + this.width, y: this.y }, thickness: 0.7, color });
    this.y -= 8;
  }

  /** Two-column key/value grid. */
  kv(items: [string, unknown][], cols = 2) {
    const colW = this.width / cols;
    for (let i = 0; i < items.length; i += cols) {
      const row = items.slice(i, i + cols);
      const heights = row.map(([, v]) => this.wrap(String(v ?? "-"), this.font, 9.5, colW - 10).length);
      const h = 12 + Math.max(...heights) * 13 + 6;
      this.ensure(h);
      const top = this.y;
      row.forEach(([k, v], j) => {
        const x = M + j * colW;
        this.page.drawText(ansi(k).toUpperCase(), { x, y: top - 8, size: 7, font: this.bold, color: COLORS.muted });
        this.wrap(String(v ?? "-"), this.font, 9.5, colW - 10).forEach((l, li) =>
          this.page.drawText(l, { x, y: top - 21 - li * 13, size: 9.5, font: this.font, color: COLORS.ink }),
        );
      });
      this.y = top - h;
    }
  }

  /** Simple table with wrapping cells. widths are fractions of the content width. */
  table(head: string[], rows: (string | number | null | undefined)[][], widths: number[], o: { size?: number } = {}) {
    const size = o.size ?? 8.5;
    const ws = widths.map((w) => w * this.width);
    const drawRow = (cells: string[], bold: boolean, fill?: RGB) => {
      const font = bold ? this.bold : this.font;
      const lines = cells.map((c, i) => this.wrap(c, font, size, ws[i]! - 8));
      const h = Math.max(...lines.map((l) => l.length)) * (size * 1.3) + 8;
      this.ensure(h);
      if (fill) this.page.drawRectangle({ x: M, y: this.y - h, width: this.width, height: h, color: fill });
      let x = M;
      lines.forEach((ls, i) => {
        ls.forEach((l, li) => this.page.drawText(l, { x: x + 4, y: this.y - 4 - size - li * size * 1.3, size, font, color: bold ? COLORS.muted : COLORS.ink }));
        x += ws[i]!;
      });
      this.y -= h;
      this.page.drawLine({ start: { x: M, y: this.y }, end: { x: M + this.width, y: this.y }, thickness: 0.5, color: COLORS.line });
    };
    drawRow(head.map((h) => h.toUpperCase()), true, COLORS.soft);
    for (const r of rows) drawRow(r.map((c) => (c == null || c === "" ? "-" : String(c))), false);
    this.y -= 8;
  }

  badge(label: string, color: RGB) {
    const size = 9;
    const w = this.bold.widthOfTextAtSize(ansi(label), size) + 14;
    this.ensure(22);
    this.page.drawRectangle({ x: M, y: this.y - 18, width: w, height: 18, color, opacity: 0.12, borderColor: color, borderWidth: 0.6 });
    this.page.drawText(ansi(label), { x: M + 7, y: this.y - 13, size, font: this.bold, color });
    this.y -= 26;
  }

  async save(): Promise<Uint8Array> {
    const pages = this.doc.getPages();
    pages.forEach((p, i) => {
      const t = ansi(`${this.footer}${this.footer ? "  |  " : ""}Page ${i + 1} of ${pages.length}`);
      p.drawText(t, { x: M, y: 26, size: 7.5, font: this.font, color: COLORS.muted });
    });
    return this.doc.save();
  }
}
