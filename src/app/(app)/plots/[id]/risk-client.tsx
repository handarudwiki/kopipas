"use client";

import { RefreshCw } from "lucide-react";
import { useState } from "react";
import { api, ErrorText, Field, Spinner, useAction } from "@/components/client";
import { useJobs } from "@/components/jobs";

export function RecheckButton({ plotId }: { plotId: string }) {
  const jobs = useJobs();
  const run = useAction(() => api<{ jobId: string }>(`/plots/${plotId}/risk-checks`, { method: "POST" }), { refresh: false, onDone: (r) => jobs.track([r.jobId]) });
  return (
    <button className="btn-secondary btn-sm" disabled={run.pending || jobs.busy} onClick={() => run.run()}>
      {run.pending || jobs.busy ? <Spinner /> : <RefreshCw className="size-3.5" />} Cek ulang
    </button>
  );
}

export function DecisionForm({ plotId, checkId }: { plotId: string; checkId: string }) {
  const [decision, setDecision] = useState<"PASS" | "RISK">("PASS");
  const save = useAction((form: FormData) => api(`/plots/${plotId}/risk-checks/${checkId}/decision`, { form }));
  return (
    <form
      className="space-y-3 rounded-xl border border-warn/40 bg-warn-soft/40 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        fd.set("decision", decision);
        save.run(fd);
      }}
    >
      <p className="text-sm font-bold text-fg">Verifikasi lapangan (F3.4)</p>
      <div className="inline-flex rounded-xl bg-surface p-1">
        {([["PASS", "Terverifikasi — LOLOS"], ["RISK", "Dikonfirmasi BERISIKO"]] as const).map(([v, l]) => (
          <button key={v} type="button" onClick={() => setDecision(v)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${decision === v ? (v === "PASS" ? "bg-ok text-white" : "bg-err text-white") : "text-fg-2"}`}>{l}</button>
        ))}
      </div>
      <Field label="Catatan verifikasi"><textarea name="note" required minLength={10} rows={3} className="input" placeholder="Temuan di lapangan, tanggal kunjungan, saksi…" /></Field>
      <Field label="Foto lapangan"><input name="photo" type="file" multiple accept="image/jpeg,image/png,image/webp" className="input" /></Field>
      <ErrorText error={save.error} />
      <button className="btn-primary" disabled={save.pending}>{save.pending && <Spinner />} Simpan keputusan</button>
    </form>
  );
}
