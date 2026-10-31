"use client";

import { CheckCircle2, Pencil, PlayCircle, Trash2, UploadCloud } from "lucide-react";
import { useRef, useState } from "react";
import { api, ConfirmButton, ErrorText, Field, Modal, Spinner, useAction } from "@/components/client";
import { useJobs } from "@/components/jobs";
import { DOC_TYPE_LABEL } from "@/lib/docs/schemas";
import { ShipmentForm, type ShipmentFormValues } from "../shipments-client";

export function ValidateButton({ shipmentId, disabled }: { shipmentId: string; disabled?: boolean }) {
  const jobs = useJobs();
  const run = useAction(() => api<{ jobId: string }>(`/shipments/${shipmentId}/validate`, { method: "POST" }), {
    refresh: false,
    onDone: (r) => jobs.track([r.jobId]),
  });
  const busy = run.pending || jobs.busy;
  return (
    <div className="flex flex-col items-end gap-1">
      <button className="btn-primary" disabled={disabled || busy} onClick={() => run.run()}>
        {busy ? <Spinner /> : <PlayCircle className="size-4" />} Jalankan validasi
      </button>
      {(run.error || jobs.failed) && <span className="max-w-xs text-right text-xs text-err">{run.error ?? jobs.failed}</span>}
    </div>
  );
}

export function EditShipmentButton({ shipment }: { shipment: ShipmentFormValues & { id: string } }) {
  const [open, setOpen] = useState(false);
  const save = useAction((body: Record<string, unknown>) => api(`/shipments/${shipment.id}`, { method: "PATCH", body }), { onDone: () => setOpen(false) });
  return (
    <>
      <button className="btn-secondary" onClick={() => setOpen(true)}><Pencil className="size-4" /> Ubah</button>
      <Modal open={open} onClose={() => setOpen(false)} title="Ubah pengiriman" wide>
        <ShipmentForm initial={shipment} onSubmit={save.run} pending={save.pending} error={save.error} submitLabel="Simpan" />
      </Modal>
    </>
  );
}

export function UploadDocuments({ shipmentId }: { shipmentId: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [type, setType] = useState("");
  const [drag, setDrag] = useState(false);
  const jobs = useJobs();
  const upload = useAction(
    async (files: File[]) => {
      const form = new FormData();
      files.forEach((f) => form.append("file", f));
      if (type) form.append("type", type);
      return api<{ items: { jobId: string }[] }>(`/shipments/${shipmentId}/documents`, { form });
    },
    { onDone: (r) => jobs.track(r.items.map((i) => i.jobId)) },
  );
  const onFiles = (list: FileList | null) => {
    const files = Array.from(list ?? []);
    if (files.length) upload.run(files);
  };
  return (
    <div
      className={`card flex flex-col items-center gap-3 border-2 border-dashed p-8 text-center transition-colors ${drag ? "border-primary bg-primary-soft" : "border-line-strong"}`}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); onFiles(e.dataTransfer.files); }}
    >
      <UploadCloud className="size-8 text-primary" />
      <div>
        <p className="font-semibold text-fg">Tarik & lepas dokumen di sini</p>
        <p className="text-sm text-muted">PDF, JPG, atau PNG · maks 20 MB · tipe dokumen terdeteksi otomatis</p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <select value={type} onChange={(e) => setType(e.target.value)} className="input w-auto">
          <option value="">Deteksi otomatis</option>
          {Object.entries(DOC_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button type="button" className="btn-primary" disabled={upload.pending} onClick={() => input.current?.click()}>
          {upload.pending ? <Spinner /> : <UploadCloud className="size-4" />} Pilih file
        </button>
        <input ref={input} type="file" multiple accept="application/pdf,image/jpeg,image/png" className="hidden" onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />
      </div>
      {jobs.busy && <p className="flex items-center gap-2 text-sm text-info"><Spinner /> Mengekstraksi dokumen…</p>}
      <ErrorText error={upload.error ?? jobs.failed} />
    </div>
  );
}

export function DocTypeSelect({ documentId, value }: { documentId: string; value: string }) {
  const jobs = useJobs();
  const save = useAction((type: string) => api<{ jobId: string }>(`/documents/${documentId}`, { method: "PATCH", body: { type } }), {
    onDone: (r) => jobs.track([r.jobId]),
  });
  return (
    <div className="flex items-center gap-2">
      <select
        key={value /* remount when the detected type arrives after refresh */}
        defaultValue={value}
        disabled={save.pending || jobs.busy}
        onChange={(e) => save.run(e.target.value)}
        className="rounded-lg border border-transparent bg-transparent py-1 pr-6 text-sm font-semibold text-fg hover:border-line-strong"
        title="Koreksi tipe dokumen"
      >
        {Object.entries(DOC_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
      {(save.pending || jobs.busy) && <Spinner />}
    </div>
  );
}

export function DeleteDocButton({ documentId }: { documentId: string }) {
  const del = useAction(() => api(`/documents/${documentId}`, { method: "DELETE" }));
  return (
    <ConfirmButton className="btn-ghost btn-sm" confirmLabel="Hapus?" onConfirm={() => del.run()} title="Hapus dokumen">
      <Trash2 className="size-4" />
    </ConfirmButton>
  );
}

export function FindingActions({ findingId, status }: { findingId: string; status: string }) {
  const [open, setOpen] = useState(false);
  const save = useAction((body: object) => api(`/findings/${findingId}`, { method: "PATCH", body }), { onDone: () => setOpen(false) });
  if (status === "ACCEPTED") {
    return <button className="btn-ghost btn-sm" disabled={save.pending} onClick={() => save.run({ status: "OPEN" })}>Buka lagi</button>;
  }
  return (
    <>
      <button className="btn-secondary btn-sm" onClick={() => setOpen(true)}><CheckCircle2 className="size-3.5" /> Terima</button>
      <Modal open={open} onClose={() => setOpen(false)} title="Terima temuan dengan alasan">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.run({ status: "ACCEPTED", acceptReason: new FormData(e.currentTarget).get("reason") });
          }}
        >
          <p className="text-sm text-fg-2">Temuan yang diterima tidak lagi memblokir status SIAP. Alasan tercatat di audit log (F5.7).</p>
          <Field label="Alasan"><textarea name="reason" required minLength={5} rows={3} className="input" placeholder="mis. Pembeli sudah menyetujui discrepancy lewat email 3 Nov" /></Field>
          <ErrorText error={save.error} />
          <button className="btn-primary w-full" disabled={save.pending}>{save.pending && <Spinner />} Terima temuan</button>
        </form>
      </Modal>
    </>
  );
}
