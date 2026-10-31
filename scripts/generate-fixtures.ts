/** Writes the 5 synthetic document sets as PDFs to tests/fixtures/pdf/<set>/ (for manual demo uploads). */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { FIXTURE_SETS } from "../tests/fixtures/doc-sets";
import { renderFixturePdf } from "../tests/fixtures/render-pdf";

const NAMES: Record<string, string> = {
  LC: "letter-of-credit", CONTRACT: "sales-contract", INVOICE: "commercial-invoice", PACKING_LIST: "packing-list",
  BILL_OF_LADING: "bill-of-lading", COO: "certificate-of-origin", PHYTO: "phytosanitary", PEB: "peb",
};

async function main() {
  for (const set of FIXTURE_SETS) {
    const dir = path.join("tests", "fixtures", "pdf", set.key);
    mkdirSync(dir, { recursive: true });
    for (const d of set.docs) writeFileSync(path.join(dir, `${NAMES[d.type] ?? d.type}.pdf`), await renderFixturePdf(d));
    writeFileSync(path.join(dir, "README.txt"), `${set.description}\nPayment: ${set.paymentMethod}\nPresentation date: ${set.presentationDate}\nExpected rules: ${set.expected.join(", ") || "(none)"}\n`);
    console.log(`wrote ${dir}`);
  }
}
main();
