"use client";

import { AlertTriangle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { api, ErrorText, Field, Spinner, useAction } from "@/components/client";
import { FORM_LABEL, RiskPill } from "@/components/status";
import { cx } from "@/components/ui";

type Form = "CHERRY" | "PARCHMENT" | "GREEN";
type P = { id: string; date: string; farmer: string; plot: string; riskStatus: "PENDING" | "PASS" | "REVIEW" | "RISK" | "ERROR"; weightKg: number; form: Form };

const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

export function LotBuilder({ purchases, conversion, defaultCode }: { purchases: P[]; conversion: Record<Form, number>; defaultCode: string }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [form, setForm] = useState<Form>("GREEN");
  const [weight, setWeight] = useState<string>("");
  const available = useMemo(
    () => purchases.filter((p) => selected.has(p.id)).reduce((a, p) => a + (p.weightKg * conversion[p.form]) / conversion[form], 0),
    [purchases, selected, conversion, form],
  );
  const w = Number(weight);
  const exceeds = w > available + 1e-6;
  const save = useAction((body: object) => api<{ id: string }>("/lots", { body }), { refresh: false, onDone: (l) => router.push(`/lots/${l.id}`) });

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <div className="card p-3 sm:p-4">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-separate border-spacing-0">
            <thead className="table-head"><tr><th></th><th>Tanggal</th><th>Petani / kebun</th><th>Bentuk</th><th>Berat</th></tr></thead>
            <tbody>
              {purchases.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-sm text-muted">Tidak ada pembelian yang belum masuk lot.</td></tr>}
              {purchases.map((p) => (
                <tr key={p.id} className={cx("table-row cursor-pointer", selected.has(p.id) && "bg-primary-soft/50")} onClick={() => setSelected((s) => { const n = new Set(s); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; })}>
                  <td><input type="checkbox" readOnly checked={selected.has(p.id)} className="size-4 accent-[var(--primary)]" /></td>
                  <td className="whitespace-nowrap">{p.date}</td>
                  <td><span className="font-semibold">{p.farmer}</span><span className="block text-xs text-muted">{p.plot} <span className="ml-1 inline-block scale-90"><RiskPill status={p.riskStatus} /></span></span></td>
                  <td>{FORM_LABEL[p.form]}</td>
                  <td className="font-semibold">{fmt(p.weightKg)} kg</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <form
        className="card h-fit space-y-4 p-6 xl:sticky xl:top-24"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          save.run({ code: fd.get("code"), productForm: form, weightKg: w, purchaseIds: [...selected] });
        }}
      >
        <Field label="Kode lot"><input name="code" required defaultValue={defaultCode} className="input" /></Field>
        <Field label="Bentuk produk lot">
          <select value={form} onChange={(e) => setForm(e.target.value as Form)} className="input">
            <option value="GREEN">Green bean</option>
            <option value="PARCHMENT">Gabah</option>
            <option value="CHERRY">Ceri</option>
          </select>
        </Field>
        <div className="rounded-xl bg-surface-2 p-4">
          <p className="text-xs font-semibold text-muted">{selected.size} pembelian · tersedia setelah konversi</p>
          <p className="mt-1 text-2xl font-bold">{fmt(available)} kg</p>
          <button type="button" className="mt-1 text-xs font-semibold text-primary" onClick={() => setWeight(String(Math.floor(available * 100) / 100))}>Pakai seluruhnya</button>
        </div>
        <Field label="Berat lot (kg)"><input value={weight} onChange={(e) => setWeight(e.target.value)} type="number" step="0.01" min="0.01" required className={cx("input", exceeds && "border-err")} /></Field>
        {exceeds && (
          <p className="flex items-start gap-2 rounded-lg bg-err-soft px-3 py-2 text-sm text-err">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" /> Berat lot melebihi total pembelian setelah konversi ({fmt(w - available)} kg). Lot dapat disimpan tetapi tidak bisa dikunci (F4.4).
          </p>
        )}
        <ErrorText error={save.error} />
        <button className="btn-primary w-full" disabled={save.pending || !selected.size || !(w > 0)}>{save.pending && <Spinner />} Simpan lot</button>
      </form>
    </div>
  );
}
