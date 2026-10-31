import type { Metadata } from "next";
import { getCtxWith } from "@/lib/auth/current";
import { ROLE_LABEL } from "@/lib/auth/rbac";
import { fmtDate } from "@/lib/format";
import { listUsers } from "@/server/org";
import { PageHeader, Pill, Table, TableCard } from "@/components/ui";
import { InviteButton, UserRowActions } from "./users-client";

export const metadata: Metadata = { title: "Pengguna & Peran" };

export default async function UsersPage() {
  const ctx = await getCtxWith("user:manage");
  const users = await listUsers(ctx);
  return (
    <>
      <PageHeader title="Pengguna & Peran" subtitle="Undang anggota tim dan atur peran akses organisasi" actions={<InviteButton />} />
      <TableCard>
        <Table head={["Nama", "Email", "Peran", "Status", "Dibuat", ""]}>
          {users.map((u) => (
            <tr key={u.id} className="table-row">
              <td className="font-semibold text-fg">{u.name}{u.id === ctx.userId && <span className="ml-2 text-xs font-normal text-muted">(Anda)</span>}</td>
              <td className="text-fg-2">{u.email}</td>
              <td className="text-fg-2">{ROLE_LABEL[u.role]}</td>
              <td>
                {!u.isActive ? <Pill tone="neutral">Nonaktif</Pill> : u.status === "INVITED" ? <Pill tone="warn">Diundang</Pill> : <Pill tone="ok">Aktif</Pill>}
              </td>
              <td className="text-fg-2">{fmtDate(u.createdAt)}</td>
              <td className="text-right">
                {u.id !== ctx.userId && <UserRowActions user={{ id: u.id, name: u.name, email: u.email, role: u.role, isActive: u.isActive, invited: u.status === "INVITED" }} />}
              </td>
            </tr>
          ))}
        </Table>
      </TableCard>
    </>
  );
}
