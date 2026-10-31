"use client";

import { Lock, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { api, ConfirmButton, useAction } from "@/components/client";

export function LockLotButton({ id, disabled }: { id: string; disabled?: boolean }) {
  const lock = useAction(() => api(`/lots/${id}/lock`, { method: "POST" }));
  return (
    <div className="flex flex-col items-end gap-1">
      <ConfirmButton className="btn-primary" confirmLabel="Kunci permanen?" disabled={disabled} onConfirm={() => lock.run()} title={disabled ? "Berat lot melebihi pembelian" : undefined}>
        <Lock className="size-4" /> Kunci lot
      </ConfirmButton>
      {lock.error && <span className="max-w-xs text-right text-xs text-err">{lock.error}</span>}
    </div>
  );
}

export function DeleteLotButton({ id }: { id: string }) {
  const router = useRouter();
  const del = useAction(() => api(`/lots/${id}`, { method: "DELETE" }), { refresh: false, onDone: () => router.push("/lots") });
  return (
    <ConfirmButton className="btn-secondary" confirmLabel="Hapus lot?" onConfirm={() => del.run()}>
      <Trash2 className="size-4" /> Hapus
    </ConfirmButton>
  );
}
