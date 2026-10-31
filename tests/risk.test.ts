import { describe, expect, it } from "vitest";
import type { FeatureCollection, Polygon } from "geojson";
import { prisma } from "@/lib/db";
import { evaluateRisk } from "@/lib/geo/risk";
import { addEvidence, createFarmer, createPlot } from "@/server/farmers";
import { createDataset, decideRiskCheck, runRiskCheck } from "@/server/risk";
import { as, makeOrg } from "./helpers";

// 0.01° square plot near (98.5, 2.5) ≈ 1.11 km × 1.11 km
const sq = (x0: number, y0: number, d: number): Polygon => ({ type: "Polygon", coordinates: [[[x0, y0], [x0 + d, y0], [x0 + d, y0 + d], [x0, y0 + d], [x0, y0]]] });
const fc = (...p: Polygon[]): FeatureCollection => ({ type: "FeatureCollection", features: p.map((g) => ({ type: "Feature", properties: {}, geometry: g })) });

const PLOT = sq(98.5, 2.5, 0.01);
const T = { passBelowPct: 5, riskAbovePct: 20, polygonRequiredAboveHa: 4 };
const base = { point: null, polygon: PLOT, declaredAreaHa: 3, evidenceTypes: ["SHM"], forestArea: null, thresholds: T };

describe("risk rules R01–R05", () => {
  it("R01 forest < 5% → PASS", () => {
    const r = evaluateRisk({ ...base, forest2020: fc(sq(98.6, 2.6, 0.01)) });
    expect(r.status).toBe("PASS");
    expect(r.forestPct2020).toBe(0);
    expect(r.reasons.map((x) => x.ruleId)).toEqual(["R01"]);
  });

  it("R02 forest 5–20% → REVIEW", () => {
    // forest covers 10% of the plot width
    const r = evaluateRisk({ ...base, forest2020: fc({ type: "Polygon", coordinates: [[[98.5, 2.5], [98.501, 2.5], [98.501, 2.51], [98.5, 2.51], [98.5, 2.5]]] }) });
    expect(r.forestPct2020).toBeGreaterThan(9.5);
    expect(r.forestPct2020).toBeLessThan(10.5);
    expect(r.status).toBe("REVIEW");
  });

  it("R03 forest > 20% → RISK", () => {
    const r = evaluateRisk({ ...base, forest2020: fc({ type: "Polygon", coordinates: [[[98.5, 2.5], [98.505, 2.5], [98.505, 2.51], [98.5, 2.51], [98.5, 2.5]]] }) });
    expect(r.forestPct2020).toBeCloseTo(50, 0);
    expect(r.status).toBe("RISK");
  });

  it("overlapping forest polygons are not double counted", () => {
    const half: Polygon = { type: "Polygon", coordinates: [[[98.5, 2.5], [98.505, 2.5], [98.505, 2.51], [98.5, 2.51], [98.5, 2.5]]] };
    const r = evaluateRisk({ ...base, forest2020: fc(half, half) });
    expect(r.forestPct2020).toBeCloseTo(50, 0);
  });

  it("thresholds are configurable", () => {
    const tenPct = fc({ type: "Polygon", coordinates: [[[98.5, 2.5], [98.501, 2.5], [98.501, 2.51], [98.5, 2.51], [98.5, 2.5]]] });
    expect(evaluateRisk({ ...base, forest2020: tenPct, thresholds: { ...T, passBelowPct: 12 } }).status).toBe("PASS");
    expect(evaluateRisk({ ...base, forest2020: tenPct, thresholds: { ...T, riskAbovePct: 8 } }).status).toBe("RISK");
  });

  it("R02 overlap with forest-area boundary → REVIEW (F3.3)", () => {
    const r = evaluateRisk({ ...base, forest2020: fc(), forestArea: fc(sq(98.509, 2.509, 0.05)) });
    expect(r.overlapsForestArea).toBe(true);
    expect(r.status).toBe("REVIEW");
  });

  it("R04 > 4 ha without polygon → ERROR, cannot be checked", () => {
    const r = evaluateRisk({ ...base, polygon: null, point: { type: "Point", coordinates: [98.5, 2.5] }, declaredAreaHa: 6, forest2020: fc() });
    expect(r.status).toBe("ERROR");
    expect(r.forestPct2020).toBeNull();
    expect(r.reasons[0]!.ruleId).toBe("R04");
  });

  it("R05 no legality evidence → REVIEW even when forest-free", () => {
    expect(evaluateRisk({ ...base, evidenceTypes: [], forest2020: fc() }).status).toBe("REVIEW");
    const r = evaluateRisk({ ...base, evidenceTypes: ["NONE"], forest2020: fc() });
    expect(r.status).toBe("REVIEW");
    expect(r.reasons.some((x) => x.ruleId === "R05")).toBe(true);
  });

  it("point plots are assessed as a circle of the declared area", () => {
    const r = evaluateRisk({ ...base, polygon: null, point: { type: "Point", coordinates: [98.505, 2.505] }, declaredAreaHa: 1, forest2020: fc(sq(98.5, 2.5, 0.01)) });
    expect(r.assessed).toBe("point-buffer");
    expect(r.forestPct2020).toBeCloseTo(100, 0);
    expect(r.status).toBe("RISK");
  });
});

describe("risk check job + verification (F3.1, F3.4)", () => {
  it("new plot is checked automatically, < 60 s, with dataset + rules version", async () => {
    const { ctx } = await makeOrg("ADMIN");
    await as(ctx, () => createDataset({ ...ctx, role: "SUPER_ADMIN" }, { kind: "FOREST_COVER_2020", version: `t-${Date.now()}`, name: "test forest" }, fc(sq(98.5, 2.5, 0.005))));
    const farmer = await as(ctx, () => createFarmer(ctx, { fullName: "Ibu Rosmawati", village: "A", district: "B", regency: "C", province: "D", consent: true }));
    const plot = await as(ctx, () => createPlot(ctx, { farmerId: farmer.id, declaredAreaHa: 3, polygon: PLOT }));
    const checks = await prisma.riskCheck.findMany({ where: { plotId: plot.id } });
    expect(checks).toHaveLength(1);
    expect(checks[0]!.status).toBe("RISK"); // 25% forest
    expect(checks[0]!.datasetVersion).toMatch(/^FC2020:t-/);
    expect(checks[0]!.rulesVersion).toMatch(/^risk-rules-/);
    expect(checks[0]!.durationMs!).toBeLessThan(60_000);
    expect((await prisma.plot.findUniqueOrThrow({ where: { id: plot.id } })).riskStatus).toBe("RISK");

    // evidence change → new check version
    await as(ctx, () => addEvidence(ctx, plot.id, { type: "NONE" }));
    expect(await prisma.riskCheck.count({ where: { plotId: plot.id } })).toBe(2);

    // F3.4 admin decision with note → status changes, audit-logged
    const latest = await prisma.riskCheck.findFirstOrThrow({ where: { plotId: plot.id }, orderBy: { createdAt: "desc" } });
    await expect(as(ctx, () => decideRiskCheck(ctx, plot.id, latest.id, { decision: "PASS", note: "short" }))).rejects.toThrow();
    await as(ctx, () => decideRiskCheck(ctx, plot.id, latest.id, { decision: "PASS", note: "Verifikasi lapangan: area hutan adalah kebun kopi naungan sejak 2015." }));
    expect((await prisma.plot.findUniqueOrThrow({ where: { id: plot.id } })).riskStatus).toBe("PASS");
    const log = await prisma.auditLog.findFirst({ where: { entity: "riskCheck", entityId: latest.id, action: "UPDATE", actorId: ctx.userId } });
    expect(log).not.toBeNull();
  });

  it("re-check is idempotent in status and keeps history", async () => {
    const { ctx } = await makeOrg("ADMIN");
    const farmer = await as(ctx, () => createFarmer(ctx, { fullName: "Pak Lumban", village: "A", district: "B", regency: "C", province: "D", consent: true }));
    const plot = await as(ctx, () => createPlot(ctx, { farmerId: farmer.id, declaredAreaHa: 1, point: { type: "Point", coordinates: [120, -5] } }));
    await runRiskCheck(ctx.orgId, plot.id, ctx.userId);
    const checks = await prisma.riskCheck.findMany({ where: { plotId: plot.id } });
    expect(checks.length).toBe(2);
    expect(new Set(checks.map((c) => c.status)).size).toBe(1);
  });
});
