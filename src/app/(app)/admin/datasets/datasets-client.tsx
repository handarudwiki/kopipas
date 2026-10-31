"use client";

import { Upload } from "lucide-react";
import { useState } from "react";
import { api, ErrorText, Field, Modal, Spinner, useAction } from "@/components/client";

export function UploadDatasetButton() {
  const [open, setOpen] = useState(false);
  const up = useAction((form: FormData) => api("/admin/datasets", { form }), { onDone: () => setOpen(false) });
  return (
    <>
      <button className="btn-primary" onClick={() => setOpen(true)}><Upload className="size-4" /> Muat dataset</button>
      <Modal open={open} onClose={() => setOpen(false)} title="Muat dataset referensi">
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); up.run(new FormData(e.currentTarget)); }}>
          <Field label="Jenis">
            <select name="kind" className="input">
              <option value="FOREST_COVER_2020">Tutupan hutan 31 Des 2020</option>
              <option value="FOREST_AREA">Batas kawasan hutan</option>
            </select>
          </Field>
          <Field label="Nama"><input name="name" required className="input" placeholder="JRC GFC2020 v2 — Dairi & Simalungun" /></Field>
          <Field label="Versi"><input name="version" required className="input" placeholder="jrc-gfc2020-v2-2026.11" /></Field>
          <Field label="Sumber / lisensi"><input name="source" className="input" placeholder="URL atau keterangan lisensi" /></Field>
          <Field label="File GeoJSON (FeatureCollection poligon)"><input name="file" type="file" required accept=".geojson,.json,application/geo+json,application/json" className="input" /></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="activateUi" defaultChecked onChange={(e) => { const f = e.currentTarget.form; const h = f?.elements.namedItem("activate") as HTMLInputElement | null; if (h) h.value = e.currentTarget.checked ? "true" : "false"; }} className="accent-[var(--primary)]" /> Langsung aktifkan<input type="hidden" name="activate" defaultValue="true" /></label>
          <ErrorText error={up.error} />
          <button className="btn-primary w-full" disabled={up.pending}>{up.pending && <Spinner />} Muat</button>
        </form>
      </Modal>
    </>
  );
}

export function ActivateDatasetButton({ id }: { id: string }) {
  const act = useAction(() => api(`/admin/datasets/${id}/activate`, { method: "POST" }));
  return <button className="btn-secondary btn-sm" disabled={act.pending} onClick={() => act.run()}>{act.pending && <Spinner />} Aktifkan</button>;
}
