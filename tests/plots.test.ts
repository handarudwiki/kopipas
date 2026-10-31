import { describe, expect, it } from "vitest";
import { areaHa, normalizePoint, normalizePolygon, parseGeoFile } from "@/lib/geo";
import { addEvidence, createFarmer, createPlot, updatePlot } from "@/server/farmers";
import { as, makeOrg } from "./helpers";

/** ~2 ha square near Sidikalang, Dairi (≈141 m × 141 m). */
export const SQUARE_2HA = {
  type: "Polygon" as const,
  coordinates: [[[98.3200001, 2.7400004], [98.3212711, 2.7400004], [98.3212711, 2.7412714], [98.3200001, 2.7412714], [98.3200001, 2.7400004]]],
};

async function farmerFor(role: "ADMIN" | "FIELD_OFFICER" = "ADMIN") {
  const { ctx } = await makeOrg(role);
  const f = await as(ctx, () => createFarmer(ctx, { fullName: "Pak Tigor Sinaga", village: "Lae Pondom", district: "Sidikalang", regency: "Dairi", province: "Sumatera Utara", consent: true }));
  return { ctx, farmer: f };
}

describe("geometry (F2.2, F2.3)", () => {
  it("stores coordinates with 6 decimals", () => {
    expect(normalizePoint({ type: "Point", coordinates: [98.123456789, 2.987654321] }).coordinates).toEqual([98.123457, 2.987654]);
    const p = normalizePolygon(SQUARE_2HA);
    expect(p.coordinates[0]![0]).toEqual([98.32, 2.74]);
  });
  it("auto-closes rings and computes area in ha", () => {
    const open = { type: "Polygon", coordinates: [SQUARE_2HA.coordinates[0]!.slice(0, 4)] };
    const p = normalizePolygon(open);
    expect(p.coordinates[0]![0]).toEqual(p.coordinates[0]![4]);
    expect(areaHa(p)).toBeGreaterThan(1.9);
    expect(areaHa(p)).toBeLessThan(2.1);
  });
  it("rejects self-intersecting (bow-tie) polygons", () => {
    const bowtie = { type: "Polygon", coordinates: [[[98.32, 2.74], [98.33, 2.75], [98.33, 2.74], [98.32, 2.75], [98.32, 2.74]]] };
    expect(() => normalizePolygon(bowtie)).toThrow(/berpotongan/);
  });
  it("rejects polygons with fewer than 3 distinct vertices", () => {
    expect(() => normalizePolygon({ type: "Polygon", coordinates: [[[98.32, 2.74], [98.33, 2.75], [98.32, 2.74]]] })).toThrow();
  });
  it("parses KML and GeoJSON uploads", async () => {
    const kml = `<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Placemark><name>Kebun</name><Polygon><outerBoundaryIs><LinearRing><coordinates>
      98.3200001,2.7400004,0 98.3212711,2.7400004,0 98.3212711,2.7412714,0 98.3200001,2.7412714,0 98.3200001,2.7400004,0
    </coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark></kml>`;
    const g = await parseGeoFile(kml, "kebun.kml");
    expect(g.polygon?.coordinates[0]).toHaveLength(5);
    const gj = await parseGeoFile(JSON.stringify({ type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [98.1, 2.1, 900] } }] }), "p.geojson");
    expect(gj.point?.coordinates).toEqual([98.1, 2.1]);
  });
});

describe("farmers (F2.1)", () => {
  it("cannot be saved without consent", async () => {
    const { ctx } = await makeOrg("FIELD_OFFICER");
    await expect(as(ctx, () => createFarmer(ctx, { fullName: "Tanpa Izin", village: "A", district: "B", regency: "C", province: "D", consent: false }))).rejects.toThrow(/Persetujuan/);
  });
  it("records consent time and scope", async () => {
    const { farmer } = await farmerFor();
    expect(farmer.consentAt).toBeInstanceOf(Date);
    expect(farmer.consentScope).toMatch(/EUDR/);
  });
});

describe("plots (F2.2–F2.4)", () => {
  it("rejects GPS accuracy worse than 15 m", async () => {
    const { ctx, farmer } = await farmerFor();
    await expect(as(ctx, () => createPlot(ctx, { farmerId: farmer.id, declaredAreaHa: 1, point: { type: "Point", coordinates: [98.32, 2.74] }, gpsAccuracyM: 22 }))).rejects.toMatchObject({ status: 422 });
    const ok = await as(ctx, () => createPlot(ctx, { farmerId: farmer.id, declaredAreaHa: 1, point: { type: "Point", coordinates: [98.32, 2.74] }, gpsAccuracyM: 8.5 }));
    expect(Number(ok.gpsAccuracyM)).toBe(8.5);
  });
  it("requires a polygon when declared area > 4 ha", async () => {
    const { ctx, farmer } = await farmerFor();
    await expect(as(ctx, () => createPlot(ctx, { farmerId: farmer.id, declaredAreaHa: 4.5, point: { type: "Point", coordinates: [98.32, 2.74] } }))).rejects.toThrow(/poligon/);
    const ok = await as(ctx, () => createPlot(ctx, { farmerId: farmer.id, declaredAreaHa: 4.5, polygon: SQUARE_2HA }));
    expect(Number(ok.computedAreaHa)).toBeGreaterThan(1.9);
    expect(ok.geomPoint).toBeTruthy(); // centroid derived
  });
  it("cannot attach a plot to another org's farmer", async () => {
    const { farmer } = await farmerFor();
    const { ctx: other } = await makeOrg("ADMIN");
    await expect(as(other, () => createPlot(other, { farmerId: farmer.id, declaredAreaHa: 1, point: { type: "Point", coordinates: [98.32, 2.74] } }))).rejects.toMatchObject({ status: 404 });
  });
  it("geometry update cannot drop the polygon of a > 4 ha plot", async () => {
    const { ctx, farmer } = await farmerFor();
    const plot = await as(ctx, () => createPlot(ctx, { farmerId: farmer.id, declaredAreaHa: 5, polygon: SQUARE_2HA }));
    await expect(as(ctx, () => updatePlot(ctx, plot.id, { polygon: null, point: { type: "Point", coordinates: [98.32, 2.74] } }))).rejects.toMatchObject({ status: 422 });
  });
});

describe("legality evidence (F2.5)", () => {
  it("requires a photo unless type is NONE", async () => {
    const { ctx, farmer } = await farmerFor();
    const plot = await as(ctx, () => createPlot(ctx, { farmerId: farmer.id, declaredAreaHa: 1, point: { type: "Point", coordinates: [98.32, 2.74] } }));
    await expect(as(ctx, () => addEvidence(ctx, plot.id, { type: "SHM", documentNumber: "123" }))).rejects.toMatchObject({ status: 422 });
    const none = await as(ctx, () => addEvidence(ctx, plot.id, { type: "NONE", notes: "Lahan warisan, belum bersertifikat" }));
    expect(none.type).toBe("NONE");
    const photo = new File([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])], "shm.jpg", { type: "image/jpeg" });
    const shm = await as(ctx, () => addEvidence(ctx, plot.id, { type: "SHM", documentNumber: "SHM-01" }, [photo]));
    expect(shm.photoKeys).toHaveLength(1);
    expect(shm.photoKeys[0]!.startsWith(`${ctx.orgId}/`)).toBe(true);
  });
});
