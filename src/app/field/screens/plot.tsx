"use client";

import type { Point, Polygon, Position } from "geojson";
import { area as turfArea, kinks, polygon as turfPolygon } from "@turf/turf";
import { Camera, Crosshair, Footprints, MapPinned, Plus, Undo2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Field } from "@/components/client";
import { GeometryEditor } from "@/components/map";
import { cx } from "@/components/ui";
import { compressPhoto, enqueue, idb, newId, saveBlob } from "@/lib/field/store";
import { useField } from "../field-app";

type Fix = { lon: number; lat: number; acc: number };
const r6 = (n: number) => Math.round(n * 1e6) / 1e6;

/** Live GPS with accuracy (F2.2). */
function useGps(active: boolean) {
  const [fix, setFix] = useState<Fix | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!active || !navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (p) => { setErr(null); setFix({ lon: r6(p.coords.longitude), lat: r6(p.coords.latitude), acc: Math.round(p.coords.accuracy * 10) / 10 }); },
      (e) => setErr(e.message),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [active]);
  return { fix, err };
}

function polygonOf(verts: Position[]): Polygon | null {
  return verts.length >= 3 ? { type: "Polygon", coordinates: [[...verts, verts[0]!]] } : null;
}

function polyCheck(p: Polygon | null): { ha: number | null; error: string | null } {
  if (!p) return { ha: null, error: null };
  const poly = turfPolygon(p.coordinates);
  if (kinks(poly).features.length) return { ha: null, error: "Poligon berpotongan sendiri" };
  return { ha: Math.round((turfArea(poly) / 10_000) * 10_000) / 10_000, error: null };
}

export function PlotScreen({ onDone }: { onDone: () => void }) {
  const f = useField();
  const [mode, setMode] = useState<"point" | "walk" | "tap">("point");
  const [farmerKey, setFarmerKey] = useState("");
  const [point, setPoint] = useState<Fix | null>(null);
  const [verts, setVerts] = useState<Position[]>([]);
  const [worstAcc, setWorstAcc] = useState<number | null>(null);
  const [tapGeo, setTapGeo] = useState<{ point: Point | null; polygon: Polygon | null }>({ point: null, polygon: null });
  const [evType, setEvType] = useState("SHM");
  const [photos, setPhotos] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);
  const { fix, err } = useGps(mode !== "tap");
  const maxAcc = f.rules.maxGpsAccuracyM;
  const accOk = !!fix && fix.acc <= maxAcc;

  const polygon = mode === "walk" ? polygonOf(verts) : mode === "tap" ? tapGeo.polygon : null;
  const { ha, error: polyErr } = polyCheck(polygon);

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        const fd = new FormData(e.currentTarget);
        const farmer = f.farmers.find((x) => x.key === farmerKey);
        if (!farmer) return setError("Pilih petani");
        const declared = Number(fd.get("declaredAreaHa"));
        if (!(declared > 0)) return setError("Isi luas dinyatakan");
        const geoPoint: Point | null = mode === "point" && point ? { type: "Point", coordinates: [point.lon, point.lat] } : mode === "tap" ? tapGeo.point : null;
        if (!geoPoint && !polygon) return setError("Rekam titik atau poligon kebun");
        if (polyErr) return setError(polyErr);
        if (declared > f.rules.polygonRequiredAboveHa && !polygon) return setError(`Kebun > ${f.rules.polygonRequiredAboveHa} ha wajib dipetakan sebagai poligon (F2.4)`);
        if (evType !== "NONE" && photos.length === 0) return setError('Ambil minimal 1 foto bukti legalitas, atau pilih "Belum ada"');

        setSaving(true);
        const now = new Date().toISOString();
        const clientId = newId("plot");
        const label = String(fd.get("label") || "").trim() || null;
        const gpsAccuracyM = mode === "point" ? point?.acc ?? null : mode === "walk" ? worstAcc : null;
        await enqueue({
          type: "plot.upsert", clientId, label: `Kebun ${label ?? ""} · ${farmer.name}`.trim(),
          data: { farmerId: farmer.id ?? null, farmerClientId: farmer.id ? null : farmer.clientId, label, declaredAreaHa: declared, point: geoPoint, polygon, gpsAccuracyM, capturedAt: now },
          fieldTimes: { label: now, geometry: now },
        });
        await idb.put("local", { clientId, kind: "plot", name: label ?? "Kebun baru", farmerRef: { id: farmer.id, clientId: farmer.clientId }, declaredAreaHa: declared, createdAt: now });
        const blobIds: string[] = [];
        for (const p of photos) blobIds.push(await saveBlob(await compressPhoto(p)));
        await enqueue({
          type: "evidence.create", clientId: newId("evidence"), label: `Bukti legalitas ${evType}`,
          data: { plotClientId: clientId, type: evType, documentNumber: String(fd.get("documentNumber") || "") || null, notes: String(fd.get("notes") || "") || null, photoKeys: [] },
          photoBlobIds: blobIds,
        });
        await f.refresh();
        void f.sync();
        onDone();
      }}
    >
      <section className="card space-y-4 p-5">
        <h2 className="text-lg font-bold">Petakan kebun</h2>
        <Field label="Petani">
          <select value={farmerKey} onChange={(e) => setFarmerKey(e.target.value)} required className="input">
            <option value="">Pilih petani…</option>
            {f.farmers.map((x) => <option key={x.key} value={x.key}>{x.name}{x.village ? ` — ${x.village}` : ""}{x.pending ? " (belum tersinkron)" : ""}</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nama kebun"><input name="label" className="input" /></Field>
          <Field label="Luas dinyatakan (ha)"><input name="declaredAreaHa" type="number" inputMode="decimal" step="0.0001" min="0.0001" required className="input" /></Field>
        </div>
      </section>

      <section className="card space-y-4 p-5">
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-surface-2 p-1">
          {([["point", "Titik GPS", Crosshair], ["walk", "Jalan keliling", Footprints], ["tap", "Ketuk peta", MapPinned]] as const).map(([m, l, Icon]) => (
            <button key={m} type="button" onClick={() => setMode(m)} className={cx("flex flex-col items-center gap-1 rounded-lg py-2 text-xs font-semibold", mode === m ? "bg-surface text-primary shadow-card" : "text-fg-2")}>
              <Icon className="size-4" />{l}
            </button>
          ))}
        </div>

        {mode !== "tap" && (
          <div className={cx("rounded-xl p-3 text-sm", !fix ? "bg-neutral-soft" : accOk ? "bg-ok-soft text-ok" : "bg-warn-soft text-warn")}>
            {err ? `GPS: ${err}` : !fix ? "Menunggu sinyal GPS…" : <>Akurasi <b>{fix.acc} m</b> {accOk ? "— siap" : `— tunggu sampai ≤ ${maxAcc} m`}<span className="block font-mono text-xs opacity-80">{fix.lat.toFixed(6)}, {fix.lon.toFixed(6)}</span></>}
          </div>
        )}

        {mode === "point" && (
          <div className="space-y-2">
            <button type="button" className="btn-primary w-full py-3" disabled={!accOk} onClick={() => fix && setPoint(fix)}>
              <Crosshair className="size-4" /> Ambil titik
            </button>
            {point && <p className="text-center text-sm text-fg">Titik: <span className="font-mono">{point.lat.toFixed(6)}, {point.lon.toFixed(6)}</span> (±{point.acc} m)</p>}
            <p className="text-xs text-muted">Untuk kebun ≤ {f.rules.polygonRequiredAboveHa} ha. Berdiri di tengah kebun.</p>
          </div>
        )}

        {mode === "walk" && (
          <div className="space-y-2">
            <div className="flex gap-2">
              <button type="button" className="btn-primary flex-1 py-3" disabled={!accOk} onClick={() => { if (!fix) return; setVerts((v) => [...v, [fix.lon, fix.lat]]); setWorstAcc((w) => Math.max(w ?? 0, fix.acc)); }}>
                <Plus className="size-4" /> Tambah titik sudut
              </button>
              <button type="button" className="btn-secondary" onClick={() => setVerts((v) => v.slice(0, -1))} aria-label="Batal titik"><Undo2 className="size-4" /></button>
            </div>
            <p className="text-sm text-fg">{verts.length} titik sudut{ha != null ? ` · luas ${ha} ha` : ""}</p>
            {polyErr && <p className="text-sm text-err">{polyErr}</p>}
            <p className="text-xs text-muted">Berjalan mengelilingi batas kebun; tekan tombol di setiap sudut. Poligon ditutup otomatis.</p>
          </div>
        )}

        {mode === "tap" && (
          <div className="space-y-2">
            <GeometryEditor initial={tapGeo} onChange={setTapGeo} height={340} />
            {ha != null && <p className="text-sm text-fg">Luas {ha} ha</p>}
            {polyErr && <p className="text-sm text-err">{polyErr}</p>}
          </div>
        )}
      </section>

      <section className="card space-y-4 p-5">
        <h3 className="font-bold">Bukti legalitas lahan</h3>
        <Field label="Tipe">
          <select value={evType} onChange={(e) => setEvType(e.target.value)} className="input">
            <option value="SHM">SHM</option>
            <option value="SKT">SKT</option>
            <option value="SKD">Surat keterangan desa</option>
            <option value="OTHER">Lainnya</option>
            <option value="NONE">Belum ada</option>
          </select>
        </Field>
        {evType !== "NONE" && <Field label="Nomor dokumen"><input name="documentNumber" className="input" /></Field>}
        <Field label="Catatan"><input name="notes" className="input" /></Field>
        <button type="button" className="btn-secondary w-full" onClick={() => photoInput.current?.click()}>
          <Camera className="size-4" /> Foto bukti ({photos.length})
        </button>
        <input ref={photoInput} type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={(e) => { setPhotos((p) => [...p, ...Array.from(e.target.files ?? [])]); e.target.value = ""; }} />
        {photos.length > 0 && <p className="text-xs text-muted">{photos.map((p) => p.name).join(", ")}</p>}
      </section>

      {error && <p className="rounded-lg bg-err-soft px-3 py-2 text-sm text-err">{error}</p>}
      <button className="btn-primary w-full py-3.5" disabled={saving}>Simpan kebun</button>
    </form>
  );
}
