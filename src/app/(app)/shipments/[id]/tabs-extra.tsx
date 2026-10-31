import Link from "next/link";
import type { Ctx } from "@/lib/context";
import { can } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db";
import { fmtKg, fmtNum } from "@/lib/format";
import { lotTotals, type getShipmentDetail } from "@/server/shipments";
import { Card, Empty, Stat, Table, TableCard, Tag } from "@/components/ui";
import { FORM_LABEL, RiskPill } from "@/components/status";
import { LinkLotsButton, UnlinkLotButton } from "./lots-client";
import { PackTab } from "./pack-tab";

type Shipment = Awaited<ReturnType<typeof getShipmentDetail>>;

/** Tabs added by later milestones (lots M5, evidence pack M6). */
export function extraTabs(s: Shipment): { key: string; href: string; label: string; count?: number }[] {
  return [
    { key: "lots", href: "?tab=lots", label: "Lot & kebun", count: s.lots.length },
    { key: "pack", href: "?tab=pack", label: "Paket bukti", count: s.evidencePacks.length },
  ];
}

export async function ShipmentExtraTabs({ tab, shipment, ctx }: { tab: string; shipment: Shipment; ctx: Ctx }) {
  if (tab === "lots") return <LotsTab s={shipment} ctx={ctx} />;
  if (tab === "pack") return <PackTab s={shipment} ctx={ctx} />;
  return null;
}

/** F5.1 — linked lots, total weight, origin plots. */
async function LotsTab({ s, ctx }: { s: Shipment; ctx: Ctx }) {
  const totals = await lotTotals(ctx.orgId, s.id);
  const linkedIds = s.lots.map((l) => l.lotId);
  const available = await prisma.lot.findMany({
    where: { orgId: ctx.orgId, lockedAt: { not: null }, id: { notIn: linkedIds } },
    select: { id: true, code: true, weightKg: true, productForm: true, shipments: { select: { shipmentId: true } } },
    orderBy: { createdAt: "desc" },
  });
  const plots = new Map<string, { id: string; label: string | null; farmer: string; riskStatus: string; lots: Set<string> }>();
  for (const l of s.lots) {
    for (const lp of l.lot.purchases) {
      const p = lp.purchase.plot;
      const e = plots.get(p.id) ?? { id: p.id, label: p.label, farmer: p.farmer.fullName, riskStatus: p.riskStatus, lots: new Set<string>() };
      e.lots.add(l.lot.code);
      plots.set(p.id, e);
    }
  }
  const blocked = [...plots.values()].filter((p) => p.riskStatus !== "PASS").length;
  const canWrite = can(ctx.role, "shipment:write");

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Lot tertaut" value={s.lots.length} />
        <Stat label="Total berat lot" value={fmtKg(totals.totalKg)} hint={`setara green bean ${fmtNum(totals.totalGreenKg, 0)} kg`} />
        <Stat label="Kebun asal" value={plots.size} />
        <Stat label="Kebun belum lolos" value={blocked} tone={blocked ? "warn" : "ok"} hint="memblokir paket bukti" />
      </div>
      <TableCard>
        <div className="flex items-center justify-between px-2 pb-3 pt-1">
          <h2 className="text-base font-bold">Lot</h2>
          {canWrite && <LinkLotsButton shipmentId={s.id} lots={available.map((l) => ({ id: l.id, code: l.code, weightKg: Number(l.weightKg), form: FORM_LABEL[l.productForm], inUse: l.shipments.length }))} />}
        </div>
        {s.lots.length === 0 ? (
          <Empty title="Belum ada lot" hint="Tautkan lot yang sudah dikunci agar asal kebun dapat ditelusuri (D15)." />
        ) : (
          <Table head={["Kode", "Bentuk", "Berat", "Pembelian", ""]}>
            {s.lots.map((l) => (
              <tr key={l.lotId} className="table-row">
                <td><Link href={`/lots/${l.lotId}`} className="font-bold hover:text-primary">{l.lot.code}</Link></td>
                <td><Tag>{FORM_LABEL[l.lot.productForm]}</Tag></td>
                <td className="font-semibold">{fmtKg(l.lot.weightKg)}</td>
                <td className="text-fg-2">{l.lot.purchases.length}</td>
                <td className="text-right">{canWrite && <UnlinkLotButton shipmentId={s.id} lotId={l.lotId} />}</td>
              </tr>
            ))}
          </Table>
        )}
      </TableCard>
      <Card title={`Daftar kebun asal (${plots.size})`}>
        {plots.size === 0 ? (
          <p className="text-sm text-muted">—</p>
        ) : (
          <div className="overflow-x-auto">
            <Table head={["Kebun", "Petani", "Lot", "Status risiko"]}>
              {[...plots.values()].map((p) => (
                <tr key={p.id} className="table-row">
                  <td><Link href={`/plots/${p.id}`} className="font-semibold hover:text-primary">{p.label ?? `Kebun ${p.id.slice(0, 6)}`}</Link></td>
                  <td className="text-fg-2">{p.farmer}</td>
                  <td className="text-fg-2">{[...p.lots].join(", ")}</td>
                  <td><RiskPill status={p.riskStatus as "PASS"} /></td>
                </tr>
              ))}
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}
