"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, ErrorText, Field, Spinner } from "@/components/client";

export function AcceptForm({ token, name }: { token: string; name: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        if (fd.get("password") !== fd.get("confirm")) return setError("Konfirmasi password tidak sama");
        setPending(true);
        setError(null);
        try {
          const r = await api<{ user: { role: string } }>("/auth/accept", {
            body: { token, password: fd.get("password"), name: fd.get("name") },
          });
          router.push(r.user.role === "FIELD_OFFICER" ? "/field" : "/dashboard");
          router.refresh();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Gagal");
          setPending(false);
        }
      }}
    >
      <Field label="Nama lengkap">
        <input name="name" defaultValue={name} required minLength={2} className="input" />
      </Field>
      <Field label="Password baru" hint="Minimal 8 karakter">
        <input name="password" type="password" required minLength={8} autoComplete="new-password" className="input" />
      </Field>
      <Field label="Ulangi password">
        <input name="confirm" type="password" required minLength={8} autoComplete="new-password" className="input" />
      </Field>
      <ErrorText error={error} />
      <button className="btn-primary w-full" disabled={pending}>
        {pending && <Spinner />} Simpan & masuk
      </button>
    </form>
  );
}
