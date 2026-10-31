"use client";

import { Link2, Unlink } from "lucide-react";
import { useState } from "react";
import { api, ConfirmButton, ErrorText, Modal, Spinner, useAction } from "@/components/client";
import { useJobs } from "@/components/jobs";

type L = { id: string; code: string; weightKg: number; form: string; inUse: number };

export function LinkLotsButton({ shipmentId, lots }: { shipmentId: string; lots: L[] }) {
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const jobs = useJobs();
  const link = useAction(() => api<{ jobId: string | null }>(`/shipments/${shipmentId}/lots`, { body: { lotIds: [...sel] } }), {
    onDone: (r) => { setOpen(false); setSel(new Set()); if (r.jobId) jobs.track([r.jobId]); },
  });
  return (
    <>
      <button className="btn-primary btn-sm" onClick={() => setOpen(true)}>{jobs.busy ? <Spinner /> : <Link2 className="size-3.5" />} Tautkan lot</button>
      <Modal open={open} onClose={() => setOpen(false)} title="Tautkan lot terkunci">
        {lots.length === 0 ? (
          <p className="text-sm text-muted">Tidak ada lot terkunci yang tersedia. Kunci lot di halaman Lot terlebih dahulu.</p>
        ) : (
          <div className="space-y-3">
            <ul className="max-h-80 space-y-2 overflow-y-auto">
              {lots.map((l) => (
                <li key={l.id}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-line p-3 hover:border-primary">
                    <input type="checkbox" checked={sel.has(l.id)} onChange={() => setSel((s) => { const n = new Set(s); if (n.has(l.id)) n.delete(l.id); else n.add(l.id); return n; })} className="size-4 accent-[var(--primary)]" />
                    <span className="flex-1"><b>{l.code}</b> <span className="text-sm text-fg-2">· {l.form} · {l.weightKg.toLocaleString("en-US")} kg</span></span>
                    {l.inUse > 0 && <span className="text-xs text-warn">dipakai {l.inUse} pengiriman</span>}
                  </label>
                </li>
              ))}
            </ul>
            <ErrorText error={link.error} />
            <button className="btn-primary w-full" disabled={!sel.size || link.pending} onClick={() => link.run()}>{link.pending && <Spinner />} Tautkan {sel.size || ""} lot</button>
          </div>
        )}
      </Modal>
    </>
  );
}

export function UnlinkLotButton({ shipmentId, lotId }: { shipmentId: string; lotId: string }) {
  const un = useAction(() => api(`/shipments/${shipmentId}/lots/${lotId}`, { method: "DELETE" }));
  return <ConfirmButton className="btn-ghost btn-sm" confirmLabel="Lepas?" onConfirm={() => un.run()}><Unlink className="size-4" /></ConfirmButton>;
}
