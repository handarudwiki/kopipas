"use client";

import { Trash2 } from "lucide-react";
import { useState } from "react";
import { api, ConfirmButton, ErrorText, Field, Spinner, useAction } from "@/components/client";

export function EvidenceForm({ plotId }: { plotId: string }) {
  const [type, setType] = useState("SHM");
  const [formKey, setFormKey] = useState(0);
  const save = useAction((form: FormData) => api(`/plots/${plotId}/evidence`, { form }), { onDone: () => setFormKey((k) => k + 1) });
  return (
    <form
      key={formKey}
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        save.run(new FormData(e.currentTarget));
      }}
    >
      <Field label="Tipe bukti">
        <select name="type" value={type} onChange={(e) => setType(e.target.value)} className="input">
          <option value="SHM">SHM (Sertifikat Hak Milik)</option>
          <option value="SKT">SKT (Surat Keterangan Tanah)</option>
          <option value="SKD">Surat keterangan desa</option>
          <option value="OTHER">Lainnya</option>
          <option value="NONE">Belum ada bukti</option>
        </select>
      </Field>
      <Field label="Nomor dokumen"><input name="documentNumber" disabled={type === "NONE"} className="input" /></Field>
      <Field label={type === "NONE" ? "Foto (opsional)" : "Foto bukti (min. 1)"} className="sm:col-span-2">
        <input name="photo" type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" required={type !== "NONE"} className="input file:mr-3 file:rounded-lg file:border-0 file:bg-primary-soft file:px-3 file:py-1 file:text-xs file:font-semibold file:text-primary" />
      </Field>
      <Field label="Catatan" className="sm:col-span-2"><input name="notes" className="input" /></Field>
      <div className="space-y-2 sm:col-span-2">
        <ErrorText error={save.error} />
        <button className="btn-primary" disabled={save.pending}>{save.pending && <Spinner />} Simpan bukti</button>
      </div>
    </form>
  );
}

export function DeleteEvidenceButton({ id }: { id: string }) {
  const del = useAction(() => api(`/evidence/${id}`, { method: "DELETE" }));
  return (
    <ConfirmButton className="btn-ghost btn-sm" confirmLabel="Hapus?" onConfirm={() => del.run()}>
      <Trash2 className="size-4" />
    </ConfirmButton>
  );
}
