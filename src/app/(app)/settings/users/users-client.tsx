"use client";

import { Check, Copy, Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { api, ErrorText, Field, Modal, Spinner, useAction } from "@/components/client";

const ROLES = [
  ["ADMIN", "Admin Eksportir"],
  ["DOC_STAFF", "Staf Dokumen"],
  ["FIELD_OFFICER", "Petugas Lapangan"],
  ["FORWARDER", "Forwarder"],
] as const;

function InviteLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-3">
      <p className="text-sm text-fg-2">Bagikan tautan ini ke pengguna. Tautan berlaku 7 hari dan hanya bisa dipakai sekali.</p>
      <div className="flex gap-2">
        <input readOnly value={url} className="input font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
        <button
          type="button"
          className="btn-secondary"
          onClick={async () => {
            await navigator.clipboard.writeText(url);
            setCopied(true);
          }}
        >
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        </button>
      </div>
    </div>
  );
}

export function InviteButton() {
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const invite = useAction((body: Record<string, FormDataEntryValue | null>) => api<{ inviteUrl: string }>("/auth/invite", { body }), {
    onDone: (r) => setLink(r.inviteUrl),
  });
  return (
    <>
      <button className="btn-primary" onClick={() => { setLink(null); setOpen(true); }}>
        <Plus className="size-4" /> Undang pengguna
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Undang pengguna">
        {link ? (
          <InviteLink url={link} />
        ) : (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              invite.run({ name: fd.get("name"), email: fd.get("email"), role: fd.get("role") });
            }}
          >
            <Field label="Nama"><input name="name" required minLength={2} className="input" /></Field>
            <Field label="Email"><input name="email" type="email" required className="input" /></Field>
            <Field label="Peran">
              <select name="role" className="input" defaultValue="DOC_STAFF">
                {ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Field>
            <ErrorText error={invite.error} />
            <button className="btn-primary w-full" disabled={invite.pending}>{invite.pending && <Spinner />} Buat tautan undangan</button>
          </form>
        )}
      </Modal>
    </>
  );
}

type U = { id: string; name: string; email: string; role: string; isActive: boolean; invited: boolean };

export function UserRowActions({ user }: { user: U }) {
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const save = useAction((body: object) => api(`/users/${user.id}`, { method: "PATCH", body }), { onDone: () => setOpen(false) });
  const reinvite = useAction(() => api<{ inviteUrl: string }>("/auth/invite", { body: { name: user.name, email: user.email, role: user.role } }), {
    onDone: (r) => setLink(r.inviteUrl),
    refresh: false,
  });
  return (
    <>
      <button className="btn-ghost btn-sm" onClick={() => { setLink(null); setOpen(true); }} aria-label="Ubah">
        <Pencil className="size-4" />
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Ubah ${user.name}`}>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            save.run({ role: fd.get("role"), isActive: fd.get("isActive") === "on" });
          }}
        >
          <Field label="Peran">
            <select name="role" className="input" defaultValue={user.role}>
              {ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Field>
          <label className="flex items-center gap-2 text-sm text-fg">
            <input type="checkbox" name="isActive" defaultChecked={user.isActive} className="size-4 accent-[var(--primary)]" /> Akun aktif
          </label>
          <ErrorText error={save.error ?? reinvite.error} />
          {link && <InviteLink url={link} />}
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary" disabled={save.pending}>{save.pending && <Spinner />} Simpan</button>
            {user.invited && (
              <button type="button" className="btn-secondary" onClick={() => reinvite.run()} disabled={reinvite.pending}>
                Buat ulang tautan undangan
              </button>
            )}
          </div>
        </form>
      </Modal>
    </>
  );
}
