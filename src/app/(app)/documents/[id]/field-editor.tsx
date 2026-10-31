"use client";

import { AlertTriangle, Save } from "lucide-react";
import { useState } from "react";
import { api, ErrorText, Spinner, useAction } from "@/components/client";
import { useJobs } from "@/components/jobs";
import { Alert, cx } from "@/components/ui";
import { REVIEW_CONFIDENCE } from "@/lib/docs/schemas";

type F = { id: string; name: string; label: string; value: string | null; confidence: number; page: number | null; version: number; correctedBy: string | null };

function ConfidenceBar({ c }: { c: number }) {
  const pct = Math.round(c * 100);
  const tone = c >= REVIEW_CONFIDENCE ? "bg-ok" : c >= 0.5 ? "bg-warn" : "bg-err";
  return (
    <div className="flex items-center gap-2" title={`Keyakinan ${pct}%`}>
      <div className="h-1.5 w-14 overflow-hidden rounded-full bg-neutral-soft">
        <div className={cx("h-full rounded-full", tone)} style={{ width: `${Math.max(pct, 4)}%` }} />
      </div>
      <span className="w-8 text-xs tabular-nums text-fg-2">{pct}%</span>
    </div>
  );
}

export function FieldEditor({ documentId, fields, canEdit, needsManual }: { documentId: string; fields: F[]; canEdit: boolean; needsManual: boolean }) {
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(fields.map((f) => [f.name, f.value ?? ""])));
  const [saved, setSaved] = useState(false);
  const jobs = useJobs();
  const dirty = fields.filter((f) => (f.value ?? "") !== (values[f.name] ?? ""));
  const save = useAction(
    () => api<{ jobId: string }>(`/documents/${documentId}/fields`, { method: "PATCH", body: { fields: dirty.map((f) => ({ name: f.name, value: values[f.name] || null })) } }),
    { onDone: (r) => { setSaved(true); if (r.jobId) jobs.track([r.jobId]); } },
  );
  const flagged = fields.filter((f) => f.confidence < REVIEW_CONFIDENCE).length;

  return (
    <section className="card p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold">Field hasil ekstraksi</h2>
          <p className="text-sm text-muted">{flagged} dari {fields.length} field perlu dicek (keyakinan &lt; {REVIEW_CONFIDENCE * 100}%). Koreksi disimpan sebagai versi baru dan memicu validasi ulang.</p>
        </div>
      </div>
      {needsManual && <div className="mb-4"><Alert tone="warn" title="Teks tidak terbaca">File ini hasil pindai/gambar. Isi field secara manual dari pratinjau.</Alert></div>}
      <div className="divide-y divide-line">
        {fields.map((f) => {
          const low = f.confidence < REVIEW_CONFIDENCE;
          const changed = (f.value ?? "") !== (values[f.name] ?? "");
          return (
            <div key={f.id} id={f.name} className={cx("grid gap-2 py-3 sm:grid-cols-[180px_1fr] sm:items-center", low && !f.correctedBy && "target:bg-warn-soft")}>
              <div>
                <p className="flex items-center gap-1.5 text-sm font-semibold text-fg">
                  {low && !f.correctedBy && <AlertTriangle className="size-3.5 text-warn" />}
                  {f.label}
                </p>
                <p className="text-[11px] text-muted">
                  {f.name}{f.page ? ` · hal. ${f.page}` : ""}{f.correctedBy ? ` · dikoreksi ${f.correctedBy} (v${f.version})` : ""}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <input
                  value={values[f.name] ?? ""}
                  disabled={!canEdit}
                  onChange={(e) => { setSaved(false); setValues((v) => ({ ...v, [f.name]: e.target.value })); }}
                  placeholder="(tidak ditemukan)"
                  className={cx("input", low && !f.correctedBy && "border-warn/60 bg-warn-soft/40", changed && "border-primary")}
                />
                <ConfidenceBar c={f.confidence} />
              </div>
            </div>
          );
        })}
      </div>
      {canEdit && (
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button className="btn-primary" disabled={!dirty.length || save.pending} onClick={() => save.run()}>
            {save.pending ? <Spinner /> : <Save className="size-4" />} Simpan koreksi{dirty.length ? ` (${dirty.length})` : ""}
          </button>
          {jobs.busy && <span className="flex items-center gap-2 text-sm text-info"><Spinner /> Validasi ulang…</span>}
          {saved && !jobs.busy && <span className="text-sm font-semibold text-ok">Tersimpan & divalidasi ulang</span>}
          <ErrorText error={save.error ?? jobs.failed} />
        </div>
      )}
    </section>
  );
}
