import {
  area as turfArea, bbox as turfBbox, booleanIntersects, circle, featureCollection, intersect, polygon as turfPolygon, union,
} from "@turf/turf";
import type { Feature, FeatureCollection, MultiPolygon, Point, Polygon } from "geojson";

/** Version of the R01–R05 logic below; stored on every risk_check (N7). */
export const RISK_RULES_VERSION = "risk-rules-2026.10.1";

export type RiskStatusCode = "PASS" | "REVIEW" | "RISK" | "ERROR";
export type RiskReason = { ruleId: "R01" | "R02" | "R03" | "R04" | "R05"; status: RiskStatusCode; message: string };

export type RiskInput = {
  point: Point | null;
  polygon: Polygon | null;
  declaredAreaHa: number;
  /** legality evidence types recorded for the plot */
  evidenceTypes: string[];
  forest2020: FeatureCollection | null;
  forestArea: FeatureCollection | null;
  thresholds: { passBelowPct: number; riskAbovePct: number; polygonRequiredAboveHa: number };
};

export type RiskResult = {
  status: RiskStatusCode;
  forestPct2020: number | null;
  overlapsForestArea: boolean;
  reasons: RiskReason[];
  /** geometry actually assessed: polygon, or a circle of the declared area around the point */
  assessed: "polygon" | "point-buffer" | "none";
};

type Poly = Feature<Polygon | MultiPolygon>;

const polys = (fc: FeatureCollection | null): Poly[] =>
  (fc?.features ?? []).filter((f): f is Poly => f.geometry?.type === "Polygon" || f.geometry?.type === "MultiPolygon");

const bboxOverlap = (a: number[], b: number[]) => a[0]! <= b[2]! && a[2]! >= b[0]! && a[1]! <= b[3]! && a[3]! >= b[1]!;

/** Area (m²) of `shape` covered by the union of `layer` polygons. */
export function coveredArea(shape: Poly, layer: Poly[]): number {
  const bb = turfBbox(shape);
  const candidates = layer.filter((f) => bboxOverlap(turfBbox(f), bb) && booleanIntersects(f, shape));
  if (!candidates.length) return 0;
  const merged = candidates.length === 1 ? candidates[0]! : (union(featureCollection(candidates)) as Poly | null);
  if (!merged) return 0;
  const inter = intersect(featureCollection([shape, merged]));
  return inter ? turfArea(inter) : 0;
}

const SEVERITY: Record<RiskStatusCode, number> = { PASS: 0, REVIEW: 1, RISK: 2, ERROR: 3 };

/** Deterministic evaluation of R01–R05 for one plot (F3.1–F3.3). */
export function evaluateRisk(input: RiskInput): RiskResult {
  const t = input.thresholds;
  const reasons: RiskReason[] = [];

  // R04 — declared > threshold without polygon: cannot be checked
  if (input.declaredAreaHa > t.polygonRequiredAboveHa && !input.polygon) {
    reasons.push({ ruleId: "R04", status: "ERROR", message: `Luas dinyatakan ${input.declaredAreaHa} ha > ${t.polygonRequiredAboveHa} ha tanpa poligon; tidak bisa dicek.` });
    return { status: "ERROR", forestPct2020: null, overlapsForestArea: false, reasons, assessed: "none" };
  }

  let shape: Poly | null = null;
  let assessed: RiskResult["assessed"] = "none";
  if (input.polygon) {
    shape = turfPolygon(input.polygon.coordinates);
    assessed = "polygon";
  } else if (input.point) {
    // point plot (≤ 4 ha): assess a circle with the declared area around the point
    const radiusKm = Math.sqrt((Math.max(input.declaredAreaHa, 0.01) * 10_000) / Math.PI) / 1000;
    shape = circle(input.point.coordinates, radiusKm, { steps: 48, units: "kilometers" });
    assessed = "point-buffer";
  }
  if (!shape) {
    reasons.push({ ruleId: "R04", status: "ERROR", message: "Kebun tidak punya geometri." });
    return { status: "ERROR", forestPct2020: null, overlapsForestArea: false, reasons, assessed };
  }

  const total = turfArea(shape);
  const forestPct = input.forest2020 ? Math.min(100, (coveredArea(shape, polys(input.forest2020)) / total) * 100) : null;
  const pct = forestPct == null ? null : Math.round(forestPct * 100) / 100;
  const overlapsForestArea = input.forestArea ? polys(input.forestArea).some((f) => booleanIntersects(f, shape!)) : false;

  if (pct == null) {
    reasons.push({ ruleId: "R02", status: "REVIEW", message: "Dataset tutupan hutan 2020 untuk area ini belum tersedia." });
  } else if (pct < t.passBelowPct) {
    reasons.push({ ruleId: "R01", status: "PASS", message: `Tutupan hutan 2020 ${pct}% (< ${t.passBelowPct}%).` });
  } else if (pct > t.riskAbovePct) {
    reasons.push({ ruleId: "R03", status: "RISK", message: `Tutupan hutan 2020 ${pct}% (> ${t.riskAbovePct}%).` });
  } else {
    reasons.push({ ruleId: "R02", status: "REVIEW", message: `Tutupan hutan 2020 ${pct}% (${t.passBelowPct}–${t.riskAbovePct}%).` });
  }
  if (overlapsForestArea) reasons.push({ ruleId: "R02", status: "REVIEW", message: "Kebun beririsan dengan batas kawasan hutan." });

  // R05 — no legality evidence
  const realEvidence = input.evidenceTypes.filter((x) => x !== "NONE");
  if (!realEvidence.length) {
    reasons.push({ ruleId: "R05", status: "REVIEW", message: input.evidenceTypes.length ? "Tercatat belum ada bukti legalitas lahan." : "Bukti legalitas lahan belum dicatat." });
  }

  const status = reasons.reduce<RiskStatusCode>((s, r) => (SEVERITY[r.status] > SEVERITY[s] ? r.status : s), "PASS");
  return { status, forestPct2020: pct, overlapsForestArea, reasons, assessed };
}
