import type { Metadata } from "next";
import Link from "next/link";
import { FileText } from "lucide-react";
import { getCtxWith } from "@/lib/auth/current";
import { orNotFound } from "@/lib/page";
import { can } from "@/lib/auth/rbac";
import { fmtDate, fmtDateTime, fmtKg } from "@/lib/format";
import { DOC_TYPE_LABEL, REVIEW_CONFIDENCE } from "@/lib/docs/schemas";
import type { Ref } from "@/lib/rules/types";
import { getShipmentDetail } from "@/server/shipments";
import { Alert, Card, Empty, KV, PageHeader, Table, TableCard, TabLinks, Tag } from "@/components/ui";
import { ExtractionPill, FindingStatusPill, PAYMENT_LABEL, SeverityPill, ShipmentStatusPill } from "@/components/status";
import { DeleteDocButton, DocTypeSelect, EditShipmentButton, FindingActions, UploadDocuments, ValidateButton } from "./shipment-client";
import { ShipmentExtraTabs, extraTabs } from "./tabs-extra";

export const metadata: Metadata = { title: "Detail pengiriman" };

export default async function ShipmentPage({ params, searchParams }: PageProps<"/shipments/[id]">) {
  const ctx = await getCtxWith("shipment:read");
  const { id } = await params;
  const sp = await searchParams;
  const tab = typeof sp.tab === "string" ? sp.tab : "overview";
  const s = await orNotFound(getShipmentDetail(ctx, id));
  const canWrite = can(ctx.role, "shipment:write");
  const openFindings = s.findings.filter((f) => f.status === "OPEN");
  const openErrors = openFindings.filter((f) => f.severity === "ERROR").length;
  const docTypeById = new Map(s.documents.map((d) => [d.id, d.type]));
  const pendingDocs = s.documents.filter((d) => d.extractionStatus === "PENDING").length;

  const tabs = [
    { key: "overview", href: `?tab=overview`, label: "Ringkasan" },
    { key: "documents", href: `?tab=documents`, label: "Dokumen", count: s.documents.length },
    { key: "findings", href: `?tab=findings`, label: "Temuan", count: openFindings.length },
    ...extraTabs(s),
  ];

  return (
    <>
      <PageHeader
        back={{ href: "/shipments", label: "Pengiriman" }}
        title={<span className="flex flex-wrap items-center gap-3">{s.reference} <ShipmentStatusPill status={s.status} /></span>}
        subtitle={`${s.buyerName} (${s.buyerCountry}) · ${s.portLoading} → ${s.portDischarge} · ${PAYMENT_LABEL[s.paymentMethod]}`}
        actions={
          <>
            <a href={`/api/v1/shipments/${s.id}/report`} target="_blank" className="btn-secondary"><FileText className="size-4" /> Laporan PDF</a>
            {canWrite && (
              <EditShipmentButton
                shipment={{
                  id: s.id, reference: s.reference, buyerName: s.buyerName, buyerAddress: s.buyerAddress, buyerCountry: s.buyerCountry,
                  portLoading: s.portLoading, portDischarge: s.portDischarge, hsCode: s.hsCode, productDescription: s.productDescription,
                  paymentMethod: s.paymentMethod, netWeightKg: s.netWeightKg?.toString() ?? null,
                  presentationDate: s.presentationDate?.toISOString().slice(0, 10) ?? null,
                }}
              />
            )}
            {canWrite && <ValidateButton shipmentId={s.id} disabled={!s.documents.length || pendingDocs > 0} />}
          </>
        }
      />
      <TabLinks tabs={tabs} active={tab} />

      {tab === "overview" && (
        <div className="grid gap-6 xl:grid-cols-3">
          <Card title="Data pengiriman" className="xl:col-span-2">
            <KV items={[
              ["Referensi", s.reference], ["Metode pembayaran", PAYMENT_LABEL[s.paymentMethod]],
              ["Pembeli", s.buyerName], ["Negara pembeli", s.buyerCountry],
              ["Alamat pembeli", s.buyerAddress], ["HS code", s.hsCode],
              ["Pelabuhan muat", s.portLoading], ["Pelabuhan bongkar", s.portDischarge],
              ["Deskripsi produk", s.productDescription], ["Berat bersih", s.netWeightKg ? fmtKg(s.netWeightKg) : "dari dokumen"],
              ["Tanggal presentasi", s.presentationDate ? fmtDate(s.presentationDate) : "hari ini (default)"], ["Validasi terakhir", s.lastValidatedAt ? `${fmtDateTime(s.lastValidatedAt)} · ${s.rulesVersion}` : "belum divalidasi"],
            ]} />
          </Card>
          <Card title="Kesiapan">
            <ul className="space-y-3 text-sm">
              <Check ok={s.documents.length > 0} label={`${s.documents.length} dokumen diunggah`} />
              <Check ok={pendingDocs === 0 && s.documents.length > 0} label={pendingDocs ? `${pendingDocs} dokumen sedang diekstraksi` : "Ekstraksi selesai"} />
              <Check ok={!!s.lastValidatedAt} label={s.lastValidatedAt ? "Sudah divalidasi" : "Belum divalidasi"} />
              <Check ok={!!s.lastValidatedAt && openErrors === 0} label={openErrors ? `${openErrors} ERROR terbuka` : "Tidak ada ERROR terbuka"} />
              <Check ok={s.lots.length > 0} label={`${s.lots.length} lot ditautkan`} />
              <Check ok={s.evidencePacks.length > 0} label={s.evidencePacks.length ? `Paket bukti v${s.evidencePacks[0]!.version}` : "Paket bukti belum dibuat"} />
            </ul>
            {s.status === "READY" ? (
              <div className="mt-5"><Alert tone="ok" title="Status SIAP">Tidak ada ERROR terbuka pada validasi terakhir.</Alert></div>
            ) : (
              <div className="mt-5"><Alert tone="warn" title="Belum siap">Status SIAP hanya bila sudah divalidasi dan tidak ada ERROR terbuka.</Alert></div>
            )}
          </Card>
        </div>
      )}

      {tab === "documents" && (
        <div className="space-y-6">
          {canWrite && <UploadDocuments shipmentId={s.id} />}
          <TableCard>
            {s.documents.length === 0 ? (
              <Empty title="Belum ada dokumen" hint="Unggah invoice, packing list, B/L, SKA/COO, fitosanitari, PEB, dan L/C atau kontrak (PDF/JPG/PNG)." />
            ) : (
              <Table head={["Tipe", "File", "Halaman", "Ekstraksi", "Perlu dicek", "Versi", ""]}>
                {s.documents.map((d) => {
                  const flagged = d.fields.filter((f) => Number(f.confidence) < REVIEW_CONFIDENCE).length;
                  return (
                    <tr key={d.id} className="table-row">
                      <td>
                        {canWrite ? <DocTypeSelect documentId={d.id} value={d.type} /> : <span className="font-semibold">{DOC_TYPE_LABEL[d.type]}</span>}
                        {d.detectedType && <span className="mt-1 block text-[11px] text-muted">terdeteksi: {DOC_TYPE_LABEL[d.detectedType]} ({Math.round(Number(d.typeConfidence ?? 0) * 100)}%)</span>}
                      </td>
                      <td className="max-w-[260px]">
                        <a href={`/api/v1/documents/${d.id}/file`} target="_blank" className="block truncate font-medium text-fg hover:text-primary">{d.fileName}</a>
                        <span className="text-[11px] text-muted">{fmtDateTime(d.createdAt)}</span>
                      </td>
                      <td className="text-fg-2">{d.pageCount ?? "—"}</td>
                      <td><ExtractionPill status={d.extractionStatus} /></td>
                      <td>{d.extractionStatus === "PENDING" ? "—" : flagged ? <Tag tone="warn">{flagged} field</Tag> : <Tag tone="ok">0</Tag>}</td>
                      <td className="text-fg-2">v{d.version}</td>
                      <td className="whitespace-nowrap text-right">
                        <Link href={`/documents/${d.id}`} className="btn-secondary btn-sm">Tinjau field</Link>{" "}
                        {canWrite && <DeleteDocButton documentId={d.id} />}
                      </td>
                    </tr>
                  );
                })}
              </Table>
            )}
          </TableCard>
        </div>
      )}

      {tab === "findings" && (
        <TableCard>
          {!s.lastValidatedAt ? (
            <Empty title="Belum divalidasi" hint="Unggah dokumen lalu klik Jalankan validasi." />
          ) : s.findings.length === 0 ? (
            <Empty title="Tidak ada temuan" hint="Semua aturan D01–D15 terpenuhi." />
          ) : (
            <Table head={["Aturan", "Tingkat", "Temuan & saran", "Dokumen / field", "Status", ""]}>
              {s.findings.map((f) => (
                <tr key={f.id} className={`table-row ${f.status === "RESOLVED" ? "opacity-55" : ""}`}>
                  <td className="font-mono text-sm font-bold">{f.ruleId}</td>
                  <td><SeverityPill severity={f.severity} /></td>
                  <td className="max-w-[460px]">
                    <p className="text-fg">{f.message}</p>
                    {f.suggestion && <p className="mt-1 text-xs text-muted">Saran: {f.suggestion}</p>}
                    {f.status === "ACCEPTED" && <p className="mt-1 text-xs text-info">Alasan diterima: {f.acceptReason}</p>}
                  </td>
                  <td className="text-xs">
                    {(f.refs as Ref[]).map((r, i) => (
                      <div key={i}>
                        {r.documentId && docTypeById.has(r.documentId) ? (
                          <Link href={`/documents/${r.documentId}#${r.field ?? ""}`} className="font-semibold text-primary hover:underline">{DOC_TYPE_LABEL[docTypeById.get(r.documentId)!]}</Link>
                        ) : (
                          <span className="font-semibold">{r.documentType ? DOC_TYPE_LABEL[r.documentType] : ""}</span>
                        )}
                        {r.field && <span className="text-muted"> · {r.field}</span>}
                      </div>
                    ))}
                  </td>
                  <td><FindingStatusPill status={f.status} /></td>
                  <td className="text-right">{can(ctx.role, "finding:update") && f.status !== "RESOLVED" && <FindingActions findingId={f.id} status={f.status} />}</td>
                </tr>
              ))}
            </Table>
          )}
        </TableCard>
      )}

      <ShipmentExtraTabs tab={tab} shipment={s} ctx={ctx} />
    </>
  );
}

function Check({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2.5">
      <span className={`grid size-5 place-items-center rounded-full text-[11px] font-bold ${ok ? "bg-ok-soft text-ok" : "bg-neutral-soft text-muted"}`}>{ok ? "✓" : "•"}</span>
      <span className={ok ? "text-fg" : "text-fg-2"}>{label}</span>
    </li>
  );
}
