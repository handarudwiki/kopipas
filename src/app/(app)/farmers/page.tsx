import type { Metadata } from "next";
import Link from "next/link";
import { getCtxWith } from "@/lib/auth/current";
import { can } from "@/lib/auth/rbac";
import { fmtDate, fmtHa, num } from "@/lib/format";
import { listFarmers } from "@/server/farmers";
import { Empty, PageHeader, Table, TableCard, Tag } from "@/components/ui";
import { NewFarmerButton } from "./farmers-client";

export const metadata: Metadata = { title: "Petani" };

export default async function FarmersPage({ searchParams }: PageProps<"/farmers">) {
  const ctx = await getCtxWith("farmer:read");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : undefined;
  const farmers = await listFarmers(ctx, { search: q });
  return (
    <>
      <PageHeader title="Petani" subtitle="Petani pemasok, persetujuan berbagi data, dan kebun terdaftar" actions={can(ctx.role, "farmer:write") && <NewFarmerButton />} />
      <form className="mb-5 flex gap-2">
        <input name="q" defaultValue={q} placeholder="Cari nama atau desa…" className="input max-w-sm" />
        <button className="btn-secondary">Cari</button>
      </form>
      <TableCard>
        {farmers.length === 0 ? (
          <Empty title="Belum ada petani" hint="Daftarkan petani lewat web atau aplikasi lapangan." />
        ) : (
          <Table head={["Petani", "Lokasi", "Kontak", "Kebun", "Total luas", "Status kebun", "Persetujuan"]}>
            {farmers.map((f) => {
              const risky = f.plots.filter((p) => p.riskStatus !== "PASS").length;
              const area = f.plots.reduce((a, p) => a + num(p.computedAreaHa ?? p.declaredAreaHa), 0);
              return (
                <tr key={f.id} className="table-row">
                  <td><Link href={`/farmers/${f.id}`} className="font-bold text-fg hover:text-primary">{f.fullName}</Link></td>
                  <td className="text-fg-2">{f.village}, {f.district}<span className="block text-xs text-muted">{f.regency}, {f.province}</span></td>
                  <td className="text-fg-2">{f.phone ?? "—"}</td>
                  <td>{f.plots.length}</td>
                  <td className="text-fg-2">{f.plots.length ? fmtHa(area) : "—"}</td>
                  <td>{!f.plots.length ? <span className="text-muted">—</span> : risky ? <Tag tone="warn">{risky} perlu tindakan</Tag> : <Tag tone="ok">Semua lolos</Tag>}</td>
                  <td className="whitespace-nowrap text-fg-2">{fmtDate(f.consentAt)}</td>
                </tr>
              );
            })}
          </Table>
        )}
      </TableCard>
    </>
  );
}
