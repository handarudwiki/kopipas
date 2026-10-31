"use client";

import type { Point, Polygon } from "geojson";
import { FileUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { area as turfArea, polygon as turfPolygon } from "@turf/turf";
import { api, ErrorText, Field, Spinner, useAction } from "@/components/client";
import { GeometryEditor } from "@/components/map";

type Geo = { point: Point | null; polygon: Polygon | null };

function liveArea(p: Polygon | null) {
  if (!p) return null;
  try {
    return turfArea(turfPolygon(p.coordinates)) / 10_000;
  } catch {
    return null;
  }
}

/** Create or edit plot geometry: draw on the map, or import GeoJSON / KML (M2). */
export function PlotForm({
  farmers, farmerId, plot, polygonAboveHa,
}: {
  farmers?: { id: string; fullName: string }[];
  farmerId?: string;
  plot?: { id: string; label: string | null; declaredAreaHa: number; point: Point | null; polygon: Polygon | null };
  polygonAboveHa: number;
}) {
  const router = useRouter();
  const [geo, setGeo] = useState<Geo>({ point: plot?.point ?? null, polygon: plot?.polygon ?? null });
  const [editorKey, setEditorKey] = useState(0);
  const [imported, setImported] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const area = liveArea(geo.polygon);

  const importFile = useAction(
    async (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return api<Geo & { computedAreaHa: number | null }>("/plots/parse-geo", { form });
    },
    {
      refresh: false,
      onDone: (g) => {
        setGeo({ point: g.point, polygon: g.polygon });
        setEditorKey((k) => k + 1);
        setImported(g.polygon ? `Poligon diimpor (${g.computedAreaHa?.toFixed(4)} ha)` : "Titik diimpor");
      },
    },
  );

  const save = useAction(
    (body: Record<string, unknown>) =>
      plot ? api<{ id: string }>(`/plots/${plot.id}`, { method: "PATCH", body }) : api<{ id: string }>("/plots", { body }),
    { refresh: false, onDone: (p) => { router.push(`/plots/${p.id}`); router.refresh(); } },
  );

  return (
    <form
      className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        save.run({
          ...(plot ? {} : { farmerId: fd.get("farmerId") }),
          label: (fd.get("label") as string) || null,
          declaredAreaHa: Number(fd.get("declaredAreaHa")),
          point: geo.point,
          polygon: geo.polygon,
        });
      }}
    >
      <section className="card p-5">
        <GeometryEditor key={editorKey} initial={geo} onChange={setGeo} height={480} />
      </section>
      <section className="card space-y-4 p-6">
        {!plot && (
          <Field label="Petani">
            <select name="farmerId" required defaultValue={farmerId ?? ""} className="input">
              <option value="" disabled>Pilih petani…</option>
              {farmers?.map((f) => <option key={f.id} value={f.id}>{f.fullName}</option>)}
            </select>
          </Field>
        )}
        <Field label="Nama kebun"><input name="label" defaultValue={plot?.label ?? ""} placeholder="mis. Kebun Lae Pondom" className="input" /></Field>
        <Field label="Luas dinyatakan (ha)" hint={`Kebun > ${polygonAboveHa} ha wajib poligon (F2.4)`}>
          <input name="declaredAreaHa" type="number" step="0.0001" min="0.0001" required defaultValue={plot?.declaredAreaHa ?? ""} className="input" />
        </Field>
        <div className="rounded-xl bg-surface-2 p-4 text-sm">
          <p className="font-semibold text-fg">Geometri</p>
          <p className="mt-1 text-fg-2">
            {geo.polygon ? `Poligon ${geo.polygon.coordinates[0]!.length - 1} titik · luas terhitung ${area?.toFixed(4) ?? "?"} ha` : "Belum ada poligon"}
          </p>
          <p className="text-fg-2">{geo.point ? `Titik ${geo.point.coordinates[1]!.toFixed(6)}, ${geo.point.coordinates[0]!.toFixed(6)}` : geo.polygon ? "Titik = pusat poligon" : "Belum ada titik"}</p>
        </div>
        <div>
          <button type="button" className="btn-secondary w-full" onClick={() => fileRef.current?.click()} disabled={importFile.pending}>
            {importFile.pending ? <Spinner /> : <FileUp className="size-4" />} Impor GeoJSON / KML
          </button>
          <input ref={fileRef} type="file" accept=".geojson,.json,.kml,application/geo+json,application/vnd.google-earth.kml+xml" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importFile.run(f); e.target.value = ""; }} />
          {imported && <p className="mt-2 text-xs font-semibold text-ok">{imported}</p>}
        </div>
        <ErrorText error={importFile.error ?? save.error} />
        <button className="btn-primary w-full" disabled={save.pending || (!geo.point && !geo.polygon)}>
          {save.pending && <Spinner />} {plot ? "Simpan geometri" : "Simpan kebun"}
        </button>
        <p className="text-xs text-muted">Setiap kebun baru atau perubahan geometri otomatis dicek terhadap peta tutupan hutan 31 Des 2020.</p>
      </section>
    </form>
  );
}
