import type { Metadata } from "next";
import Link from "next/link";
import { getCtxWith } from "@/lib/auth/current";
import { fmtDateTime } from "@/lib/format";
import { listAuditLogs } from "@/server/org";
import { Empty, PageHeader, Pill, Table, TableCard } from "@/components/ui";

export const metadata: Metadata = { title: "Audit Log" };

const ACTION_TONE: Record<string, "ok" | "info" | "err" | "warn" | "neutral"> = {
  CREATE: "ok", UPDATE: "info", DELETE: "err", FORBIDDEN: "err", LOGIN_FAILED: "warn", LOGIN: "neutral",
};

function diffKeys(before: unknown, after: unknown): string[] {
  if (!before || !after || typeof before !== "object" || typeof after !== "object") return [];
  const b = before as Record<string, unknown>;
  const a = after as Record<string, unknown>;
  return Object.keys(a).filter((k) => k !== "updatedAt" && JSON.stringify(a[k]) !== JSON.stringify(b[k]));
}

export default async function AuditPage({ searchParams }: PageProps<"/settings/audit">) {
  const ctx = await getCtxWith("audit:read");
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const { items, nextCursor } = await listAuditLogs(ctx, {
    entity: str("entity"), entityId: str("entityId"), action: str("action"), cursor: str("cursor"), take: 50,
  });
  const qs = (extra: Record<string, string>) => {
    const p = new URLSearchParams(Object.entries({ entity: str("entity"), action: str("action"), entityId: str("entityId"), ...extra }).filter(([, v]) => v) as [string, string][]);
    return `?${p}`;
  };

  return (
    <>
      <PageHeader title="Audit Log" subtitle="Setiap perubahan data: siapa, kapan, nilai lama dan nilai baru (F1.3)" />
      <form className="mb-5 flex flex-wrap gap-2">
        <input name="entity" defaultValue={str("entity")} placeholder="Entitas (mis. plot)" className="input max-w-[200px]" />
        <select name="action" defaultValue={str("action") ?? ""} className="input max-w-[180px]">
          <option value="">Semua aksi</option>
          {["CREATE", "UPDATE", "DELETE", "FORBIDDEN", "LOGIN", "LOGIN_FAILED", "ACCESS", "SYNC_CONFLICT"].map((a) => <option key={a}>{a}</option>)}
        </select>
        <button className="btn-secondary">Filter</button>
      </form>
      <TableCard>
        {items.length === 0 ? (
          <Empty title="Belum ada catatan" />
        ) : (
          <Table head={["Waktu", "Pelaku", "Aksi", "Entitas", "Perubahan"]}>
            {items.map((l) => {
              const keys = diffKeys(l.before, l.after);
              return (
                <tr key={l.id} className="table-row">
                  <td className="whitespace-nowrap text-fg-2">{fmtDateTime(l.createdAt)}</td>
                  <td className="text-fg">{l.actorName ?? <span className="text-muted">sistem / tamu</span>}</td>
                  <td><Pill tone={ACTION_TONE[l.action] ?? "neutral"}>{l.action}</Pill></td>
                  <td>
                    <Link href={qs({ entity: l.entity, entityId: l.entityId ?? "" })} className="font-semibold text-fg hover:text-primary">{l.entity}</Link>
                    {l.entityId && <span className="block font-mono text-[11px] text-muted">{l.entityId.slice(0, 8)}</span>}
                  </td>
                  <td className="max-w-[460px]">
                    <details>
                      <summary className="cursor-pointer text-xs text-fg-2">
                        {keys.length ? `Field: ${keys.slice(0, 6).join(", ")}${keys.length > 6 ? "…" : ""}` : l.meta ? JSON.stringify(l.meta).slice(0, 80) : "lihat detail"}
                      </summary>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        <pre className="max-h-60 overflow-auto rounded-lg bg-surface-2 p-2 text-[11px]">{JSON.stringify(l.before, null, 1) ?? "—"}</pre>
                        <pre className="max-h-60 overflow-auto rounded-lg bg-surface-2 p-2 text-[11px]">{JSON.stringify(l.after ?? l.meta, null, 1) ?? "—"}</pre>
                      </div>
                    </details>
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
      </TableCard>
      {nextCursor && (
        <div className="mt-4 text-right">
          <Link href={qs({ cursor: nextCursor })} className="btn-secondary">Berikutnya →</Link>
        </div>
      )}
    </>
  );
}
