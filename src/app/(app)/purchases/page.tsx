import type { Metadata } from "next";
import Link from "next/link";
import { getCtxWith } from "@/lib/auth/current";
import { can } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db";
import { fmtDate, fmtKg, num } from "@/lib/format";
import { listPurchases } from "@/server/lots";
import { Empty, PageHeader, Stat, Table, TableCard, Tag } from "@/components/ui";
import { FORM_LABEL, RiskPill } from "@/components/status";
import { DeletePurchaseButton, NewPurchaseButton } from "./purchases-client";

export const metadata: Metadata = { title: "Pembelian" };

export default async function PurchasesPage() {
  const ctx = await getCtxWith("purchase:read");
  const [purchases, farmers] = await Promise.all([
    listPurchases(ctx),
    prisma.farmer.findMany({ where: { orgId: ctx.orgId }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true, plots: { select: { id: true, label: true } } } }),
  ]);
  const canWrite = can(ctx.role, "purchase:write");
  const sum = (f: string) => purchases.filter((p) => p.form === f).reduce((a, p) => a + num(p.weightKg), 0);
  const unassigned = purchases.filter((p) => !p.lots.length).length;

  return (
    <>
      <PageHeader title="Pembelian" subtitle="Pembelian ceri, gabah, dan green bean dari petani — setiap pembelian menunjuk kebun terdaftar (F4.1)" actions={canWrite && <NewPurchaseButton farmers={farmers} />} />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Ceri" value={fmtKg(sum("CHERRY"))} />
        <Stat label="Gabah" value={fmtKg(sum("PARCHMENT"))} />
        <Stat label="Green bean" value={fmtKg(sum("GREEN"))} />
        <Stat label="Belum masuk lot" value={unassigned} tone="warn" />
      </div>
      <TableCard>
        {purchases.length === 0 ? (
          <Empty title="Belum ada pembelian" hint="Catat pembelian lewat web atau aplikasi lapangan." />
        ) : (
          <Table head={["Tanggal", "Petani", "Kebun", "Bentuk", "Berat", "Lot", ""]}>
            {purchases.map((p) => (
              <tr key={p.id} className="table-row">
                <td className="whitespace-nowrap">{fmtDate(p.date)}</td>
                <td><Link href={`/farmers/${p.farmer.id}`} className="font-semibold text-fg hover:text-primary">{p.farmer.fullName}</Link></td>
                <td className="text-fg-2"><Link href={`/plots/${p.plot.id}`} className="hover:text-primary">{p.plot.label ?? "Kebun"}</Link> <span className="ml-1 inline-block align-middle"><RiskPill status={p.plot.riskStatus} /></span></td>
                <td><Tag>{FORM_LABEL[p.form]}</Tag></td>
                <td className="font-semibold">{fmtKg(p.weightKg)}</td>
                <td>{p.lots[0] ? <Link href={`/lots/${p.lots[0].lot.id}`} className="font-semibold text-primary hover:underline">{p.lots[0].lot.code}</Link> : <span className="text-muted">—</span>}</td>
                <td className="text-right">{canWrite && !p.lots.length && <DeletePurchaseButton id={p.id} />}</td>
              </tr>
            ))}
          </Table>
        )}
      </TableCard>
    </>
  );
}
