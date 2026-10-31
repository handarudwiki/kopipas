import type { Metadata } from "next";
import Link from "next/link";
import { getCtx } from "@/lib/auth/current";
import { can } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db";
import { fmtDateTime } from "@/lib/format";
import { Card, Empty, PageHeader } from "@/components/ui";
import { RiskPill, SeverityPill } from "@/components/status";

export const metadata: Metadata = { title: "Peringatan" };

export default async function AlertsPage() {
  const ctx = await getCtx();
  const [findings, plots] = await Promise.all([
    can(ctx.role, "shipment:read")
      ? prisma.finding.findMany({ where: { orgId: ctx.orgId, status: "OPEN", severity: "ERROR" }, include: { shipment: { select: { id: true, reference: true } } }, orderBy: { createdAt: "desc" }, take: 100 })
      : [],
    can(ctx.role, "plot:read")
      ? prisma.plot.findMany({ where: { orgId: ctx.orgId, riskStatus: { in: ["REVIEW", "RISK", "ERROR"] } }, include: { farmer: { select: { fullName: true } } }, orderBy: { updatedAt: "desc" }, take: 100 })
      : [],
  ]);
  return (
    <>
      <PageHeader title="Peringatan" subtitle="Hal yang memblokir status SIAP atau pembuatan paket bukti" />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card title={`ERROR dokumen terbuka (${findings.length})`}>
          {findings.length === 0 ? <Empty title="Tidak ada" /> : (
            <ul className="divide-y divide-line">
              {findings.map((f) => (
                <li key={f.id} className="py-3">
                  <div className="flex items-center gap-2"><SeverityPill severity={f.severity} /><span className="font-mono text-sm font-bold">{f.ruleId}</span><Link href={`/shipments/${f.shipment.id}?tab=findings`} className="text-sm font-semibold text-primary hover:underline">{f.shipment.reference}</Link></div>
                  <p className="mt-1 text-sm text-fg-2">{f.message}</p>
                  <p className="text-xs text-muted">{fmtDateTime(f.createdAt)}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title={`Kebun perlu tindakan (${plots.length})`}>
          {plots.length === 0 ? <Empty title="Tidak ada" /> : (
            <ul className="divide-y divide-line">
              {plots.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 py-3">
                  <Link href={`/plots/${p.id}`} className="font-semibold hover:text-primary">{p.label ?? `Kebun ${p.id.slice(0, 6)}`} <span className="font-normal text-muted">· {p.farmer.fullName}</span></Link>
                  <RiskPill status={p.riskStatus} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
