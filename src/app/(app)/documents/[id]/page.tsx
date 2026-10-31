import type { Metadata } from "next";
import { getCtxWith } from "@/lib/auth/current";
import { can } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db";
import { fmtDateTime } from "@/lib/format";
import { DOC_SCHEMAS, DOC_TYPE_LABEL } from "@/lib/docs/schemas";
import { getDocumentFields } from "@/server/documents";
import { Card, PageHeader, Table, TableCard } from "@/components/ui";
import { ExtractionPill } from "@/components/status";
import { FieldEditor } from "./field-editor";

export const metadata: Metadata = { title: "Tinjau dokumen" };

export default async function DocumentPage({ params }: PageProps<"/documents/[id]">) {
  const ctx = await getCtxWith("shipment:read");
  const { id } = await params;
  const { document: d, fields, history } = await getDocumentFields(ctx, id);
  const shipment = await prisma.shipment.findFirstOrThrow({ where: { id: d.shipmentId, orgId: ctx.orgId }, select: { id: true, reference: true } });
  const labels = Object.fromEntries(DOC_SCHEMAS[d.type].map((f) => [f.name, f.label]));
  const userIds = [...new Set([...fields, ...history].map((f) => f.correctedBy).filter(Boolean))] as string[];
  const users = new Map((await prisma.user.findMany({ where: { id: { in: userIds }, orgId: ctx.orgId }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const isImage = d.mimeType.startsWith("image/");

  return (
    <>
      <PageHeader
        back={{ href: `/shipments/${shipment.id}?tab=documents`, label: shipment.reference }}
        title={DOC_TYPE_LABEL[d.type]}
        subtitle={<span className="flex flex-wrap items-center gap-2">{d.fileName} · versi {d.version} · <ExtractionPill status={d.extractionStatus} /></span>}
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <Card title="Pratinjau" className="xl:sticky xl:top-24 xl:self-start">
          {isImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/v1/documents/${d.id}/file`} alt={d.fileName} className="w-full rounded-xl border border-line" />
          ) : (
            <iframe src={`/api/v1/documents/${d.id}/file`} title={d.fileName} className="h-[70vh] w-full rounded-xl border border-line bg-white" />
          )}
        </Card>
        <div className="space-y-6">
          <FieldEditor
            documentId={d.id}
            canEdit={can(ctx.role, "shipment:write")}
            needsManual={d.extractionStatus === "NEEDS_REVIEW"}
            fields={fields.map((f) => ({
              id: f.id, name: f.name, label: labels[f.name] ?? f.name, value: f.value, confidence: Number(f.confidence),
              page: f.page, version: f.version, correctedBy: f.correctedBy ? users.get(f.correctedBy) ?? "pengguna" : null,
            }))}
          />
          {history.length > 0 && (
            <TableCard>
              <h2 className="px-2 pb-3 pt-1 text-base font-bold">Riwayat versi field</h2>
              <Table head={["Field", "Nilai lama", "Versi", "Keyakinan", "Waktu"]}>
                {history.map((h) => (
                  <tr key={h.id} className="table-row">
                    <td className="font-medium">{labels[h.name] ?? h.name}</td>
                    <td className="max-w-[260px] break-words text-fg-2">{h.value ?? "—"}</td>
                    <td>v{h.version}</td>
                    <td>{Math.round(Number(h.confidence) * 100)}%</td>
                    <td className="whitespace-nowrap text-fg-2">{fmtDateTime(h.updatedAt)}</td>
                  </tr>
                ))}
              </Table>
            </TableCard>
          )}
        </div>
      </div>
    </>
  );
}
