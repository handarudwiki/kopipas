"use client";

import { Download, MapPinned, RefreshCw, Trash2, Users } from "lucide-react";
import { useState } from "react";
import { idb } from "@/lib/field/store";
import { downloadTiles, tilesAround } from "@/lib/field/sync";
import { useField } from "../field-app";

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }) : "belum pernah");

export function HomeScreen({ go }: { go: (t: "farmer" | "plot" | "purchase") => void }) {
  const f = useField();
  const pending = f.ops.filter((o) => o.status === "pending");
  const failed = f.ops.filter((o) => o.status === "failed");
  const [tiles, setTiles] = useState<string | null>(null);
  const [radius, setRadius] = useState(2);

  return (
    <div className="space-y-4">
      <section className="card p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Sinkronisasi</p>
        <div className="mt-2 flex items-end justify-between gap-3">
          <div>
            <p className="text-3xl font-bold text-fg">{pending.length}</p>
            <p className="text-sm text-fg-2">data menunggu dikirim</p>
          </div>
          <button className="btn-primary" disabled={!f.online || f.syncing} onClick={() => void f.sync()}>
            <RefreshCw className={`size-4 ${f.syncing ? "animate-spin" : ""}`} /> Sinkron
          </button>
        </div>
        <p className="mt-3 text-xs text-muted">Terakhir: {fmt(f.lastSync)} · {f.online ? "online" : "offline — data aman tersimpan di perangkat"}</p>
        {f.syncError && <p className="mt-2 rounded-lg bg-err-soft px-3 py-2 text-sm text-err">{f.syncError}</p>}
      </section>

      <div className="grid grid-cols-2 gap-3">
        <button onClick={() => go("farmer")} className="card flex flex-col items-start gap-2 p-4 text-left">
          <Users className="size-6 text-primary" />
          <span className="font-bold text-fg">Daftarkan petani</span>
          <span className="text-xs text-muted">{f.farmers.length} petani</span>
        </button>
        <button onClick={() => go("plot")} className="card flex flex-col items-start gap-2 p-4 text-left">
          <MapPinned className="size-6 text-primary" />
          <span className="font-bold text-fg">Petakan kebun</span>
          <span className="text-xs text-muted">{f.plots.length} kebun</span>
        </button>
      </div>

      {failed.length > 0 && (
        <section className="card p-5">
          <p className="mb-3 font-bold text-err">Gagal disinkron ({failed.length})</p>
          <ul className="space-y-2">
            {failed.map((o) => (
              <li key={o.opId} className="flex items-start justify-between gap-3 rounded-xl bg-err-soft/60 p-3 text-sm">
                <div>
                  <p className="font-semibold text-fg">{o.label}</p>
                  <p className="text-xs text-err">{o.error}</p>
                </div>
                <button className="btn-ghost btn-sm" aria-label="Hapus" onClick={async () => { await idb.del("queue", o.opId); await f.refresh(); }}>
                  <Trash2 className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {pending.length > 0 && (
        <section className="card p-5">
          <p className="mb-3 font-bold text-fg">Antrean</p>
          <ul className="space-y-1.5 text-sm">
            {pending.map((o) => (
              <li key={o.opId} className="flex justify-between gap-2 border-b border-line pb-1.5 last:border-0">
                <span className="text-fg-2">{o.label}</span>
                <span className="whitespace-nowrap text-xs text-muted">{fmt(o.createdAt)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card p-5">
        <p className="font-bold text-fg">Peta offline (F2.7)</p>
        <p className="mt-1 text-sm text-fg-2">Unduh citra satelit di sekitar lokasi Anda sebelum ke lapangan.</p>
        <div className="mt-3 flex items-center gap-2">
          <select value={radius} onChange={(e) => setRadius(Number(e.target.value))} className="input w-auto">
            {[1, 2, 3, 5].map((r) => <option key={r} value={r}>radius {r} km</option>)}
          </select>
          <button
            className="btn-secondary"
            disabled={!f.online || !!tiles?.startsWith("Mengunduh")}
            onClick={() =>
              navigator.geolocation.getCurrentPosition(
                async (pos) => {
                  const urls = tilesAround(pos.coords.longitude, pos.coords.latitude, radius);
                  setTiles(`Mengunduh 0/${urls.length}`);
                  await downloadTiles(urls, (d, t) => setTiles(`Mengunduh ${d}/${t}`));
                  setTiles(`Selesai — ${urls.length} tile tersimpan`);
                },
                (err) => setTiles(`Lokasi tidak tersedia: ${err.message}`),
                { enableHighAccuracy: true, timeout: 20000 },
              )
            }
          >
            <Download className="size-4" /> Unduh
          </button>
        </div>
        {tiles && <p className="mt-2 text-xs text-fg-2">{tiles}</p>}
      </section>
    </div>
  );
}
