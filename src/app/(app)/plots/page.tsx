import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { getCtxWith } from "@/lib/auth/current";
import { can } from "@/lib/auth/rbac";
import { fmtHa, fmtNum } from "@/lib/format";
import { listPlots } from "@/server/farmers";
import { Empty, PageHeader, Table, TableCard, TabLinks, Tag } from "@/components/ui";
import { RiskPill } from "@/components/status";

export const metadata: Metadata = { title: "Kebun" };

export default async function PlotsPage({ searchParams }: PageProps<"/plots">) {
  const ctx = await getCtxWith("plot:read");
  const sp = await searchParams;
  const risk = typeof sp.risk === "string" ? sp.risk : undefined;
  const all = await listPlots(ctx);
  const plots = risk ? all.filter((p) => p.riskStatus === risk) : all;
  const count = (s: string) => all.filter((p) => p.riskStatus === s).length;
  return (
    <>
      <PageHeader
        title="Kebun"
        subtitle="Geolokasi kebun asal (6 desimal), luas, bukti legalitas, dan hasil cek deforestasi"
        actions={can(ctx.role, "plot:write") && <Link href="/plots/new" className="btn-primary"><Plus className="size-4" /> Petakan kebun</Link>}
      />
      <TabLinks
        active={risk ?? "all"}
        tabs={[
          { key: "all", href: "/plots", label: "Semua", count: all.length },
          { key: "PASS", href: "/plots?risk=PASS", label: "Lolos", count: count("PASS") },
          { key: "REVIEW", href: "/plots?risk=REVIEW", label: "Perlu verifikasi", count: count("REVIEW") },
          { key: "RISK", href: "/plots?risk=RISK", label: "Berisiko", count: count("RISK") },
          { key: "ERROR", href: "/plots?risk=ERROR", label: "Tidak bisa dicek", count: count("ERROR") },
        ]}
      />
      <TableCard>
        {plots.length === 0 ? (
          <Empty title="Tidak ada kebun" />
        ) : (
          <Table head={["Kebun", "Petani", "Geometri", "Luas", "Hutan 2020", "Legalitas", "Status"]}>
            {plots.map((p) => {
              const ev = p.evidence.filter((e) => e.type !== "NONE");
              const pt = (p.geomPoint as { coordinates?: number[] } | null)?.coordinates;
              return (
                <tr key={p.id} className="table-row">
                  <td>
                    <Link href={`/plots/${p.id}`} className="font-bold text-fg hover:text-primary">{p.label ?? `Kebun ${p.id.slice(0, 6)}`}</Link>
                    {pt && <span className="block font-mono text-[11px] text-muted">{pt[1]!.toFixed(6)}, {pt[0]!.toFixed(6)}</span>}
                  </td>
                  <td className="text-fg-2">{p.farmer.fullName}<span className="block text-xs text-muted">{p.farmer.village}</span></td>
                  <td>{p.geomPolygon ? <Tag tone="primary">Poligon</Tag> : <Tag>Titik</Tag>}</td>
                  <td className="whitespace-nowrap text-fg-2">{fmtHa(p.computedAreaHa ?? p.declaredAreaHa)}</td>
                  <td className="text-fg-2">{p.riskChecks[0]?.forestPct2020 != null ? `${fmtNum(p.riskChecks[0].forestPct2020, 1)}%` : "—"}</td>
                  <td>{ev.length ? <Tag tone="ok">{ev.length} bukti</Tag> : <Tag tone="warn">Tidak ada</Tag>}</td>
                  <td><RiskPill status={p.riskStatus} /></td>
                </tr>
              );
            })}
          </Table>
        )}
      </TableCard>
    </>
  );
}
