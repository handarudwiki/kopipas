"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { api, ErrorText, Field, Spinner } from "@/components/client";

export function LoginForm() {
  const router = useRouter();
  const next = useSearchParams().get("next");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setPending(true);
        setError(null);
        try {
          const r = await api<{ user: { role: string } }>("/auth/login", {
            body: { email: fd.get("email"), password: fd.get("password") },
          });
          const fallback = r.user.role === "FIELD_OFFICER" ? "/field" : "/dashboard";
          router.push(next && next.startsWith("/") && !next.startsWith("//") ? next : fallback);
          router.refresh();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Gagal masuk");
          setPending(false);
        }
      }}
    >
      <Field label="Email">
        <input name="email" type="email" required autoComplete="email" className="input" placeholder="nama@perusahaan.co.id" />
      </Field>
      <Field label="Password">
        <input name="password" type="password" required autoComplete="current-password" className="input" />
      </Field>
      <ErrorText error={error} />
      <button className="btn-primary w-full" disabled={pending}>
        {pending && <Spinner />} Masuk
      </button>
    </form>
  );
}
