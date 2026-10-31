"use client";

import { Pencil, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, ErrorText, Field, Modal, Spinner, useAction } from "@/components/client";

type FarmerValues = { fullName?: string; village?: string; district?: string; regency?: string; province?: string; phone?: string | null };

function FarmerForm({ initial, onSubmit, pending, error, isNew }: { initial?: FarmerValues; onSubmit: (v: Record<string, unknown>) => void; pending: boolean; error: string | null; isNew: boolean }) {
  const i = initial ?? {};
  return (
    <form
      className="grid gap-4 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const g = (k: string) => (fd.get(k) as string)?.trim() || null;
        onSubmit({
          fullName: g("fullName"), village: g("village"), district: g("district"), regency: g("regency"), province: g("province"), phone: g("phone"),
          ...(isNew ? { consent: fd.get("consent") === "on" } : {}),
        });
      }}
    >
      <Field label="Nama lengkap" className="sm:col-span-2"><input name="fullName" required defaultValue={i.fullName} className="input" /></Field>
      <Field label="Desa"><input name="village" required defaultValue={i.village} className="input" /></Field>
      <Field label="Kecamatan"><input name="district" required defaultValue={i.district} className="input" /></Field>
      <Field label="Kabupaten"><input name="regency" required defaultValue={i.regency} className="input" /></Field>
      <Field label="Provinsi"><input name="province" required defaultValue={i.province ?? "Sumatera Utara"} className="input" /></Field>
      <Field label="Kontak (HP)" className="sm:col-span-2"><input name="phone" defaultValue={i.phone ?? ""} className="input" placeholder="08…" /></Field>
      {isNew && (
        <label className="flex items-start gap-3 rounded-xl bg-surface-2 p-3 text-sm sm:col-span-2">
          <input type="checkbox" name="consent" required className="mt-0.5 size-4 accent-[var(--primary)]" />
          <span className="text-fg-2">
            Petani <b>menyetujui</b> data dirinya, lokasi kebun, dan bukti legalitas lahan dibagikan kepada pembeli di Uni Eropa melalui paket bukti EUDR yang disetujui admin (UU No. 27/2022 PDP).
          </span>
        </label>
      )}
      <div className="space-y-3 sm:col-span-2">
        <ErrorText error={error} />
        <button className="btn-primary w-full" disabled={pending}>{pending && <Spinner />} {isNew ? "Daftarkan petani" : "Simpan"}</button>
      </div>
    </form>
  );
}

export function NewFarmerButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const create = useAction((body: Record<string, unknown>) => api<{ id: string }>("/farmers", { body }), {
    refresh: false,
    onDone: (f) => router.push(`/farmers/${f.id}`),
  });
  return (
    <>
      <button className="btn-primary" onClick={() => setOpen(true)}><Plus className="size-4" /> Daftarkan petani</button>
      <Modal open={open} onClose={() => setOpen(false)} title="Petani baru" wide>
        <FarmerForm isNew onSubmit={create.run} pending={create.pending} error={create.error} />
      </Modal>
    </>
  );
}

export function EditFarmerButton({ farmer }: { farmer: FarmerValues & { id: string } }) {
  const [open, setOpen] = useState(false);
  const save = useAction((body: Record<string, unknown>) => api(`/farmers/${farmer.id}`, { method: "PATCH", body }), { onDone: () => setOpen(false) });
  return (
    <>
      <button className="btn-secondary" onClick={() => setOpen(true)}><Pencil className="size-4" /> Ubah</button>
      <Modal open={open} onClose={() => setOpen(false)} title="Ubah petani" wide>
        <FarmerForm isNew={false} initial={farmer} onSubmit={save.run} pending={save.pending} error={save.error} />
      </Modal>
    </>
  );
}
