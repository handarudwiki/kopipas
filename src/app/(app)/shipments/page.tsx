import type { Metadata } from "next";
import Link from "next/link";
import { FileStack, Boxes, Lock } from "lucide-react";
import { getCtxWith } from "@/lib/auth/current";
import { can } from "@/lib/auth/rbac";
import { fmtDate, fmtKg } from "@/lib/format";
import { listShipments } from "@/server/shipments";
import { Empty, PageHeader, Table, TableCard, TabLinks, Tag } from "@/components/ui";
import { PAYMENT_LABEL, ShipmentStatusPill } from "@/components/status";
import { NewShipmentButton } from "./shipments-client";

export const metadata: Metadata = { title: "Pengiriman" };

export default async function ShipmentsPage({ searchParams }: PageProps<"/shipments">) {
  const ctx = await getCtxWith("shipment:read");
  const sp = await searchParams;
  const status = typeof sp.status === "string" ? sp.status : undefined;
  const all = await listShipments(ctx);
  const rows = status ? all.filter((s) => s.status === status) : all;
  const count = (st: string) => all.filter((s) => s.status === st).length;

  return (
    <>
      <PageHeader
        title="Pengiriman"
        subtitle="Set dokumen ekspor, validasi konsistensi, dan kesiapan paket bukti per pengiriman"
        actions={can(ctx.role, "shipment:write") && <NewShipmentButton />}
      />
      <TabLinks
        active={status ?? "all"}
        tabs={[
          { key: "all", href: "/shipments", label: "Semua", count: all.length },
          { key: "DRAFT", href: "/shipments?status=DRAFT", label: "Draf", count: count("DRAFT") },
          { key: "CHECKING", href: "/shipments?status=CHECKING", label: "Perlu perbaikan", count: count("CHECKING") },
          { key: "READY", href: "/shipments?status=READY", label: "Siap", count: count("READY") },
        ]}
      />
      <TableCard>
        {rows.length === 0 ? (
          <Empty title="Belum ada pengiriman" hint="Buat pengiriman, unggah set dokumen ekspor, lalu jalankan validasi." />
        ) : (
          <Table head={["Referensi", "Pembeli", "Rute", "Pembayaran", "Dokumen", "Temuan", "Status", "Dibuat"]}>
            {rows.map((s) => (
              <tr key={s.id} className="table-row">
                <td>
                  <Link href={`/shipments/${s.id}`} className="font-bold text-fg hover:text-primary">{s.reference}</Link>
                  <span className="block text-xs text-muted">HS {s.hsCode}{s.netWeightKg ? ` · ${fmtKg(s.netWeightKg)}` : ""}</span>
                </td>
                <td className="text-fg-2">
                  {s.buyerName}
                  <span className="block text-xs text-muted">{s.buyerCountry}</span>
                </td>
                <td className="text-fg-2">{s.portLoading} → {s.portDischarge}</td>
                <td><Tag tone={s.paymentMethod === "LC" ? "info" : "neutral"} icon={s.paymentMethod === "LC" ? <Lock className="size-3" /> : undefined}>{PAYMENT_LABEL[s.paymentMethod]}</Tag></td>
                <td className="whitespace-nowrap text-fg-2">
                  <span className="inline-flex items-center gap-1"><FileStack className="size-3.5 text-muted" />{s._count.documents}</span>
                  <span className="ml-3 inline-flex items-center gap-1"><Boxes className="size-3.5 text-muted" />{s._count.lots}</span>
                </td>
                <td className="whitespace-nowrap">
                  {s.openErrors > 0 && <Tag tone="err">{s.openErrors} error</Tag>}{" "}
                  {s.openWarnings > 0 && <Tag tone="warn">{s.openWarnings} warning</Tag>}
                  {!s.openErrors && !s.openWarnings && <span className="text-muted">—</span>}
                </td>
                <td><ShipmentStatusPill status={s.status} /></td>
                <td className="whitespace-nowrap text-fg-2">{fmtDate(s.createdAt)}</td>
              </tr>
            ))}
          </Table>
        )}
      </TableCard>
    </>
  );
}
