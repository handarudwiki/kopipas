import type { Metadata } from "next";
import { getCtxWith } from "@/lib/auth/current";
import { fmtDate } from "@/lib/format";
import { listTenants } from "@/server/tenants";
import { PageHeader, Table, TableCard } from "@/components/ui";
import { NewTenantButton } from "./tenants-client";

export const metadata: Metadata = { title: "Tenant" };

export default async function TenantsPage() {
  await getCtxWith("tenant:manage");
  const tenants = await listTenants();
  return (
    <>
      <PageHeader title="Tenant" subtitle="Organisasi eksportir pilot. Setiap tenant terisolasi penuh (N5)." actions={<NewTenantButton />} />
      <TableCard>
        <Table head={["Organisasi", "NPWP", "Pengguna", "Petani", "Kebun", "Pengiriman", "Dibuat"]}>
          {tenants.map((t) => (
            <tr key={t.id} className="table-row">
              <td className="font-semibold">{t.name}<span className="block text-xs text-muted">{t.address ?? "—"}</span></td>
              <td className="text-fg-2">{t.npwp ?? "—"}</td>
              <td>{t._count.users}</td>
              <td>{t._count.farmers}</td>
              <td>{t.plotCount}</td>
              <td>{t._count.shipments}</td>
              <td className="whitespace-nowrap text-fg-2">{fmtDate(t.createdAt)}</td>
            </tr>
          ))}
        </Table>
      </TableCard>
    </>
  );
}
