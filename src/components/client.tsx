"use client";

import clsx from "clsx";
import { Loader2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";

export class ClientApiError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

/** fetch wrapper for /api/v1 — JSON in/out, throws ClientApiError with server message. */
export async function api<T = unknown>(path: string, init?: { method?: string; body?: unknown; form?: FormData }): Promise<T> {
  const res = await fetch(path.startsWith("/api") ? path : `/api/v1${path}`, {
    method: init?.method ?? (init?.body || init?.form ? "POST" : "GET"),
    headers: init?.form ? undefined : { "content-type": "application/json" },
    body: init?.form ?? (init?.body !== undefined ? JSON.stringify(init.body) : undefined),
    credentials: "same-origin",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const details = (data as { details?: { path: string; message: string }[] }).details;
    const extra = Array.isArray(details) && details.length ? `: ${details.map((d) => (d.path ? `${d.path} — ${d.message}` : d.message)).join("; ")}` : "";
    throw new ClientApiError(res.status, `${(data as { error?: string }).error ?? `HTTP ${res.status}`}${extra}`, details);
  }
  return data as T;
}

/** Runs an async action, tracks pending/error, refreshes server components on success. */
export function useAction<A extends unknown[], R>(fn: (...args: A) => Promise<R>, opts?: { refresh?: boolean; onDone?: (r: R) => void }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(
    async (...args: A) => {
      setPending(true);
      setError(null);
      try {
        const r = await fn(...args);
        opts?.onDone?.(r);
        if (opts?.refresh !== false) router.refresh();
        return r;
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        return undefined;
      } finally {
        setPending(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fn, router],
  );
  return { run, pending, error, setError };
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={clsx("size-4 animate-spin", className)} />;
}

export function ErrorText({ error }: { error: string | null }) {
  if (!error) return null;
  return <p className="rounded-lg bg-err-soft px-3 py-2 text-sm text-err">{error}</p>;
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-6" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className={clsx("card max-h-[92vh] w-full overflow-y-auto rounded-b-none p-6 sm:rounded-2xl", wide ? "sm:max-w-3xl" : "sm:max-w-lg")}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between gap-4">
          <h2 className="text-lg font-bold text-fg">{title}</h2>
          <button type="button" onClick={onClose} className="btn-ghost btn-sm" aria-label="Tutup">
            <X className="size-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Two-step inline confirm (avoids browser dialogs). */
export function ConfirmButton({
  children, confirmLabel = "Yakin?", onConfirm, className = "btn-secondary btn-sm", disabled, title,
}: { children: ReactNode; confirmLabel?: string; onConfirm: () => void | Promise<unknown>; className?: string; disabled?: boolean; title?: string }) {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      type="button"
      title={title}
      disabled={disabled || busy}
      className={clsx(className, armed && "!bg-err !text-white")}
      onClick={async () => {
        if (!armed) return setArmed(true);
        setBusy(true);
        try {
          await onConfirm();
        } finally {
          setBusy(false);
          setArmed(false);
        }
      }}
    >
      {busy && <Spinner />}
      {armed ? confirmLabel : children}
    </button>
  );
}

export function Field({ label, children, hint, className }: { label: string; children: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <label className={clsx("block", className)}>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function formToObject(form: HTMLFormElement): Record<string, string> {
  return Object.fromEntries(Array.from(new FormData(form).entries()).filter(([, v]) => typeof v === "string")) as Record<string, string>;
}
