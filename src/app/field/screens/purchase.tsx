"use client";

import { useState } from "react";
import { Field } from "@/components/client";
import { enqueue, newId } from "@/lib/field/store";
import { useField } from "../field-app";

/** F4.1 — record a purchase offline; it must point to a registered plot of the farmer. */
export function PurchaseScreen({ onDone }: { onDone: () => void }) {
  const f = useField();
  const [farmerKey, setFarmerKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const plots = f.plots.filter((p) => p.farmerKey === farmerKey);

  return (
    <form
      className="card space-y-4 p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const farmer = f.farmers.find((x) => x.key === farmerKey);
        const plot = f.plots.find((x) => x.key === fd.get("plotKey"));
        if (!farmer || !plot) return setError("Pilih petani dan kebun terdaftar");
        const weightKg = Number(fd.get("weightKg"));
        if (!(weightKg > 0)) return setError("Isi berat");
        await enqueue({
          type: "purchase.create", clientId: newId("purchase"), label: `Pembelian ${weightKg} kg · ${farmer.name}`,
          data: {
            farmerId: farmer.id ?? null, farmerClientId: farmer.id ? null : farmer.clientId,
            plotId: plot.id ?? null, plotClientId: plot.id ? null : plot.clientId,
            date: String(fd.get("date")), weightKg, form: String(fd.get("form")),
          },
        });
        await f.refresh();
        void f.sync();
        onDone();
      }}
    >
      <h2 className="text-lg font-bold">Catat pembelian</h2>
      <Field label="Petani">
        <select value={farmerKey} onChange={(e) => setFarmerKey(e.target.value)} required className="input">
          <option value="">Pilih petani…</option>
          {f.farmers.map((x) => <option key={x.key} value={x.key}>{x.name}{x.pending ? " (belum tersinkron)" : ""}</option>)}
        </select>
      </Field>
      <Field label="Kebun asal" hint={farmerKey && !plots.length ? "Petani ini belum punya kebun; petakan kebun dulu" : undefined}>
        <select name="plotKey" required className="input" disabled={!plots.length}>
          {plots.map((p) => <option key={p.key} value={p.key}>{p.name}{p.pending ? " (belum tersinkron)" : ""}</option>)}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Tanggal"><input name="date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} className="input" /></Field>
        <Field label="Berat (kg)"><input name="weightKg" type="number" inputMode="decimal" step="0.01" min="0.01" required className="input" /></Field>
      </div>
      <Field label="Bentuk">
        <select name="form" className="input" defaultValue="CHERRY">
          <option value="CHERRY">Ceri</option>
          <option value="PARCHMENT">Gabah</option>
          <option value="GREEN">Green bean</option>
        </select>
      </Field>
      {error && <p className="rounded-lg bg-err-soft px-3 py-2 text-sm text-err">{error}</p>}
      <button className="btn-primary w-full py-3" disabled={!plots.length}>Simpan pembelian</button>
    </form>
  );
}
