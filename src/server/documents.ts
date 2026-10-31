import { z } from "zod";
import { prisma } from "@/lib/db";
import type { Ctx } from "@/lib/context";
import { sha256 } from "@/lib/crypto";
import { badRequest, notFound } from "@/lib/errors";
import { enqueueJob, registerJob } from "@/lib/jobs";
import { getObject, putObject, safeFileName } from "@/lib/storage";
import { detectDocumentType } from "@/lib/docs/detect";
import { labelExtractor, pdfPages, type Page } from "@/lib/docs/extract";
import { DOC_SCHEMAS, DOC_TYPES } from "@/lib/docs/schemas";
import type { DocumentType } from "@/generated/prisma/enums";
import { getShipmentOr404, refreshShipmentStatus, runValidation } from "./shipments";

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const ALLOWED: Record<string, string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png" };

function sniffMime(buf: Buffer, declared: string) {
  if (buf.subarray(0, 5).toString() === "%PDF-") return "application/pdf";
  if (buf[0] === 0xff && buf[1] === 0xd8) return "image/jpeg";
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  return declared;
}

/** F5.2 — upload PDF/JPG/PNG; type is detected automatically unless given. */
export async function uploadDocument(ctx: Ctx, shipmentId: string, file: File, manualType?: string | null) {
  await getShipmentOr404(ctx, shipmentId);
  if (file.size > MAX_UPLOAD_BYTES) throw badRequest("Ukuran file maksimal 20 MB");
  const buf = Buffer.from(await file.arrayBuffer());
  const mime = sniffMime(buf, file.type);
  if (!ALLOWED[mime]) throw badRequest("Format harus PDF, JPG, atau PNG");
  const type = manualType && DOC_TYPES.includes(manualType as DocumentType) ? (manualType as DocumentType) : null;

  const hash = sha256(buf);
  const key = `${ctx.orgId}/shipments/${shipmentId}/${hash.slice(0, 16)}-${safeFileName(file.name)}`;
  await putObject(key, buf);
  const doc = await prisma.document.create({
    data: {
      orgId: ctx.orgId, shipmentId, type: type ?? "OTHER", fileKey: key, fileName: file.name.slice(0, 200),
      mimeType: mime, sha256: hash, createdBy: ctx.userId, extractionStatus: "PENDING",
    },
  });
  const job = await enqueueJob(ctx.orgId, ctx.userId, "extract_document", { documentId: doc.id, manualType: type });
  return { document: doc, jobId: job.id };
}

type ExtractResult = { status: "DONE" | "NEEDS_REVIEW"; fields: { name: string; value: string | null; confidence: number; page: number | null; bbox: object | null }[] };

/** Extraction job: text → type detection → field extraction. Cached per file hash (N9). */
export async function extractDocument(orgId: string, documentId: string, actorId: string | null, manualType?: DocumentType | null) {
  const doc = await prisma.document.findFirstOrThrow({ where: { id: documentId, orgId } });
  let type = manualType ?? (doc.type !== "OTHER" ? doc.type : null);
  let pageCount: number | null = null;
  let rawText: string | null = null;
  let typeConfidence: number | null = null;
  let detected: DocumentType | null = null;
  let result: ExtractResult;

  // N9 — the same file (same SHA-256) already extracted in this org: reuse its fields.
  const cached = await prisma.document.findFirst({
    where: { orgId, sha256: doc.sha256, id: { not: doc.id }, extractionStatus: { in: ["DONE", "NEEDS_REVIEW"] } },
    include: { fields: { where: { isCurrent: true, correctedBy: null } } },
    orderBy: { createdAt: "desc" },
  });

  if (cached && (!type || type === cached.type)) {
    type = cached.type;
    detected = cached.detectedType;
    typeConfidence = cached.typeConfidence ? Number(cached.typeConfidence) : null;
    pageCount = cached.pageCount;
    rawText = cached.rawText;
    const byName = new Map(cached.fields.map((f) => [f.name, f]));
    result = {
      status: cached.extractionStatus === "NEEDS_REVIEW" ? "NEEDS_REVIEW" : "DONE",
      fields: DOC_SCHEMAS[type].map((def) => {
        const f = byName.get(def.name);
        return { name: def.name, value: f?.value ?? null, confidence: f ? Number(f.confidence) : 0, page: f?.page ?? null, bbox: (f?.bbox as object) ?? null };
      }),
    };
  } else {
    let pages: Page[] = [];
    if (doc.mimeType === "application/pdf") {
      pages = await pdfPages(new Uint8Array(await getObject(doc.fileKey)));
      pageCount = pages.length;
    } else {
      pageCount = 1; // images: no OCR engine configured → manual entry
    }
    rawText = pages.map((p) => p.map((l) => l.text).join("\n")).join("\f");
    const hasText = rawText.replace(/\s/g, "").length > 20;
    const det = detectDocumentType(rawText, doc.fileName);
    detected = hasText ? det.type : null;
    typeConfidence = hasText ? det.confidence : null;
    type = type ?? (hasText ? det.type : "OTHER");
    const fields = hasText ? labelExtractor.extract(type, pages) : DOC_SCHEMAS[type].map((d) => ({ name: d.name, value: null, confidence: 0, page: null, bbox: null }));
    result = { status: hasText ? "DONE" : "NEEDS_REVIEW", fields };
  }

  await prisma.$transaction([
    prisma.extractedField.deleteMany({ where: { documentId: doc.id } }),
    prisma.extractedField.createMany({
      data: result.fields.map((f) => ({
        orgId, documentId: doc.id, name: f.name, value: f.value, confidence: f.confidence, page: f.page,
        bbox: f.bbox ?? undefined, version: 1, isCurrent: true, createdBy: actorId,
      })),
    }),
    prisma.document.update({
      where: { id: doc.id },
      data: { type, detectedType: detected, typeConfidence, pageCount, rawText, extractionStatus: result.status, version: 1 },
    }),
  ]);

  // keep findings fresh once a shipment has been validated
  const shipment = await prisma.shipment.findFirstOrThrow({ where: { id: doc.shipmentId, orgId } });
  const pending = await prisma.document.count({ where: { shipmentId: shipment.id, extractionStatus: "PENDING" } });
  if (shipment.lastValidatedAt && !pending) await runValidation(orgId, shipment.id, actorId);
  else await refreshShipmentStatus(orgId, shipment.id);
  return { documentId: doc.id, type, status: result.status, cached: Boolean(cached && type === cached.type) };
}

registerJob("extract_document", (p, job) =>
  extractDocument(job.orgId, String(p.documentId), job.createdBy, (p.manualType as DocumentType | null) ?? null),
);

export async function getDocumentOr404(ctx: Ctx, id: string) {
  const d = await prisma.document.findFirst({ where: { id, orgId: ctx.orgId } });
  if (!d) throw notFound("Dokumen tidak ditemukan");
  return d;
}

export async function getDocumentFields(ctx: Ctx, id: string) {
  const doc = await getDocumentOr404(ctx, id);
  const fields = await prisma.extractedField.findMany({ where: { documentId: id, orgId: ctx.orgId }, orderBy: [{ name: "asc" }, { version: "desc" }] });
  const order = DOC_SCHEMAS[doc.type].map((d) => d.name);
  const current = fields.filter((f) => f.isCurrent).sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));
  return { document: { ...doc, rawText: undefined }, fields: current, history: fields.filter((f) => !f.isCurrent) };
}

export const correctionSchema = z.object({
  fields: z.array(z.object({ name: z.string().min(1), value: z.string().trim().max(2000).nullable() })).min(1),
});

/** F5.4 — corrections are stored as a new version and trigger re-validation. */
export async function correctFields(ctx: Ctx, id: string, input: unknown) {
  const doc = await getDocumentOr404(ctx, id);
  const { fields } = correctionSchema.parse(input);
  const allowed = new Set(DOC_SCHEMAS[doc.type].map((d) => d.name));
  const bad = fields.filter((f) => !allowed.has(f.name));
  if (bad.length) throw badRequest(`Field tidak dikenal untuk ${doc.type}: ${bad.map((b) => b.name).join(", ")}`);

  const current = await prisma.extractedField.findMany({ where: { documentId: id, isCurrent: true } });
  const changed = fields.filter((f) => (current.find((c) => c.name === f.name)?.value ?? null) !== (f.value || null));
  if (!changed.length) return getDocumentFields(ctx, id);

  const version = doc.version + 1;
  for (const f of changed) {
    const prev = current.find((c) => c.name === f.name);
    if (prev) await prisma.extractedField.update({ where: { id: prev.id }, data: { isCurrent: false } });
    await prisma.extractedField.create({
      data: {
        orgId: ctx.orgId, documentId: id, name: f.name, value: f.value || null, confidence: 1, page: prev?.page ?? null,
        bbox: (prev?.bbox as object) ?? undefined, version, isCurrent: true, correctedBy: ctx.userId, createdBy: ctx.userId,
      },
    });
  }
  await prisma.document.update({ where: { id }, data: { version, extractionStatus: "DONE" } });
  const job = await enqueueJob(ctx.orgId, ctx.userId, "validate_shipment", { shipmentId: doc.shipmentId });
  return { ...(await getDocumentFields(ctx, id)), jobId: job.id };
}

export async function setDocumentType(ctx: Ctx, id: string, type: string) {
  const doc = await getDocumentOr404(ctx, id);
  if (!DOC_TYPES.includes(type as DocumentType)) throw badRequest("Tipe dokumen tidak valid");
  await prisma.document.update({ where: { id }, data: { type: type as DocumentType, extractionStatus: "PENDING" } });
  const job = await enqueueJob(ctx.orgId, ctx.userId, "extract_document", { documentId: doc.id, manualType: type });
  return { jobId: job.id };
}

export async function deleteDocument(ctx: Ctx, id: string) {
  const doc = await getDocumentOr404(ctx, id);
  await prisma.document.delete({ where: { id } });
  const s = await prisma.shipment.findFirstOrThrow({ where: { id: doc.shipmentId } });
  if (s.lastValidatedAt) await enqueueJob(ctx.orgId, ctx.userId, "validate_shipment", { shipmentId: s.id });
}

export async function readDocumentFile(ctx: Ctx, id: string) {
  const doc = await getDocumentOr404(ctx, id);
  return { doc, data: await getObject(doc.fileKey) };
}
