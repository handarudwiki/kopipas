import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { getCtxWith } from "@/lib/auth/current";
import { orNotFound } from "@/lib/page";
import { can } from "@/lib/auth/rbac";
import { fmtDate, fmtDateTime, fmtHa, fmtKg } from "@/lib/format";
import { getFarmer } from "@/server/farmers";
import { Card, Empty, KV, PageHeader, Table, TableCard, Tag } from "@/components/ui";
import { FORM_LABEL, RiskPill } from "@/components/status";
import { EditFarmerButton } from "../farmers-client";

export const metadata: Metadata = { title: "Detail petani" };

const EVIDENCE_LABEL = { SHM: "SHM", SKT: "SKT", SKD: "Surat ket. desa", OTHER: "Lainnya", NONE: "Belum ada" } as const;

export default async function FarmerPage({ params }: PageProps<"/farmers/[id]">) {
  const ctx = await getCtxWith("farmer:read");
  const { id } = await params;
  const f = await orNotFound(getFarmer(ctx, id));
  const canWrite = can(ctx.role, "plot:write");
  return (
    <>
      <PageHeader
        back={{ href: "/farmers", label: "Petani" }}
        title={f.fullName}
        subtitle={`${f.village}, ${f.district}, ${f.regency}, ${f.province}`}
        actions={
          <>
            {can(ctx.role, "farmer:write") && <EditFarmerButton farmer={{ id: f.id, fullName: f.fullName, village: f.village, district: f.district, regency: f.regency, province: f.province, phone: f.phone }} />}
            {canWrite && <Link href={`/plots/new?farmerId=${f.id}`} className="btn-primary"><Plus className="size-4" /> Tambah kebun</Link>}
          </>
        }
      />
      <div className="grid gap-6 xl:grid-cols-3">
        <Card title="Data petani">
          <KV items={[["Kontak", f.phone], ["Terdaftar", fmtDate(f.createdAt)], ["Persetujuan", fmtDateTime(f.consentAt)], ["Lingkup persetujuan", f.consentScope]]} />
        </Card>
        <TableCard className="xl:col-span-2">
          <h2 className="px-2 pb-3 pt-1 text-base font-bold">Kebun ({f.plots.length})</h2>
          {f.plots.length === 0 ? (
            <Empty title="Belum ada kebun" hint="Petakan kebun sebagai titik (≤ 4 ha) atau poligon." />
          ) : (
            <Table head={["Kebun", "Geometri", "Luas dinyatakan / terhitung", "Legalitas", "Risiko"]}>
              {f.plots.map((p) => (
                <tr key={p.id} className="table-row">
                  <td><Link href={`/plots/${p.id}`} className="font-bold text-fg hover:text-primary">{p.label ?? `Kebun ${p.id.slice(0, 6)}`}</Link></td>
                  <td>{p.geomPolygon ? <Tag tone="primary">Poligon</Tag> : <Tag>Titik</Tag>}</td>
                  <td className="text-fg-2">{fmtHa(p.declaredAreaHa)}{p.computedAreaHa ? ` / ${fmtHa(p.computedAreaHa)}` : ""}</td>
                  <td>{p.evidence.length ? p.evidence.map((e) => <Tag key={e.id} tone={e.type === "NONE" ? "warn" : "ok"}>{EVIDENCE_LABEL[e.type]}</Tag>) : <Tag tone="warn">Belum dicatat</Tag>}</td>
                  <td><RiskPill status={p.riskStatus} /></td>
                </tr>
              ))}
            </Table>
          )}
        </TableCard>
      </div>
      {f.purchases.length > 0 && (
        <TableCard className="mt-6">
          <h2 className="px-2 pb-3 pt-1 text-base font-bold">Pembelian terakhir</h2>
          <Table head={["Tanggal", "Kebun", "Bentuk", "Berat"]}>
            {f.purchases.map((p) => (
              <tr key={p.id} className="table-row">
                <td>{fmtDate(p.date)}</td>
                <td className="text-fg-2">{p.plot.label ?? "—"}</td>
                <td>{FORM_LABEL[p.form]}</td>
                <td>{fmtKg(p.weightKg)}</td>
              </tr>
            ))}
          </Table>
        </TableCard>
      )}
    </>
  );
}
