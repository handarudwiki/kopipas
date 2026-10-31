import type { Metadata } from "next";
import Link from "next/link";
import { AlertCircle, BadgeCheck, MapPinned, Package, ShieldAlert, Users } from "lucide-react";
import { getCtx } from "@/lib/auth/current";
import { can } from "@/lib/auth/rbac";
import { fmtDateTime, fmtKg, fmtNum } from "@/lib/format";
import { dashboardData } from "@/server/dashboard";
import { Card, Empty, PageHeader, Stat, Table, TableCard, Tag } from "@/components/ui";
import { ShipmentStatusPill } from "@/components/status";
import { RISK_COLORS } from "@/lib/risk-colors";

export const metadata: Metadata = { title: "Dasbor" };

function Progress({ label, value, target, unit = "" }: { label: string; value: number; target: number; unit?: string }) {
  const pct = Math.min(100, Math.round((value / target) * 100));
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-semibold text-fg">{label}</span>
        <span className="tabular-nums text-fg-2"><b className="text-fg">{fmtNum(value)}</b> / {fmtNum(target)}{unit}</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-neutral-soft">
        <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(pct, 2)}%` }} />
      </div>
    </div>
  );
}

const RISK_LABEL: [string, string][] = [["PASS", "Lolos"], ["REVIEW", "Perlu verifikasi"], ["RISK", "Berisiko"], ["ERROR", "Tidak bisa dicek"], ["PENDING", "Menunggu"]];

export default async function DashboardPage() {
  const ctx = await getCtx();
  const d = await dashboardData(ctx);
  const r = ctx.role;
  const toVerify = (d.risk.REVIEW ?? 0) + (d.risk.RISK ?? 0) + (d.risk.ERROR ?? 0);

  return (
    <>
      <PageHeader title={`Halo, ${ctx.name.split(" ")[0]}`} subtitle="Ringkasan kesiapan paket bukti EUDR organisasi Anda" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Kebun terpetakan" value={fmtNum(d.plots)} hint={`${d.farmers} petani`} icon={<MapPinned className="size-5" />} tone="primary" />
        <Stat label="Perlu verifikasi" value={toVerify} hint="kebun memblokir paket" icon={<ShieldAlert className="size-5" />} tone={toVerify ? "warn" : "ok"} />
        <Stat label="ERROR dokumen terbuka" value={d.open.ERROR ?? 0} hint={`${d.open.WARNING ?? 0} warning`} icon={<AlertCircle className="size-5" />} tone={d.open.ERROR ? "err" : "ok"} />
        <Stat label="Paket bukti" value={d.packs} hint={`${d.shipmentsWithPack} pengiriman`} icon={<BadgeCheck className="size-5" />} tone="ok" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card title="Target pilot MVP">
          <div className="space-y-5">
            <Progress label="Kebun dengan geolokasi 6 desimal" value={d.plots} target={500} />
            <Progress label="Pengiriman dengan paket bukti" value={d.shipmentsWithPack} target={10} />
            <Progress label="Paket dibuka importir" value={d.packsAccessedByImporter} target={10} />
          </div>
          <p className="mt-5 text-xs text-muted">Target BRD: ≥ 500 kebun, ≥ 10 pengiriman pilot dengan paket bukti diterima importir.</p>
        </Card>

        <Card title="Status risiko kebun">
          {d.plots === 0 ? (
            <Empty title="Belum ada kebun" />
          ) : (
            <>
              <div className="flex h-3 overflow-hidden rounded-full">
                {RISK_LABEL.map(([k]) => (d.risk[k] ? <div key={k} style={{ width: `${(d.risk[k]! / d.plots) * 100}%`, background: RISK_COLORS[k] }} /> : null))}
              </div>
              <ul className="mt-4 space-y-2 text-sm">
                {RISK_LABEL.map(([k, l]) => (
                  <li key={k} className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-fg-2"><span className="size-2.5 rounded-full" style={{ background: RISK_COLORS[k] }} />{l}</span>
                    <Link href={`/plots?risk=${k}`} className="font-semibold tabular-nums hover:text-primary">{d.risk[k] ?? 0}</Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>

        <Card title="Pengiriman">
          <ul className="space-y-3 text-sm">
            <li className="flex justify-between"><span className="text-fg-2">Draf</span><b>{d.ship.DRAFT ?? 0}</b></li>
            <li className="flex justify-between"><span className="text-fg-2">Perlu perbaikan</span><b>{d.ship.CHECKING ?? 0}</b></li>
            <li className="flex justify-between"><span className="text-fg-2">Siap</span><b>{d.ship.READY ?? 0}</b></li>
          </ul>
          <div className="mt-5 border-t border-line pt-4 text-sm">
            <p className="flex justify-between"><span className="text-fg-2">Pembelian tercatat</span><b>{d.purchasesCount}</b></p>
            <p className="mt-2 flex justify-between"><span className="text-fg-2">Total berat dibeli</span><b>{fmtKg(d.purchasesKg)}</b></p>
          </div>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        {can(r, "shipment:read") && (
          <TableCard>
            <div className="flex items-center justify-between px-2 pb-3 pt-1">
              <h2 className="flex items-center gap-2 text-base font-bold"><Package className="size-4 text-muted" /> Pengiriman terbaru</h2>
              <Link href="/shipments" className="text-sm font-semibold text-primary">Lihat semua</Link>
            </div>
            {d.recentShipments.length === 0 ? (
              <Empty title="Belum ada pengiriman" />
            ) : (
              <Table head={["Referensi", "Pembeli", "ERROR", "Status"]}>
                {d.recentShipments.map((s) => (
                  <tr key={s.id} className="table-row">
                    <td><Link href={`/shipments/${s.id}`} className="font-bold hover:text-primary">{s.reference}</Link></td>
                    <td className="text-fg-2">{s.buyerName}</td>
                    <td>{s.findings.length ? <Tag tone="err">{s.findings.length}</Tag> : <span className="text-muted">0</span>}</td>
                    <td><ShipmentStatusPill status={s.status} /></td>
                  </tr>
                ))}
              </Table>
            )}
          </TableCard>
        )}
        {can(r, "audit:read") && (
          <Card title="Aktivitas terbaru" actions={<Link href="/settings/audit" className="text-sm font-semibold text-primary">Audit log</Link>}>
            <ul className="space-y-3">
              {d.recentLogs.map((l) => (
                <li key={l.id} className="flex gap-3 text-sm">
                  <Users className="mt-0.5 size-4 shrink-0 text-muted" />
                  <div className="min-w-0">
                    <p className="truncate text-fg"><b>{l.actorName ?? (l.action === "ACCESS" ? "Importir (tautan)" : "Sistem")}</b> · {l.action.toLowerCase()} {l.entity}</p>
                    <p className="text-xs text-muted">{fmtDateTime(l.createdAt)}</p>
                  </div>
                </li>
              ))}
              {!d.recentLogs.length && <li className="text-sm text-muted">Belum ada aktivitas.</li>}
            </ul>
          </Card>
        )}
      </div>
    </>
  );
}
