"use client";

import { RefreshCw } from "lucide-react";
import { useState } from "react";
import { api, Spinner, useAction } from "@/components/client";

export function RecheckAllButton() {
  const [msg, setMsg] = useState<string | null>(null);
  const run = useAction(() => api<{ queued: number }>("/risk/recheck-all", { method: "POST" }), {
    onDone: (r) => setMsg(`${r.queued} kebun dijadwalkan cek ulang`),
  });
  return (
    <div className="flex items-center gap-3">
      {msg && <span className="text-sm text-ok">{msg}</span>}
      {run.error && <span className="text-sm text-err">{run.error}</span>}
      <button className="btn-secondary" disabled={run.pending} onClick={() => run.run()}>
        {run.pending ? <Spinner /> : <RefreshCw className="size-4" />} Cek ulang semua
      </button>
    </div>
  );
}
