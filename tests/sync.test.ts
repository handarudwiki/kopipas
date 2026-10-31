import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { syncBatch } from "@/server/sync";
import { as, makeOrg } from "./helpers";

const T0 = "2026-10-20T08:00:00.000Z";
const T1 = "2026-10-21T08:00:00.000Z";
const T2 = "2026-10-22T08:00:00.000Z";
const uid = () => Math.random().toString(36).slice(2, 12);

const farmerOp = (clientId: string, over: Record<string, unknown> = {}, fieldTimes: Record<string, string> = {}) => ({
  opId: `op-${uid()}`, type: "farmer.upsert", clientId, fieldTimes,
  data: { fullName: "Pak Saut Manik", village: "Kuta Gugung", district: "Sumbul", regency: "Dairi", province: "Sumatera Utara", phone: "0812", consent: true, consentAt: T0, ...over },
});

describe("POST /sync (F2.6, N1)", () => {
  it("creates farmer → plot → evidence in one batch using client ids", async () => {
    const { ctx } = await makeOrg("FIELD_OFFICER");
    const fc = `f-${uid()}`;
    const pc = `p-${uid()}`;
    const r = await as(ctx, () => syncBatch(ctx, {
      ops: [
        farmerOp(fc),
        { opId: `op-${uid()}`, type: "plot.upsert", clientId: pc, data: { farmerClientId: fc, label: "Kebun Sumbul", declaredAreaHa: 1.2, point: { type: "Point", coordinates: [98.4123456, 2.7654321] }, gpsAccuracyM: 6, capturedAt: T0 } },
        { opId: `op-${uid()}`, type: "evidence.create", clientId: `e-${uid()}`, data: { plotClientId: pc, type: "NONE", notes: "belum ada surat" } },
      ],
    }));
    expect(r.results.map((x) => x.ok)).toEqual([true, true, true]);
    const plot = await prisma.plot.findFirstOrThrow({ where: { orgId: ctx.orgId, clientId: pc } });
    expect((plot.geomPoint as { coordinates: number[] }).coordinates).toEqual([98.412346, 2.765432]);
    expect(plot.riskStatus).not.toBe("PENDING"); // risk check ran
  });

  it("is idempotent: replaying the same ops creates no duplicates", async () => {
    const { ctx } = await makeOrg("FIELD_OFFICER");
    const op = farmerOp(`f-${uid()}`);
    const a = await as(ctx, () => syncBatch(ctx, { ops: [op] }));
    const b = await as(ctx, () => syncBatch(ctx, { ops: [op] }));
    expect(b.results[0]).toMatchObject({ ok: true, replayed: true, id: a.results[0]!.id });
    expect(await prisma.farmer.count({ where: { orgId: ctx.orgId } })).toBe(1);
    // same clientId, different opId → update, still one row
    await as(ctx, () => syncBatch(ctx, { ops: [{ ...op, opId: `op-${uid()}` }] }));
    expect(await prisma.farmer.count({ where: { orgId: ctx.orgId } })).toBe(1);
  });

  it("resolves conflicts per field by latest timestamp and logs them", async () => {
    const { ctx } = await makeOrg("FIELD_OFFICER");
    const fc = `f-${uid()}`;
    await as(ctx, () => syncBatch(ctx, { ops: [farmerOp(fc, {}, { phone: T1, village: T1 })] }));
    // device B edited phone later (T2) but village earlier (T0)
    const r = await as(ctx, () => syncBatch(ctx, { ops: [farmerOp(fc, { phone: "0899", village: "Desa Lama" }, { phone: T2, village: T0 })] }));
    const f = await prisma.farmer.findFirstOrThrow({ where: { orgId: ctx.orgId, clientId: fc } });
    expect(f.phone).toBe("0899"); // newer wins
    expect(f.village).toBe("Kuta Gugung"); // server value was newer
    expect(r.results[0]!.conflicts).toEqual(expect.arrayContaining(["phone", "village"]));
    const log = await prisma.auditLog.findFirst({ where: { orgId: ctx.orgId, action: "SYNC_CONFLICT", entityId: f.id } });
    expect(log).not.toBeNull();
  });

  it("returns per-op validation errors without failing the batch", async () => {
    const { ctx } = await makeOrg("FIELD_OFFICER");
    const fc = `f-${uid()}`;
    const r = await as(ctx, () => syncBatch(ctx, {
      ops: [
        farmerOp(fc),
        { opId: `op-${uid()}`, type: "plot.upsert", clientId: `p-${uid()}`, data: { farmerClientId: fc, declaredAreaHa: 1, point: { type: "Point", coordinates: [98.4, 2.7] }, gpsAccuracyM: 40, capturedAt: T0 } },
        farmerOp(`f-${uid()}`, { consent: false }),
      ],
    }));
    expect(r.results.map((x) => x.ok)).toEqual([true, false, false]);
    expect(r.results[1]!.error).toMatch(/Akurasi GPS/);
  });

  it("unresolved references are not receipted so they can be retried", async () => {
    const { ctx } = await makeOrg("FIELD_OFFICER");
    const op = { opId: `op-${uid()}`, type: "plot.upsert", clientId: `p-${uid()}`, data: { farmerClientId: "not-yet", declaredAreaHa: 1, point: { type: "Point", coordinates: [98.4, 2.7] }, capturedAt: T0 } };
    const r = await as(ctx, () => syncBatch(ctx, { ops: [op] }));
    expect(r.results[0]!.ok).toBe(false);
    expect(await prisma.syncReceipt.count({ where: { orgId: ctx.orgId, opId: op.opId } })).toBe(0);
  });

  it("enforces roles per op (doc staff cannot sync farmers)", async () => {
    const { ctx } = await makeOrg("DOC_STAFF");
    const r = await as(ctx, () => syncBatch(ctx, { ops: [farmerOp(`f-${uid()}`)] }));
    expect(r.results[0]).toMatchObject({ ok: false });
  });
});
