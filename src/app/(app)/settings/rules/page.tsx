import type { Metadata } from "next";
import { getCtxWith } from "@/lib/auth/current";
import { loadRuleSet } from "@/lib/rules/engine";
import { PageHeader, Table, TableCard, Tag } from "@/components/ui";
import { SeverityPill } from "@/components/status";

export const metadata: Metadata = { title: "Pustaka Aturan" };

export default async function RulesPage() {
  await getCtxWith("rules:read");
  const rules = loadRuleSet();
  return (
    <>
      <PageHeader
        title="Pustaka Aturan"
        subtitle={<>Aturan deterministik yang dapat diaudit, disimpan sebagai data berversi di <code className="rounded bg-surface-2 px-1">rules/document-rules.yaml</code> · versi <b>{rules.version}</b></>}
      />
      <TableCard>
        <Table head={["ID", "Aturan", "Tingkat", "Berlaku", "Pemeriksaan", "Saran perbaikan"]}>
          {rules.rules.map((r) => (
            <tr key={r.id} className="table-row">
              <td className="font-mono font-bold">{r.id}</td>
              <td className="max-w-[340px] text-fg">{r.title}</td>
              <td><SeverityPill severity={r.severity} /></td>
              <td><Tag tone={r.applies === "LC" ? "info" : "neutral"}>{r.applies === "LC" ? "L/C" : "Semua"}</Tag></td>
              <td className="font-mono text-xs text-fg-2">
                {r.check}
                {Object.keys(r.params).length > 0 && <span className="block max-w-[240px] truncate text-muted" title={JSON.stringify(r.params)}>{JSON.stringify(r.params)}</span>}
              </td>
              <td className="max-w-[340px] text-xs text-fg-2">{r.suggestion}</td>
            </tr>
          ))}
        </Table>
      </TableCard>
    </>
  );
}
