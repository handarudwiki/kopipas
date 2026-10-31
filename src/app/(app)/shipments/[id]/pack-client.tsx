"use client";

import { BadgeCheck, Check, Copy, Link2, XCircle } from "lucide-react";
import { useState } from "react";
import { api, ConfirmButton, ErrorText, Field, Modal, Spinner, useAction } from "@/components/client";
import { useJobs } from "@/components/jobs";

export function GeneratePackButton({ shipmentId, disabled, reason }: { shipmentId: string; disabled: boolean; reason?: string }) {
  const jobs = useJobs();
  const gen = useAction(() => api<{ jobId: string }>(`/shipments/${shipmentId}/evidence-packs`, { method: "POST" }), { refresh: false, onDone: (r) => jobs.track([r.jobId]) });
  const busy = gen.pending || jobs.busy;
  return (
    <div className="flex flex-col items-end gap-1">
      <button className="btn-primary" disabled={disabled || busy} title={disabled ? reason : undefined} onClick={() => gen.run()}>
        {busy ? <Spinner /> : <BadgeCheck className="size-4" />} Setujui & buat paket
      </button>
      {(gen.error || jobs.failed) && <span className="max-w-xs text-right text-xs text-err">{gen.error ?? jobs.failed}</span>}
    </div>
  );
}

export function CopyText({ text, short }: { text: string; short?: boolean }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      type="button"
      title={text}
      onClick={async () => { await navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 1500); }}
      className="inline-flex max-w-full items-center gap-1.5 font-mono text-xs text-fg-2 hover:text-primary"
    >
      <span className="truncate">{short ? `${text.slice(0, 16)}…` : text}</span>
      {ok ? <Check className="size-3.5 shrink-0 text-ok" /> : <Copy className="size-3.5 shrink-0" />}
    </button>
  );
}

export function NewShareLinkButton({ packs }: { packs: { id: string; version: number }[] }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [packId, setPackId] = useState(packs[0]?.id ?? "");
  const create = useAction((body: object) => api<{ url: string }>(`/evidence-packs/${packId}/share-links`, { body }), { onDone: (r) => setUrl(r.url) });
  return (
    <>
      <button className="btn-primary btn-sm" onClick={() => { setUrl(null); setOpen(true); }}><Link2 className="size-3.5" /> Buat tautan</button>
      <Modal open={open} onClose={() => setOpen(false)} title="Tautan berbagi importir">
        {url ? (
          <div className="space-y-3">
            <p className="text-sm text-fg-2">Salin sekarang — tautan hanya ditampilkan sekali (yang disimpan hanya hash-nya). Setiap akses tercatat.</p>
            <div className="rounded-xl bg-surface-2 p-3"><CopyText text={url} /></div>
          </div>
        ) : (
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); create.run({ label: fd.get("label") || null, expiresInDays: Number(fd.get("days")) }); }}>
            <Field label="Versi paket">
              <select value={packId} onChange={(e) => setPackId(e.target.value)} className="input">
                {packs.map((p) => <option key={p.id} value={p.id}>v{p.version}</option>)}
              </select>
            </Field>
            <Field label="Label (penerima)"><input name="label" className="input" placeholder="mis. Hanseatic — compliance team" /></Field>
            <Field label="Masa berlaku (hari)"><input name="days" type="number" min={1} max={365} defaultValue={90} className="input" /></Field>
            <ErrorText error={create.error} />
            <button className="btn-primary w-full" disabled={create.pending}>{create.pending && <Spinner />} Buat tautan</button>
          </form>
        )}
      </Modal>
    </>
  );
}

export function RevokeLinkButton({ id }: { id: string }) {
  const rev = useAction(() => api(`/share-links/${id}`, { method: "DELETE" }));
  return <ConfirmButton className="btn-ghost btn-sm" confirmLabel="Cabut?" onConfirm={() => rev.run()}><XCircle className="size-4" /> Cabut</ConfirmButton>;
}
