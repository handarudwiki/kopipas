import { z } from "zod";
import { prisma } from "@/lib/db";
import type { Ctx } from "@/lib/context";
import { can } from "@/lib/auth/rbac";
import { sha256 } from "@/lib/crypto";
import { ApiError, badRequest } from "@/lib/errors";
import { putObject } from "@/lib/storage";
import { ZodError } from "zod";
import { DEFAULT_CONSENT_SCOPE, addEvidence, createPlot, fireGeometryChanged, validatePlotGeometry } from "./farmers";

/**
 * POST /sync — batch upload from the offline field app (F2.6, N1).
 * - Idempotent: every op carries a client-generated opId; replays return the stored result.
 * - Entities carry a clientId; references between offline-created records use clientIds.
 * - Conflicts: last-write-wins per field using the client's per-field timestamps; the losing
 *   value is recorded in the audit log (SYNC_CONFLICT).
 */
const iso = z.string().datetime({ offset: true });

const farmerOp = z.object({
  opId: z.string().min(8).max(80),
  type: z.literal("farmer.upsert"),
  clientId: z.string().min(4).max(80),
  data: z.object({
    fullName: z.string().trim().min(2).max(160),
    village: z.string().trim().min(1).max(120),
    district: z.string().trim().min(1).max(120),
    regency: z.string().trim().min(1).max(120),
    province: z.string().trim().min(1).max(120),
    phone: z.string().trim().max(40).nullish(),
    consent: z.literal(true, { error: "Persetujuan berbagi data wajib" }),
    consentAt: iso,
  }),
  fieldTimes: z.record(z.string(), iso).default({}),
});

const plotOp = z.object({
  opId: z.string().min(8).max(80),
  type: z.literal("plot.upsert"),
  clientId: z.string().min(4).max(80),
  data: z.object({
    farmerId: z.string().uuid().nullish(),
    farmerClientId: z.string().nullish(),
    label: z.string().trim().max(120).nullish(),
    declaredAreaHa: z.number().positive(),
    point: z.unknown().nullish(),
    polygon: z.unknown().nullish(),
    gpsAccuracyM: z.number().min(0).nullish(),
    capturedAt: iso,
  }),
  fieldTimes: z.record(z.string(), iso).default({}),
});

const evidenceOp = z.object({
  opId: z.string().min(8).max(80),
  type: z.literal("evidence.create"),
  clientId: z.string().min(4).max(80),
  data: z.object({
    plotId: z.string().uuid().nullish(),
    plotClientId: z.string().nullish(),
    type: z.enum(["SHM", "SKT", "SKD", "OTHER", "NONE"]),
    documentNumber: z.string().max(120).nullish(),
    notes: z.string().max(1000).nullish(),
    photoKeys: z.array(z.string()).default([]),
  }),
});

const purchaseOp = z.object({
  opId: z.string().min(8).max(80),
  type: z.literal("purchase.create"),
  clientId: z.string().min(4).max(80),
  data: z.object({
    farmerId: z.string().uuid().nullish(),
    farmerClientId: z.string().nullish(),
    plotId: z.string().uuid().nullish(),
    plotClientId: z.string().nullish(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    weightKg: z.number().positive(),
    form: z.enum(["CHERRY", "PARCHMENT", "GREEN"]),
  }),
});

export const syncOpSchema = z.discriminatedUnion("type", [farmerOp, plotOp, evidenceOp, purchaseOp]);
export type SyncOp = z.infer<typeof syncOpSchema>;
export const syncBatchSchema = z.object({ deviceId: z.string().max(80).optional(), ops: z.array(z.unknown()).min(1).max(500) });

export type SyncResult = { opId: string; ok: boolean; entity?: string; id?: string; clientId?: string; error?: string; conflicts?: string[]; replayed?: boolean };

type PurchaseHandler = (ctx: Ctx, op: Extract<SyncOp, { type: "purchase.create" }>, resolve: Resolver) => Promise<{ id: string }>;
let purchaseHandler: PurchaseHandler | null = null;
/** registered by the purchases module (M5) */
export const registerPurchaseSync = (h: PurchaseHandler) => (purchaseHandler = h);

type Resolver = { farmer: (id?: string | null, clientId?: string | null) => Promise<string>; plot: (id?: string | null, clientId?: string | null) => Promise<string> };

function resolver(ctx: Ctx): Resolver {
  return {
    async farmer(id, clientId) {
      const f = id
        ? await prisma.farmer.findFirst({ where: { id, orgId: ctx.orgId }, select: { id: true } })
        : clientId ? await prisma.farmer.findFirst({ where: { clientId, orgId: ctx.orgId }, select: { id: true } }) : null;
      if (!f) throw badRequest("Petani rujukan belum tersinkron");
      return f.id;
    },
    async plot(id, clientId) {
      const p = id
        ? await prisma.plot.findFirst({ where: { id, orgId: ctx.orgId }, select: { id: true } })
        : clientId ? await prisma.plot.findFirst({ where: { clientId, orgId: ctx.orgId }, select: { id: true } }) : null;
      if (!p) throw badRequest("Kebun rujukan belum tersinkron");
      return p.id;
    },
  };
}

/** Merge incoming fields into an existing record by per-field timestamps. */
function mergeFields(existing: Record<string, unknown>, clock: Record<string, string>, incoming: Record<string, unknown>, times: Record<string, string>, fallback: string) {
  const update: Record<string, unknown> = {};
  const newClock = { ...clock };
  const conflicts: { field: string; kept: unknown; rejected: unknown; winner: "server" | "client" }[] = [];
  for (const [field, value] of Object.entries(incoming)) {
    if (value === undefined) continue;
    const t = times[field] ?? fallback;
    const serverT = clock[field];
    const same = JSON.stringify(existing[field] ?? null) === JSON.stringify(value ?? null);
    if (!serverT || t > serverT) {
      if (!same) {
        if (serverT) conflicts.push({ field, kept: value, rejected: existing[field], winner: "client" });
        update[field] = value;
      }
      newClock[field] = t;
    } else if (!same) {
      conflicts.push({ field, kept: existing[field], rejected: value, winner: "server" });
    }
  }
  return { update, newClock, conflicts };
}

async function logConflicts(ctx: Ctx, entity: string, entityId: string, opId: string, conflicts: unknown[]) {
  if (!conflicts.length) return;
  await prisma.auditLog.create({ data: { orgId: ctx.orgId, actorId: ctx.userId, entity, entityId, action: "SYNC_CONFLICT", meta: { opId, conflicts } as object } });
}

async function applyOp(ctx: Ctx, op: SyncOp, resolve: Resolver): Promise<Omit<SyncResult, "opId" | "ok">> {
  switch (op.type) {
    case "farmer.upsert": {
      const { consent, consentAt, ...fields } = op.data;
      void consent;
      const existing = await prisma.farmer.findFirst({ where: { orgId: ctx.orgId, clientId: op.clientId } });
      const fallback = consentAt;
      if (!existing) {
        const clock = Object.fromEntries(Object.keys(fields).map((k) => [k, op.fieldTimes[k] ?? fallback]));
        const f = await prisma.farmer.create({
          data: { ...fields, phone: fields.phone ?? null, clientId: op.clientId, consentAt: new Date(consentAt), consentScope: DEFAULT_CONSENT_SCOPE, fieldClock: clock, orgId: ctx.orgId, createdBy: ctx.userId },
        });
        return { entity: "farmer", id: f.id, clientId: op.clientId };
      }
      const { update, newClock, conflicts } = mergeFields(existing as unknown as Record<string, unknown>, existing.fieldClock as Record<string, string>, fields, op.fieldTimes, fallback);
      if (Object.keys(update).length || JSON.stringify(newClock) !== JSON.stringify(existing.fieldClock)) {
        await prisma.farmer.update({ where: { id: existing.id }, data: { ...update, fieldClock: newClock } });
      }
      await logConflicts(ctx, "farmer", existing.id, op.opId, conflicts);
      return { entity: "farmer", id: existing.id, clientId: op.clientId, conflicts: conflicts.map((c) => c.field) };
    }

    case "plot.upsert": {
      const d = op.data;
      const existing = await prisma.plot.findFirst({ where: { orgId: ctx.orgId, clientId: op.clientId } });
      if (!existing) {
        const farmerId = await resolve.farmer(d.farmerId, d.farmerClientId);
        const plot = await createPlot(ctx, { ...d, farmerId, clientId: op.clientId });
        const clock = { label: op.fieldTimes.label ?? d.capturedAt, geometry: op.fieldTimes.geometry ?? d.capturedAt };
        await prisma.plot.update({ where: { id: plot.id }, data: { fieldClock: clock } });
        return { entity: "plot", id: plot.id, clientId: op.clientId };
      }
      // geometry (point/polygon/area/accuracy) is one logical field; label another
      const clock = existing.fieldClock as Record<string, string>;
      const conflicts: string[] = [];
      const update: Record<string, unknown> = {};
      const newClock = { ...clock };
      const tLabel = op.fieldTimes.label ?? d.capturedAt;
      if (d.label !== undefined) {
        if (!clock.label || tLabel > clock.label) { update.label = d.label; newClock.label = tLabel; }
        else if ((d.label ?? null) !== existing.label) conflicts.push("label");
      }
      const tGeom = op.fieldTimes.geometry ?? d.capturedAt;
      let geometryChanged = false;
      if (!clock.geometry || tGeom > clock.geometry) {
        const geom = await validatePlotGeometry(ctx.orgId, d);
        Object.assign(update, {
          geomPoint: geom.geomPoint ?? null, geomPolygon: geom.geomPolygon ?? null, computedAreaHa: geom.computedAreaHa,
          declaredAreaHa: d.declaredAreaHa, gpsAccuracyM: d.gpsAccuracyM ?? null, capturedAt: new Date(d.capturedAt), capturedBy: ctx.userId,
        });
        newClock.geometry = tGeom;
        geometryChanged = true;
      } else {
        conflicts.push("geometry");
      }
      await prisma.plot.update({ where: { id: existing.id }, data: { ...update, fieldClock: newClock } });
      if (conflicts.length) await logConflicts(ctx, "plot", existing.id, op.opId, conflicts.map((field) => ({ field, winner: "server" })));
      if (geometryChanged) await fireGeometryChanged(ctx.orgId, existing.id, ctx.userId);
      return { entity: "plot", id: existing.id, clientId: op.clientId, conflicts };
    }

    case "evidence.create": {
      const existing = await prisma.legalityEvidence.findFirst({ where: { orgId: ctx.orgId, clientId: op.clientId } });
      if (existing) return { entity: "legalityEvidence", id: existing.id, clientId: op.clientId };
      const plotId = await resolve.plot(op.data.plotId, op.data.plotClientId);
      const ev = await addEvidence(ctx, plotId, { ...op.data, clientId: op.clientId }, [], op.data.photoKeys);
      return { entity: "legalityEvidence", id: ev.id, clientId: op.clientId };
    }

    case "purchase.create": {
      if (!purchaseHandler) throw badRequest("Pencatatan pembelian belum tersedia");
      const p = await purchaseHandler(ctx, op, resolve);
      return { entity: "purchase", id: p.id, clientId: op.clientId };
    }
  }
}

const PERM: Record<SyncOp["type"], Parameters<typeof can>[1]> = {
  "farmer.upsert": "farmer:write", "plot.upsert": "plot:write", "evidence.create": "plot:write", "purchase.create": "purchase:write",
};

/** Apply ops in order. Each op succeeds or fails on its own; failures are returned, not thrown. */
export async function syncBatch(ctx: Ctx, input: unknown) {
  const { ops } = syncBatchSchema.parse(input);
  const resolve = resolver(ctx);
  const results: SyncResult[] = [];
  for (const raw of ops) {
    const opId = String((raw as { opId?: unknown })?.opId ?? "");
    const receipt = opId ? await prisma.syncReceipt.findUnique({ where: { orgId_opId: { orgId: ctx.orgId, opId } } }) : null;
    if (receipt) {
      results.push({ ...(receipt.result as SyncResult), opId, replayed: true });
      continue;
    }
    let result: SyncResult;
    try {
      const op = syncOpSchema.parse(raw);
      if (!can(ctx.role, PERM[op.type])) throw new ApiError(403, "Aksi tidak diizinkan untuk peran Anda");
      result = { opId, ok: true, ...(await applyOp(ctx, op, resolve)) };
    } catch (e) {
      const msg = e instanceof ZodError ? e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") : e instanceof Error ? e.message : String(e);
      result = { opId, ok: false, error: msg };
      // transient reference errors are retried later; validation errors are final
      if (e instanceof ApiError && e.status === 400 && /belum tersinkron/.test(e.message)) {
        results.push(result);
        continue;
      }
    }
    if (opId) {
      await prisma.syncReceipt.create({ data: { orgId: ctx.orgId, opId, entity: result.entity ?? "error", entityId: result.id ?? null, result: result as object, createdBy: ctx.userId } });
    }
    results.push(result);
  }
  return { results, serverTime: new Date().toISOString() };
}

/** Photo upload for the field app: content-addressed, so retries do not duplicate files. */
export async function syncUpload(ctx: Ctx, file: File) {
  const allowed: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
  const ext = allowed[file.type];
  if (!ext) throw badRequest("Foto harus JPG, PNG, atau WEBP");
  if (file.size > 10 * 1024 * 1024) throw badRequest("Ukuran foto maksimal 10 MB");
  const buf = Buffer.from(await file.arrayBuffer());
  const key = `${ctx.orgId}/uploads/${sha256(buf)}.${ext}`;
  await putObject(key, buf);
  return { key };
}

/** Reference data the field app caches for offline use. */
export async function fieldSnapshot(ctx: Ctx) {
  const [farmers, plots, org] = await Promise.all([
    prisma.farmer.findMany({ where: { orgId: ctx.orgId }, select: { id: true, clientId: true, fullName: true, village: true, district: true, regency: true, province: true, phone: true }, orderBy: { fullName: "asc" } }),
    prisma.plot.findMany({ where: { orgId: ctx.orgId }, select: { id: true, clientId: true, farmerId: true, label: true, declaredAreaHa: true, riskStatus: true, geomPoint: true } }),
    prisma.organization.findUniqueOrThrow({ where: { id: ctx.orgId }, select: { name: true, settings: true } }),
  ]);
  return { farmers, plots: plots.map((p) => ({ ...p, declaredAreaHa: Number(p.declaredAreaHa) })), org: { name: org.name, settings: org.settings }, serverTime: new Date().toISOString() };
}
