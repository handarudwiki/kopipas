"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, ErrorText, Field, Modal, Spinner, useAction } from "@/components/client";

export type ShipmentFormValues = {
  reference?: string; buyerName?: string; buyerAddress?: string | null; buyerCountry?: string; portLoading?: string;
  portDischarge?: string; hsCode?: string; productDescription?: string | null; netWeightKg?: string | number | null;
  paymentMethod?: string; presentationDate?: string | null;
};

export function ShipmentForm({ initial, onSubmit, pending, error, submitLabel }: {
  initial?: ShipmentFormValues; onSubmit: (v: Record<string, unknown>) => void; pending: boolean; error: string | null; submitLabel: string;
}) {
  const i = initial ?? {};
  return (
    <form
      className="grid gap-4 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const g = (k: string) => (fd.get(k) as string)?.trim() || null;
        onSubmit({
          reference: g("reference"), buyerName: g("buyerName"), buyerAddress: g("buyerAddress"), buyerCountry: g("buyerCountry"),
          portLoading: g("portLoading"), portDischarge: g("portDischarge"), hsCode: g("hsCode") ?? "0901",
          productDescription: g("productDescription"), netWeightKg: g("netWeightKg") ? Number(g("netWeightKg")) : null,
          paymentMethod: g("paymentMethod"), presentationDate: g("presentationDate"),
        });
      }}
    >
      <Field label="Referensi pengiriman"><input name="reference" required defaultValue={i.reference} placeholder="SHP-2026-001" className="input" /></Field>
      <Field label="Metode pembayaran">
        <select name="paymentMethod" defaultValue={i.paymentMethod ?? "LC"} className="input">
          <option value="LC">L/C (Letter of Credit)</option>
          <option value="TT">T/T (Transfer)</option>
          <option value="OTHER">Lainnya</option>
        </select>
      </Field>
      <Field label="Nama pembeli"><input name="buyerName" required defaultValue={i.buyerName} className="input" /></Field>
      <Field label="Negara pembeli (ISO-2)"><input name="buyerCountry" required maxLength={2} minLength={2} defaultValue={i.buyerCountry ?? "DE"} className="input uppercase" /></Field>
      <Field label="Alamat pembeli" className="sm:col-span-2"><input name="buyerAddress" defaultValue={i.buyerAddress ?? ""} className="input" /></Field>
      <Field label="Pelabuhan muat"><input name="portLoading" required defaultValue={i.portLoading ?? "Belawan"} className="input" /></Field>
      <Field label="Pelabuhan bongkar"><input name="portDischarge" required defaultValue={i.portDischarge} className="input" /></Field>
      <Field label="HS code"><input name="hsCode" defaultValue={i.hsCode ?? "0901.11"} pattern="0901[\d.]*" className="input" /></Field>
      <Field label="Berat bersih (kg)" hint="Kosongkan untuk memakai berat dari invoice/packing list"><input name="netWeightKg" type="number" step="0.01" min="0" defaultValue={i.netWeightKg ?? ""} className="input" /></Field>
      <Field label="Deskripsi produk" className="sm:col-span-2"><input name="productDescription" defaultValue={i.productDescription ?? ""} placeholder="Green coffee beans, Arabica" className="input" /></Field>
      <Field label="Tanggal presentasi ke bank" hint="Untuk aturan D10; kosong = hari ini"><input name="presentationDate" type="date" defaultValue={i.presentationDate ?? ""} className="input" /></Field>
      <div className="sm:col-span-2 space-y-3">
        <ErrorText error={error} />
        <button className="btn-primary w-full" disabled={pending}>{pending && <Spinner />} {submitLabel}</button>
      </div>
    </form>
  );
}

export function NewShipmentButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const create = useAction((body: Record<string, unknown>) => api<{ id: string }>("/shipments", { body }), {
    refresh: false,
    onDone: (s) => router.push(`/shipments/${s.id}?tab=documents`),
  });
  return (
    <>
      <button className="btn-primary" onClick={() => setOpen(true)}><Plus className="size-4" /> Buat pengiriman</button>
      <Modal open={open} onClose={() => setOpen(false)} title="Pengiriman baru" wide>
        <ShipmentForm onSubmit={create.run} pending={create.pending} error={create.error} submitLabel="Buat pengiriman" />
      </Modal>
    </>
  );
}
