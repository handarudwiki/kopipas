"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { api, ConfirmButton, ErrorText, Field, Modal, Spinner, useAction } from "@/components/client";

type F = { id: string; fullName: string; plots: { id: string; label: string | null }[] };

export function NewPurchaseButton({ farmers }: { farmers: F[] }) {
  const [open, setOpen] = useState(false);
  const [farmerId, setFarmerId] = useState("");
  const save = useAction((body: object) => api("/purchases", { body }), { onDone: () => setOpen(false) });
  const plots = farmers.find((f) => f.id === farmerId)?.plots ?? [];
  return (
    <>
      <button className="btn-primary" onClick={() => setOpen(true)}><Plus className="size-4" /> Catat pembelian</button>
      <Modal open={open} onClose={() => setOpen(false)} title="Pembelian baru">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            save.run({ farmerId, plotId: fd.get("plotId"), date: fd.get("date"), weightKg: Number(fd.get("weightKg")), form: fd.get("form") });
          }}
        >
          <Field label="Petani">
            <select value={farmerId} onChange={(e) => setFarmerId(e.target.value)} required className="input">
              <option value="">Pilih petani…</option>
              {farmers.map((f) => <option key={f.id} value={f.id}>{f.fullName}</option>)}
            </select>
          </Field>
          <Field label="Kebun asal" hint={farmerId && !plots.length ? "Petani ini belum punya kebun terdaftar" : undefined}>
            <select name="plotId" required className="input" disabled={!plots.length}>
              {plots.map((p) => <option key={p.id} value={p.id}>{p.label ?? `Kebun ${p.id.slice(0, 6)}`}</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Tanggal"><input name="date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} className="input" /></Field>
            <Field label="Berat (kg)"><input name="weightKg" type="number" step="0.01" min="0.01" required className="input" /></Field>
            <Field label="Bentuk">
              <select name="form" className="input" defaultValue="CHERRY">
                <option value="CHERRY">Ceri</option>
                <option value="PARCHMENT">Gabah</option>
                <option value="GREEN">Green bean</option>
              </select>
            </Field>
          </div>
          <ErrorText error={save.error} />
          <button className="btn-primary w-full" disabled={save.pending || !plots.length}>{save.pending && <Spinner />} Simpan</button>
        </form>
      </Modal>
    </>
  );
}

export function DeletePurchaseButton({ id }: { id: string }) {
  const del = useAction(() => api(`/purchases/${id}`, { method: "DELETE" }));
  return <ConfirmButton className="btn-ghost btn-sm" confirmLabel="Hapus?" onConfirm={() => del.run()}><Trash2 className="size-4" /></ConfirmButton>;
}
