"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./client";

type Job = { id: string; status: "QUEUED" | "RUNNING" | "DONE" | "FAILED"; error: string | null; result: unknown };

/** Polls GET /jobs/{id} until finished, then refreshes server components. */
export function useJobs() {
  const router = useRouter();
  const [active, setActive] = useState<string[]>([]);
  const [failed, setFailed] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const poll = useCallback(async (ids: string[]) => {
    const remaining: string[] = [];
    for (const id of ids) {
      try {
        const j = await api<Job>(`/jobs/${id}`);
        if (j.status === "FAILED") setFailed(j.error ?? "Job gagal");
        if (j.status === "QUEUED" || j.status === "RUNNING") remaining.push(id);
      } catch {
        /* ignore transient */
      }
    }
    if (remaining.length < ids.length) router.refresh();
    setActive(remaining);
  }, [router]);

  useEffect(() => {
    if (!active.length) return;
    timer.current = setTimeout(() => void poll(active), 900);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [active, poll]);

  return {
    track: (ids: string[]) => {
      setFailed(null);
      setActive((a) => [...new Set([...a, ...ids])]);
    },
    busy: active.length > 0,
    failed,
  };
}
