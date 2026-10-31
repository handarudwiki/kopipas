"use client";

import { useState } from "react";
import { api, ErrorText, Field, Spinner, useAction } from "@/components/client";
import type { OrgSettings } from "@/lib/settings";

type Org = { name: string; npwp: string | null; address: string | null; country: string; settings: OrgSettings };

function NumberField({ label, name, value, step = "any", hint }: { label: string; name: string; value: number; step?: string; hint?: string }) {
  return (
    <Field label={label} hint={hint}>
      <input name={name} type="number" step={step} defaultValue={value} required className="input" />
    </Field>
  );
}

export function OrgForm({ org }: { org: Org }) {
  const [saved, setSaved] = useState(false);
  const save = useAction((body: object) => api("/org", { method: "PATCH", body }), { onDone: () => setSaved(true) });
  const s = org.settings;
  return (
    <form
      className="space-y-6"
      onChange={() => setSaved(false)}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const n = (k: string) => Number(fd.get(k));
        save.run({
          name: fd.get("name"),
          npwp: fd.get("npwp") || null,
          address: fd.get("address") || null,
          country: fd.get("country"),
          settings: {
            risk: { passBelowPct: n("passBelowPct"), riskAbovePct: n("riskAbovePct"), maxGpsAccuracyM: n("maxGpsAccuracyM"), polygonRequiredAboveHa: n("polygonRequiredAboveHa") },
            conversion: { CHERRY: n("CHERRY"), PARCHMENT: n("PARCHMENT"), GREEN: n("GREEN") },
            validation: { weightTolerancePct: n("weightTolerancePct"), presentationDays: n("presentationDays"), certMaxDaysBefore: n("certMaxDaysBefore"), certMaxDaysAfter: n("certMaxDaysAfter") },
            share: { defaultExpiryDays: n("defaultExpiryDays") },
          },
        });
      }}
    >
      <section className="card p-6">
        <h2 className="mb-4 text-base font-bold">Profil eksportir</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nama perusahaan"><input name="name" defaultValue={org.name} required className="input" /></Field>
          <Field label="NPWP"><input name="npwp" defaultValue={org.npwp ?? ""} className="input" /></Field>
          <Field label="Alamat" className="sm:col-span-2"><textarea name="address" defaultValue={org.address ?? ""} rows={2} className="input" /></Field>
          <Field label="Kode negara (ISO-2)"><input name="country" defaultValue={org.country} maxLength={2} minLength={2} required className="input uppercase" /></Field>
        </div>
      </section>

      <section className="card p-6">
        <h2 className="text-base font-bold">Ambang cek risiko (F3.2)</h2>
        <p className="mb-4 mt-1 text-sm text-muted">R01 LOLOS bila tutupan hutan 2020 di bawah ambang pertama; R03 BERISIKO bila di atas ambang kedua; di antaranya PERLU VERIFIKASI.</p>
        <div className="grid gap-4 sm:grid-cols-4">
          <NumberField label="LOLOS bila < (%)" name="passBelowPct" value={s.risk.passBelowPct} />
          <NumberField label="BERISIKO bila > (%)" name="riskAbovePct" value={s.risk.riskAbovePct} />
          <NumberField label="Akurasi GPS maks (m)" name="maxGpsAccuracyM" value={s.risk.maxGpsAccuracyM} />
          <NumberField label="Wajib poligon bila > (ha)" name="polygonRequiredAboveHa" value={s.risk.polygonRequiredAboveHa} />
        </div>
      </section>

      <section className="card p-6">
        <h2 className="text-base font-bold">Rasio konversi ke green bean (F4.3)</h2>
        <p className="mb-4 mt-1 text-sm text-muted">kg green bean yang dihasilkan per 1 kg bahan.</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <NumberField label="Ceri" name="CHERRY" value={s.conversion.CHERRY} />
          <NumberField label="Gabah (parchment)" name="PARCHMENT" value={s.conversion.PARCHMENT} />
          <NumberField label="Green bean" name="GREEN" value={s.conversion.GREEN} />
        </div>
      </section>

      <section className="card p-6">
        <h2 className="mb-4 text-base font-bold">Validasi dokumen & tautan berbagi</h2>
        <div className="grid gap-4 sm:grid-cols-5">
          <NumberField label="Toleransi berat D04 (%)" name="weightTolerancePct" value={s.validation.weightTolerancePct} />
          <NumberField label="Masa presentasi D10 (hari)" name="presentationDays" value={s.validation.presentationDays} step="1" />
          <NumberField label="Sertifikat maks sebelum kapal (hari)" name="certMaxDaysBefore" value={s.validation.certMaxDaysBefore} step="1" />
          <NumberField label="Sertifikat maks sesudah kapal (hari)" name="certMaxDaysAfter" value={s.validation.certMaxDaysAfter} step="1" />
          <NumberField label="Masa berlaku tautan (hari)" name="defaultExpiryDays" value={s.share.defaultExpiryDays} step="1" />
        </div>
      </section>

      <ErrorText error={save.error} />
      <div className="flex items-center gap-3">
        <button className="btn-primary" disabled={save.pending}>{save.pending && <Spinner />} Simpan pengaturan</button>
        {saved && <span className="text-sm font-semibold text-ok">Tersimpan</span>}
      </div>
    </form>
  );
}
