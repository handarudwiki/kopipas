"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import type { FeatureCollection, Point, Polygon, Position } from "geojson";
import type { GeoJSONSource, Map as MlMap, StyleSpecification } from "maplibre-gl";
import { Crosshair, Layers, Undo2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { RISK_COLORS } from "@/lib/risk-colors";

/** Base styles: OpenStreetMap streets and Esri World Imagery satellite. */
function baseStyle(kind: "streets" | "satellite"): StyleSpecification {
  const source =
    kind === "streets"
      ? { tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], attribution: "© OpenStreetMap contributors" }
      : { tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"], attribution: "Imagery © Esri, Maxar, Earthstar Geographics" };
  return {
    version: 8,
    sources: { base: { type: "raster", tileSize: 256, maxzoom: 19, ...source } },
    layers: [{ id: "base", type: "raster", source: "base" }],
  };
}

function bboxOf(fc: FeatureCollection): [[number, number], [number, number]] | null {
  const pts: Position[] = [];
  const walk = (c: unknown) => {
    if (Array.isArray(c) && typeof c[0] === "number") pts.push(c as Position);
    else if (Array.isArray(c)) c.forEach(walk);
  };
  fc.features.forEach((f) => f.geometry && walk((f.geometry as Polygon).coordinates));
  if (!pts.length) return null;
  const xs = pts.map((p) => p[0]!);
  const ys = pts.map((p) => p[1]!);
  return [[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]];
}

function useMap(container: React.RefObject<HTMLDivElement | null>, kind: "streets" | "satellite", onReady: (m: MlMap) => void) {
  const mapRef = useRef<MlMap | null>(null);
  const ready = useRef(onReady);
  useEffect(() => {
    ready.current = onReady;
  });
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ml = await import("maplibre-gl");
      if (cancelled || !container.current) return;
      ml.setWorkerUrl(new URL("/maplibre-gl-worker.mjs", window.location.origin).href);
      const map = new ml.Map({ container: container.current, style: baseStyle(kind), center: [98.67, 3.59], zoom: 7, attributionControl: { compact: true } });
      map.addControl(new ml.NavigationControl({ showCompass: false }), "top-right");
      mapRef.current = map;
      map.on("load", () => ready.current(map));
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // style switches recreate the map so overlays are re-added in onReady
  }, [container, kind]);
  return mapRef;
}

function BaseToggle({ kind, setKind }: { kind: "streets" | "satellite"; setKind: (k: "streets" | "satellite") => void }) {
  return (
    <button
      type="button"
      onClick={() => setKind(kind === "streets" ? "satellite" : "streets")}
      className="absolute left-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface/95 px-2.5 py-1.5 text-xs font-semibold text-fg shadow-card"
    >
      <Layers className="size-3.5" /> {kind === "streets" ? "Satelit" : "Peta jalan"}
    </button>
  );
}

/** Read-only plots map; optional forest-2020 overlay (F3.5). */
export function PlotsMap({ data, forest, height = 520, onSelect }: { data: FeatureCollection; forest?: FeatureCollection | null; height?: number; onSelect?: (id: string) => void }) {
  const el = useRef<HTMLDivElement>(null);
  const [kind, setKind] = useState<"streets" | "satellite">("satellite");
  const [showForest, setShowForest] = useState(true);
  const mapRef = useMap(el, kind, (map) => {
    if (forest) {
      map.addSource("forest", { type: "geojson", data: forest });
      map.addLayer({ id: "forest-fill", type: "fill", source: "forest", paint: { "fill-color": "#16a34a", "fill-opacity": 0.35 } });
      map.addLayer({ id: "forest-line", type: "line", source: "forest", paint: { "line-color": "#14532d", "line-width": 1 } });
    }
    map.addSource("plots", { type: "geojson", data });
    const color = ["match", ["get", "riskStatus"], ...Object.entries(RISK_COLORS).flat(), "#0e8f7e"] as unknown as string;
    map.addLayer({ id: "plot-fill", type: "fill", source: "plots", filter: ["==", ["geometry-type"], "Polygon"], paint: { "fill-color": color, "fill-opacity": 0.35 } });
    map.addLayer({ id: "plot-line", type: "line", source: "plots", filter: ["==", ["geometry-type"], "Polygon"], paint: { "line-color": color, "line-width": 2 } });
    map.addLayer({ id: "plot-point", type: "circle", source: "plots", filter: ["==", ["geometry-type"], "Point"], paint: { "circle-color": color, "circle-radius": 6, "circle-stroke-color": "#fff", "circle-stroke-width": 2 } });
    for (const layer of ["plot-fill", "plot-point"]) {
      map.on("click", layer, (e) => {
        const id = e.features?.[0]?.properties?.id;
        if (id && onSelect) onSelect(String(id));
      });
      map.on("mouseenter", layer, () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", layer, () => (map.getCanvas().style.cursor = ""));
    }
    const b = bboxOf(data);
    if (b) map.fitBounds(b, { padding: 60, maxZoom: 16, duration: 0 });
  });

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer("forest-fill")) return;
    for (const l of ["forest-fill", "forest-line"]) map.setLayoutProperty(l, "visibility", showForest ? "visible" : "none");
  }, [showForest, mapRef]);

  return (
    <div className="relative overflow-hidden rounded-xl border border-line" style={{ height }}>
      <div ref={el} className="h-full w-full" />
      <BaseToggle kind={kind} setKind={setKind} />
      {forest && (
        <label className="absolute bottom-3 left-3 z-10 flex items-center gap-2 rounded-lg border border-line bg-surface/95 px-2.5 py-1.5 text-xs font-semibold text-fg shadow-card">
          <input type="checkbox" checked={showForest} onChange={(e) => setShowForest(e.target.checked)} className="accent-[var(--primary)]" />
          <span className="inline-block size-3 rounded-sm bg-[#16a34a]/60" /> Hutan 2020
        </label>
      )}
    </div>
  );
}

/**
 * Editor: tap the map to add polygon vertices (F2.3 "mengetuk titik di peta"), or switch to point mode.
 * Emits normalised-ish geometry; the server performs the authoritative validation.
 */
export function GeometryEditor({
  initial, onChange, height = 420,
}: {
  initial?: { point?: Point | null; polygon?: Polygon | null };
  onChange: (g: { point: Point | null; polygon: Polygon | null }) => void;
  height?: number;
}) {
  const el = useRef<HTMLDivElement>(null);
  const [kind, setKind] = useState<"streets" | "satellite">("satellite");
  const [mode, setMode] = useState<"polygon" | "point">(initial?.polygon || !initial?.point ? "polygon" : "point");
  const [verts, setVerts] = useState<Position[]>(() => initial?.polygon?.coordinates[0]?.slice(0, -1) ?? []);
  const [point, setPoint] = useState<Position | null>(() => initial?.point?.coordinates ?? null);
  const modeRef = useRef(mode);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  const mapRef = useMap(el, kind, (map) => {
    map.addSource("draw", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    map.addLayer({ id: "draw-fill", type: "fill", source: "draw", filter: ["==", ["geometry-type"], "Polygon"], paint: { "fill-color": "#0e8f7e", "fill-opacity": 0.3 } });
    map.addLayer({ id: "draw-line", type: "line", source: "draw", filter: ["!=", ["geometry-type"], "Point"], paint: { "line-color": "#0e8f7e", "line-width": 2.5 } });
    map.addLayer({ id: "draw-pt", type: "circle", source: "draw", filter: ["==", ["geometry-type"], "Point"], paint: { "circle-color": "#fff", "circle-radius": 5, "circle-stroke-color": "#0e8f7e", "circle-stroke-width": 2.5 } });
    map.on("click", (e) => {
      const p: Position = [Number(e.lngLat.lng.toFixed(6)), Number(e.lngLat.lat.toFixed(6))];
      if (modeRef.current === "polygon") setVerts((v) => [...v, p]);
      else setPoint(p);
    });
    const all = [...(initial?.polygon?.coordinates[0] ?? []), ...(initial?.point ? [initial.point.coordinates] : [])];
    if (all.length) {
      const fc: FeatureCollection = { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "MultiPoint", coordinates: all } }] };
      const b = bboxOf(fc)!;
      map.fitBounds(b, { padding: 80, maxZoom: 17, duration: 0 });
    }
    setVerts((v) => [...v]); // trigger redraw on (re)load
  });

  useEffect(() => {
    const map = mapRef.current;
    const src = map?.getSource("draw") as GeoJSONSource | undefined;
    const features: FeatureCollection["features"] = [];
    if (verts.length >= 3) features.push({ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[...verts, verts[0]!]] } });
    else if (verts.length === 2) features.push({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: verts } });
    verts.forEach((v) => features.push({ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: v } }));
    if (point) features.push({ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: point } });
    src?.setData({ type: "FeatureCollection", features });
    onChange({
      polygon: verts.length >= 3 ? { type: "Polygon", coordinates: [[...verts, verts[0]!]] } : null,
      point: point ? { type: "Point", coordinates: point } : null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verts, point, mapRef]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-xl bg-surface-2 p-1">
          {(["polygon", "point"] as const).map((m) => (
            <button key={m} type="button" onClick={() => setMode(m)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${mode === m ? "bg-surface text-fg shadow-card" : "text-fg-2"}`}>
              {m === "polygon" ? `Poligon (${verts.length} titik)` : point ? "Titik ✓" : "Titik"}
            </button>
          ))}
        </div>
        <button type="button" className="btn-ghost btn-sm" onClick={() => (mode === "polygon" ? setVerts((v) => v.slice(0, -1)) : setPoint(null))}><Undo2 className="size-3.5" /> Batal titik</button>
        <button type="button" className="btn-ghost btn-sm" onClick={() => { setVerts([]); setPoint(null); }}><X className="size-3.5" /> Hapus</button>
        <button
          type="button"
          className="btn-ghost btn-sm"
          onClick={() =>
            navigator.geolocation?.getCurrentPosition((pos) => {
              const p: Position = [Number(pos.coords.longitude.toFixed(6)), Number(pos.coords.latitude.toFixed(6))];
              mapRef.current?.flyTo({ center: p as [number, number], zoom: 17 });
            })
          }
        >
          <Crosshair className="size-3.5" /> Lokasi saya
        </button>
      </div>
      <div className="relative overflow-hidden rounded-xl border border-line" style={{ height }}>
        <div ref={el} className="h-full w-full" />
        <BaseToggle kind={kind} setKind={setKind} />
      </div>
      <p className="text-xs text-muted">Ketuk peta untuk menambah titik sudut kebun searah keliling. Koordinat disimpan 6 desimal.</p>
    </div>
  );
}
