import { area as turfArea, booleanValid, kinks, polygon as turfPolygon } from "@turf/turf";
import type { Feature, Point, Polygon, Position } from "geojson";

/** BRD: geolocation stored with 6 decimal places (~11 cm), SRID 4326 (WGS84 lon/lat). */
export const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

export class GeoError extends Error {}

function checkLonLat([lon, lat]: Position) {
  if (typeof lon !== "number" || typeof lat !== "number" || !Number.isFinite(lon) || !Number.isFinite(lat)) {
    throw new GeoError("Koordinat harus berupa angka [lon, lat]");
  }
  if (lon < -180 || lon > 180 || lat < -90 || lat > 90) throw new GeoError("Koordinat di luar rentang WGS84");
}

export function normalizePoint(input: unknown): Point {
  const g = input as Point;
  if (!g || g.type !== "Point" || !Array.isArray(g.coordinates)) throw new GeoError("Geometri titik harus GeoJSON Point");
  checkLonLat(g.coordinates);
  return { type: "Point", coordinates: [round6(g.coordinates[0]!), round6(g.coordinates[1]!)] };
}

/**
 * F2.3 — polygon must be closed and not self-intersecting. Rings are rounded to 6 decimals,
 * auto-closed if the last vertex is missing, and consecutive duplicates removed.
 */
export function normalizePolygon(input: unknown): Polygon {
  const g = input as Polygon;
  if (!g || g.type !== "Polygon" || !Array.isArray(g.coordinates) || !Array.isArray(g.coordinates[0])) {
    throw new GeoError("Geometri kebun harus GeoJSON Polygon");
  }
  const rings = g.coordinates.map((ring) => {
    const pts: Position[] = [];
    for (const p of ring) {
      checkLonLat(p);
      const q = [round6(p[0]!), round6(p[1]!)];
      const last = pts[pts.length - 1];
      if (!last || last[0] !== q[0] || last[1] !== q[1]) pts.push(q);
    }
    const first = pts[0];
    const last = pts[pts.length - 1];
    if (first && last && (first[0] !== last[0] || first[1] !== last[1])) pts.push([...first]);
    if (pts.length < 4) throw new GeoError("Poligon minimal 3 titik berbeda");
    return pts;
  });
  const poly = turfPolygon(rings);
  if (kinks(poly).features.length > 0) throw new GeoError("Poligon berpotongan sendiri; perbaiki urutan titik");
  if (!booleanValid(poly)) throw new GeoError("Poligon tidak valid");
  if (turfArea(poly) <= 0) throw new GeoError("Luas poligon nol");
  return { type: "Polygon", coordinates: rings };
}

/** Area in hectares, rounded to 4 decimals. */
export function areaHa(poly: Polygon): number {
  return Math.round((turfArea(turfPolygon(poly.coordinates)) / 10_000) * 10_000) / 10_000;
}

export function asFeature<G extends Point | Polygon>(geometry: G, properties: Record<string, unknown> = {}): Feature<G> {
  return { type: "Feature", geometry, properties };
}

/**
 * Parses an uploaded GeoJSON or KML file into geometries (first Point and/or Polygon found;
 * MultiPolygon → its largest polygon).
 */
export async function parseGeoFile(text: string, fileName: string): Promise<{ point: Point | null; polygon: Polygon | null }> {
  let fc: { type: string; features?: Feature[]; geometry?: unknown; coordinates?: unknown };
  if (/\.kml$/i.test(fileName) || text.trimStart().startsWith("<")) {
    const { kml } = await import("@tmcw/togeojson");
    const { DOMParser } = await import("@xmldom/xmldom");
    const dom = new DOMParser().parseFromString(text, "text/xml");
    fc = kml(dom as unknown as Document) as typeof fc;
  } else {
    try {
      fc = JSON.parse(text);
    } catch {
      throw new GeoError("File bukan GeoJSON/KML yang valid");
    }
  }
  const geoms: { type: string; coordinates: unknown }[] = [];
  const collect = (g: unknown) => {
    const x = g as { type?: string; coordinates?: unknown; geometries?: unknown[] };
    if (!x?.type) return;
    if (x.type === "GeometryCollection") x.geometries?.forEach(collect);
    else geoms.push(x as { type: string; coordinates: unknown });
  };
  if (fc.type === "FeatureCollection") fc.features?.forEach((f) => collect(f.geometry));
  else if (fc.type === "Feature") collect(fc.geometry);
  else collect(fc);

  let polygon: Polygon | null = null;
  let point: Point | null = null;
  for (const g of geoms) {
    if (g.type === "Polygon" && !polygon) polygon = { type: "Polygon", coordinates: stripZ(g.coordinates as Position[][]) };
    if (g.type === "MultiPolygon" && !polygon) {
      const polys = (g.coordinates as Position[][][]).map((c) => ({ type: "Polygon" as const, coordinates: stripZ(c) }));
      polygon = polys.sort((a, b) => turfArea(turfPolygon(b.coordinates)) - turfArea(turfPolygon(a.coordinates)))[0] ?? null;
    }
    if (g.type === "Point" && !point) point = { type: "Point", coordinates: (g.coordinates as Position).slice(0, 2) };
  }
  if (!polygon && !point) throw new GeoError("Tidak ada titik atau poligon dalam file");
  return { point: point ? normalizePoint(point) : null, polygon: polygon ? normalizePolygon(polygon) : null };
}

const stripZ = (rings: Position[][]) => rings.map((r) => r.map((p) => [p[0]!, p[1]!]));

/** Representative point of a polygon (centroid of the outer ring vertices). */
export function centroidOf(poly: Polygon): Point {
  const ring = poly.coordinates[0]!.slice(0, -1);
  const lon = ring.reduce((a, p) => a + p[0]!, 0) / ring.length;
  const lat = ring.reduce((a, p) => a + p[1]!, 0) / ring.length;
  return { type: "Point", coordinates: [round6(lon), round6(lat)] };
}
