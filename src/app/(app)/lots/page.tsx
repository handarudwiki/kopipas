import type { Metadata } from "next";
import Link from "next/link";
import { Lock, Plus } from "lucide-react";
import { getCtxWith } from "@/lib/auth/current";
import { can } from "@/lib/auth/rbac";
import { fmtDate, fmtKg } from "@/lib/format";
import { listLots } from "@/server/lots";
import { Empty, PageHeader, Pill, Table, TableCard, Tag } from "@/components/ui";
import { FORM_LABEL } from "@/components/status";

export const metadata: Metadata = { title: "Lot" };

export default async function LotsPage() {
  const ctx = await getCtxWith("lot:read");
  const lots = await listLots(ctx);
  return (
    <>
      <PageHeader title="Lot" subtitle="Kebun → pembelian → lot → pengiriman. Lot dikunci sebelum ditautkan ke pengiriman." actions={can(ctx.role, "lot:write") && <Link href="/lots/new" className="btn-primary"><Plus className="size-4" /> Buat lot</Link>} />
      <TableCard>
        {lots.length === 0 ? (
          <Empty title="Belum ada lot" hint="Susun lot dari satu atau lebih pembelian." />
        ) : (
          <Table head={["Kode", "Bentuk", "Berat lot", "Tersedia (konversi)", "Kebun asal", "Pengiriman", "Status", "Dibuat"]}>
            {lots.map((l) => (
              <tr key={l.id} className="table-row">
                <td><Link href={`/lots/${l.id}`} className="font-bold text-fg hover:text-primary">{l.code}</Link></td>
                <td><Tag>{FORM_LABEL[l.productForm]}</Tag></td>
                <td className="font-semibold">{fmtKg(l.weightKg)}</td>
                <td className={l.exceeds ? "font-semibold text-err" : "text-fg-2"}>{fmtKg(l.availableKg)}</td>
                <td>{l.plotCount}</td>
                <td className="text-fg-2">{l.shipments.map((s) => <Link key={s.shipmentId} href={`/shipments/${s.shipment.id}?tab=lots`} className="mr-2 hover:text-primary">{s.shipment.reference}</Link>)}{!l.shipments.length && "—"}</td>
                <td>{l.lockedAt ? <Pill tone="info"><Lock className="size-3" /> Terkunci</Pill> : l.exceeds ? <Pill tone="err">Kelebihan berat</Pill> : <Pill tone="neutral">Draf</Pill>}</td>
                <td className="whitespace-nowrap text-fg-2">{fmtDate(l.createdAt)}</td>
              </tr>
            ))}
          </Table>
        )}
      </TableCard>
    </>
  );
}
