"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { api, ErrorText, Field, Modal, Spinner, useAction } from "@/components/client";

export function NewTenantButton() {
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const create = useAction((body: object) => api<{ inviteUrl: string }>("/admin/tenants", { body }), { onDone: (r) => setLink(r.inviteUrl) });
  return (
    <>
      <button className="btn-primary" onClick={() => { setLink(null); setOpen(true); }}><Plus className="size-4" /> Tenant baru</button>
      <Modal open={open} onClose={() => setOpen(false)} title="Tenant baru">
        {link ? (
          <div className="space-y-2">
            <p className="text-sm text-fg-2">Tenant dibuat. Kirim tautan undangan ini ke admin eksportir (berlaku 7 hari):</p>
            <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} className="input font-mono text-xs" />
          </div>
        ) : (
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); create.run(Object.fromEntries(fd.entries())); }}>
            <Field label="Nama perusahaan"><input name="name" required className="input" /></Field>
            <Field label="NPWP"><input name="npwp" className="input" /></Field>
            <Field label="Alamat"><input name="address" className="input" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Nama admin"><input name="adminName" required className="input" /></Field>
              <Field label="Email admin"><input name="adminEmail" type="email" required className="input" /></Field>
            </div>
            <ErrorText error={create.error} />
            <button className="btn-primary w-full" disabled={create.pending}>{create.pending && <Spinner />} Buat tenant & undangan</button>
          </form>
        )}
      </Modal>
    </>
  );
}
