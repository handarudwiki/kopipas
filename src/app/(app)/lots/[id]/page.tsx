import type { Metadata } from "next";
import Link from "next/link";
import { Lock } from "lucide-react";
import { getCtxWith } from "@/lib/auth/current";
import { can } from "@/lib/auth/rbac";
import { fmtDate, fmtDateTime, fmtKg } from "@/lib/format";
import { getLot } from "@/server/lots";
import { Alert, Card, KV, PageHeader, Pill, Table, TableCard } from "@/components/ui";
import { FORM_LABEL, RiskPill, ShipmentStatusPill } from "@/components/status";
import { DeleteLotButton, LockLotButton } from "./lot-client";

export const metadata: Metadata = { title: "Detail lot" };

export default async function LotPage({ params }: PageProps<"/lots/[id]">) {
  const ctx = await getCtxWith("lot:read");
  const { id } = await params;
  const lot = await getLot(ctx, id);
  const canWrite = can(ctx.role, "lot:write");
  const dates = lot.purchases.map((p) => p.purchase.date.getTime());
  return (
    <>
      <PageHeader
        back={{ href: "/lots", label: "Lot" }}
        title={<span className="flex flex-wrap items-center gap-3">{lot.code} {lot.lockedAt ? <Pill tone="info"><Lock className="size-3" /> Terkunci</Pill> : <Pill tone="neutral">Draf</Pill>}</span>}
        subtitle={`${FORM_LABEL[lot.productForm]} · ${fmtKg(lot.weightKg)} · ${lot.originPlots.length} kebun asal`}
        actions={canWrite && !lot.lockedAt && <><DeleteLotButton id={lot.id} /><LockLotButton id={lot.id} disabled={lot.exceeds} /></>}
      />
      {lot.exceeds && <div className="mb-6"><Alert tone="err" title="Berat lot melebihi pembelian">Kelebihan {fmtKg(lot.overKg)} setelah konversi. Kurangi berat lot atau tambahkan pembelian; lot tidak dapat dikunci (F4.4).</Alert></div>}
      <div className="grid gap-6 xl:grid-cols-3">
        <Card title="Ringkasan">
          <KV items={[
            ["Berat lot", fmtKg(lot.weightKg)],
            ["Tersedia setelah konversi", fmtKg(lot.availableKg)],
            ["Rentang pembelian", dates.length ? `${fmtDate(new Date(Math.min(...dates)))} – ${fmtDate(new Date(Math.max(...dates)))}` : "—"],
            ["Dikunci", lot.lockedAt ? fmtDateTime(lot.lockedAt) : "—"],
            ["Pengiriman", lot.shipments.length ? lot.shipments.map((s) => s.shipment.reference).join(", ") : "—"],
          ]} />
          {lot.shipments.map((s) => (
            <Link key={s.shipmentId} href={`/shipments/${s.shipment.id}?tab=lots`} className="mt-4 flex items-center justify-between rounded-xl border border-line p-3 text-sm hover:border-primary">
              <span className="font-semibold">{s.shipment.reference}</span><ShipmentStatusPill status={s.shipment.status} />
            </Link>
          ))}
        </Card>
        <TableCard className="xl:col-span-2">
          <h2 className="px-2 pb-3 pt-1 text-base font-bold">Kebun asal ({lot.originPlots.length})</h2>
          <Table head={["Kebun", "Petani", "Status risiko"]}>
            {lot.originPlots.map((p) => (
              <tr key={p.id} className="table-row">
                <td><Link href={`/plots/${p.id}`} className="font-semibold hover:text-primary">{p.label ?? `Kebun ${p.id.slice(0, 6)}`}</Link></td>
                <td className="text-fg-2">{p.farmer}</td>
                <td><RiskPill status={p.riskStatus as "PASS"} /></td>
              </tr>
            ))}
          </Table>
        </TableCard>
      </div>
      <TableCard className="mt-6">
        <h2 className="px-2 pb-3 pt-1 text-base font-bold">Pembelian ({lot.purchases.length})</h2>
        <Table head={["Tanggal", "Petani", "Kebun", "Bentuk", "Berat"]}>
          {lot.purchases.map(({ purchase: p }) => (
            <tr key={p.id} className="table-row">
              <td>{fmtDate(p.date)}</td>
              <td>{p.farmer.fullName}</td>
              <td className="text-fg-2">{p.plot.label ?? "Kebun"}</td>
              <td>{FORM_LABEL[p.form]}</td>
              <td className="font-semibold">{fmtKg(p.weightKg)}</td>
            </tr>
          ))}
        </Table>
      </TableCard>
    </>
  );
}
