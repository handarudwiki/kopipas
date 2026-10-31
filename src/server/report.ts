import { prisma } from "@/lib/db";
import type { Ctx } from "@/lib/context";
import { COLORS, PdfWriter } from "@/lib/pdf/kit";
import { DOC_TYPE_LABEL } from "@/lib/docs/schemas";
import type { Ref } from "@/lib/rules/types";
import { getShipmentOr404 } from "./shipments";

const STATUS_EN = { DRAFT: "DRAFT", CHECKING: "CHECKING", READY: "READY" } as const;

/** F5.6 — findings report as PDF (report content in English per BRD). */
export async function findingsReportPdf(ctx: Ctx, shipmentId: string) {
  const s = await getShipmentOr404(ctx, shipmentId);
  const [org, docs, findings] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { id: ctx.orgId } }),
    prisma.document.findMany({ where: { shipmentId, orgId: ctx.orgId }, orderBy: { createdAt: "asc" } }),
    prisma.finding.findMany({ where: { shipmentId, orgId: ctx.orgId }, orderBy: [{ status: "asc" }, { severity: "asc" }, { ruleId: "asc" }] }),
  ]);
  const open = findings.filter((f) => f.status === "OPEN");
  const count = (sev: string) => open.filter((f) => f.severity === sev).length;

  const w = await PdfWriter.create({ title: `Document validation report ${s.reference}`, footer: `KopiPass - ${s.reference} - rules ${s.rulesVersion ?? "-"}` });
  w.text("KopiPass", { size: 10, bold: true, color: COLORS.primary });
  w.text("Export Document Validation Report", { size: 18, bold: true, gap: 2 });
  w.text(`${org.name} - generated ${new Date().toISOString().replace("T", " ").slice(0, 16)} UTC`, { size: 9, color: COLORS.muted, gap: 8 });
  w.badge(`STATUS: ${STATUS_EN[s.status]}`, s.status === "READY" ? COLORS.ok : COLORS.warn);

  w.heading("Shipment");
  w.kv([
    ["Reference", s.reference], ["Payment method", s.paymentMethod],
    ["Buyer", `${s.buyerName} (${s.buyerCountry})`], ["HS code", s.hsCode],
    ["Port of loading", s.portLoading], ["Port of discharge", s.portDischarge],
    ["Last validated", s.lastValidatedAt?.toISOString().slice(0, 16).replace("T", " ") ?? "not yet validated"], ["Rule set version", s.rulesVersion ?? "-"],
  ]);

  w.heading("Summary");
  w.kv([
    ["Open errors", count("ERROR")], ["Open warnings", count("WARNING")],
    ["Accepted with reason", findings.filter((f) => f.status === "ACCEPTED").length], ["Resolved", findings.filter((f) => f.status === "RESOLVED").length],
  ], 4);

  w.heading("Documents");
  w.table(
    ["Type", "File", "Pages", "Extraction", "Version"],
    docs.map((d) => [DOC_TYPE_LABEL[d.type], d.fileName, d.pageCount ?? "-", d.extractionStatus, d.version]),
    [0.24, 0.38, 0.1, 0.16, 0.12],
  );

  w.heading("Findings");
  if (!findings.length) w.text("No findings.", { color: COLORS.muted });
  else {
    const docType = new Map(docs.map((d) => [d.id, DOC_TYPE_LABEL[d.type]]));
    w.table(
      ["Rule", "Severity", "Status", "Finding", "Documents / fields", "Suggested fix"],
      findings.map((f) => [
        f.ruleId,
        f.severity,
        f.status === "ACCEPTED" ? `ACCEPTED: ${f.acceptReason ?? ""}` : f.status,
        f.message,
        (f.refs as Ref[]).map((r) => `${r.documentId ? docType.get(r.documentId) ?? r.documentType : ""}${r.field ? ` . ${r.field}` : ""}`).join("\n") || "-",
        f.suggestion ?? "",
      ]),
      [0.07, 0.1, 0.12, 0.31, 0.18, 0.22],
      { size: 7.5 },
    );
  }
  w.text("Pass/fail decisions are made by deterministic, versioned rules. Suggestions are guidance only.", { size: 8, color: COLORS.muted });
  return w.save();
}
