import { PDFDocument, StandardFonts } from "pdf-lib";
import { ansi } from "@/lib/pdf/kit";
import type { FixtureDoc } from "./doc-sets";

/** Renders a fixture document as a text PDF: label and value are separate text runs, like real forms. */
export async function renderFixturePdf(d: FixtureDoc): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  // fixed metadata → identical bytes for identical content (the N9 cache test relies on it)
  pdf.setCreationDate(new Date("2026-01-01T00:00:00Z"));
  pdf.setModificationDate(new Date("2026-01-01T00:00:00Z"));
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([595.28, 841.89]);
  let y = 790;
  page.drawText(ansi(d.title), { x: 48, y, size: 15, font: bold });
  y -= 36;
  for (const [k, v] of d.lines) {
    if (y < 60) {
      page = pdf.addPage([595.28, 841.89]);
      y = 790;
    }
    page.drawText(ansi(`${k}:`), { x: 48, y, size: 10, font: bold });
    page.drawText(ansi(v), { x: 210, y, size: 10, font });
    y -= 20;
  }
  return pdf.save();
}
