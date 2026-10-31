import type { Metadata } from "next";
import Link from "next/link";
import { getCtxWith } from "@/lib/auth/current";
import { can } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db";
import { fmtDateTime, fmtHa, fmtNum } from "@/lib/format";
import { activeDataset } from "@/server/risk";
import { Alert, Empty, PageHeader, Stat, Table, TableCard } from "@/components/ui";
import { RiskPill } from "@/components/status";
import { RecheckAllButton } from "./risk-page-client";

export const metadata: Metadata = { title: "Cek Risiko" };

type Reason = { ruleId?: string; message?: string };

export default async function RiskPage() {
  const ctx = await getCtxWith("plot:read");
  const [plots, forest, area] = await Promise.all([
    prisma.plot.findMany({
      where: { orgId: ctx.orgId },
      include: { farmer: { select: { fullName: true, village: true } }, riskChecks: { orderBy: { createdAt: "desc" }, take: 1 } },
      orderBy: { updatedAt: "desc" },
    }),
    activeDataset("FOREST_COVER_2020"),
    activeDataset("FOREST_AREA"),
  ]);
  const count = (s: string) => plots.filter((p) => p.riskStatus === s).length;
  const queue = plots.filter((p) => ["REVIEW", "RISK", "ERROR", "PENDING"].includes(p.riskStatus));

  return (
    <>
      <PageHeader
        title="Cek Risiko Deforestasi"
        subtitle="Setiap kebun diperiksa terhadap peta tutupan hutan 31 Des 2020; kebun PERLU VERIFIKASI / BERISIKO memblokir paket bukti sampai admin memutuskan"
        actions={can(ctx.role, "settings:manage") && <RecheckAllButton />}
      />
      {!forest && <div className="mb-6"><Alert tone="warn" title="Dataset tutupan hutan 2020 belum dimuat">Semua kebun akan berstatus PERLU VERIFIKASI sampai super admin memuat dataset.</Alert></div>}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Lolos" value={count("PASS")} tone="ok" />
        <Stat label="Perlu verifikasi" value={count("REVIEW")} tone="warn" />
        <Stat label="Berisiko" value={count("RISK")} tone="err" />
        <Stat label="Tidak bisa dicek" value={count("ERROR")} tone="danger" hint={`Dataset: ${forest?.version ?? "—"}${area ? ` · kawasan ${area.version}` : ""}`} />
      </div>
      <TableCard>
        <h2 className="px-2 pb-3 pt-1 text-base font-bold">Antrean verifikasi ({queue.length})</h2>
        {queue.length === 0 ? (
          <Empty title="Tidak ada kebun yang perlu ditindaklanjuti" />
        ) : (
          <Table head={["Kebun", "Petani", "Luas", "Hutan 2020", "Alasan", "Status", "Dicek"]}>
            {queue.map((p) => {
              const c = p.riskChecks[0];
              return (
                <tr key={p.id} className="table-row">
                  <td><Link href={`/plots/${p.id}`} className="font-bold text-fg hover:text-primary">{p.label ?? `Kebun ${p.id.slice(0, 6)}`}</Link></td>
                  <td className="text-fg-2">{p.farmer.fullName}<span className="block text-xs text-muted">{p.farmer.village}</span></td>
                  <td className="whitespace-nowrap text-fg-2">{fmtHa(p.computedAreaHa ?? p.declaredAreaHa)}</td>
                  <td>{c?.forestPct2020 != null ? `${fmtNum(c.forestPct2020, 1)}%` : "—"}</td>
                  <td className="max-w-[320px] text-xs text-fg-2">{((c?.reasons as Reason[]) ?? []).filter((r) => r.ruleId && r.ruleId !== "R01").map((r) => `${r.ruleId}: ${r.message}`).join(" ")}</td>
                  <td><RiskPill status={p.riskStatus} /></td>
                  <td className="whitespace-nowrap text-xs text-muted">{c ? fmtDateTime(c.createdAt) : "—"}</td>
                </tr>
              );
            })}
          </Table>
        )}
      </TableCard>
    </>
  );
}
