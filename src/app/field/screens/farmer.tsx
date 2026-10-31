"use client";

import { useState } from "react";
import { Field } from "@/components/client";
import { enqueue, idb, newId } from "@/lib/field/store";
import { useField } from "../field-app";

/** F2.1 — offline farmer registration; consent checkbox is mandatory. */
export function FarmerScreen({ onDone }: { onDone: () => void }) {
  const f = useField();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  return (
    <form
      className="card space-y-4 p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        if (fd.get("consent") !== "on") return setError("Petani harus menyetujui berbagi data sebelum disimpan");
        setSaving(true);
        const now = new Date().toISOString();
        const clientId = newId("farmer");
        const data = {
          fullName: String(fd.get("fullName")).trim(), village: String(fd.get("village")).trim(), district: String(fd.get("district")).trim(),
          regency: String(fd.get("regency")).trim(), province: String(fd.get("province")).trim(), phone: String(fd.get("phone") ?? "").trim() || null,
          consent: true, consentAt: now,
        };
        await enqueue({ type: "farmer.upsert", clientId, data, fieldTimes: Object.fromEntries(Object.keys(data).map((k) => [k, now])), label: `Petani ${data.fullName}` });
        await idb.put("local", { clientId, kind: "farmer", name: data.fullName, createdAt: now });
        await f.refresh();
        void f.sync();
        onDone();
      }}
    >
      <h2 className="text-lg font-bold">Petani baru</h2>
      <Field label="Nama lengkap"><input name="fullName" required minLength={2} className="input" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Desa"><input name="village" required className="input" /></Field>
        <Field label="Kecamatan"><input name="district" required className="input" /></Field>
        <Field label="Kabupaten"><input name="regency" required className="input" /></Field>
        <Field label="Provinsi"><input name="province" required defaultValue="Sumatera Utara" className="input" /></Field>
      </div>
      <Field label="No. HP"><input name="phone" type="tel" inputMode="tel" className="input" /></Field>
      <label className="flex items-start gap-3 rounded-xl bg-surface-2 p-3 text-sm">
        <input type="checkbox" name="consent" className="mt-0.5 size-5 accent-[var(--primary)]" />
        <span className="text-fg-2">Petani <b>setuju</b> data diri, lokasi kebun, dan bukti legalitas lahan dibagikan ke pembeli UE melalui paket bukti EUDR (UU 27/2022 PDP).</span>
      </label>
      {error && <p className="rounded-lg bg-err-soft px-3 py-2 text-sm text-err">{error}</p>}
      <button className="btn-primary w-full py-3" disabled={saving}>Simpan petani</button>
      <p className="text-center text-xs text-muted">Tersimpan di perangkat dan dikirim otomatis saat online.</p>
    </form>
  );
}
