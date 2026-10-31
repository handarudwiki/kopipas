import type { Metadata } from "next";
import Link from "next/link";
import { getCtxWith } from "@/lib/auth/current";
import { fmtDateTime } from "@/lib/format";
import { listPacks } from "@/server/packs";
import { Empty, PageHeader, Table, TableCard } from "@/components/ui";

export const metadata: Metadata = { title: "Paket Bukti" };

export default async function PacksPage() {
  const ctx = await getCtxWith("pack:read");
  const packs = await listPacks(ctx);
  const now = new Date();
  return (
    <>
      <PageHeader title="Paket Bukti EUDR" subtitle="Semua versi paket bukti per pengiriman dan tautan berbagi untuk importir" />
      <TableCard>
        {packs.length === 0 ? (
          <Empty title="Belum ada paket bukti" hint="Buka pengiriman berstatus SIAP lalu buat paket di tab Paket bukti." />
        ) : (
          <Table head={["Pengiriman", "Pembeli", "Versi", "Dibuat", "SHA-256", "Tautan aktif", "Akses", "Unduh"]}>
            {packs.map((p) => (
              <tr key={p.id} className="table-row">
                <td><Link href={`/shipments/${p.shipment.id}?tab=pack`} className="font-bold hover:text-primary">{p.shipment.reference}</Link></td>
                <td className="text-fg-2">{p.shipment.buyerName}</td>
                <td className="font-semibold">v{p.version}</td>
                <td className="whitespace-nowrap text-fg-2">{fmtDateTime(p.generatedAt)}</td>
                <td className="font-mono text-xs text-fg-2" title={p.sha256}>{p.sha256.slice(0, 16)}…</td>
                <td>{p.shareLinks.filter((l) => !l.revokedAt && l.expiresAt > now).length}</td>
                <td>{p.shareLinks.reduce((a, l) => a + l.accessCount, 0)}</td>
                <td className="whitespace-nowrap">{(["pdf", "geojson", "json"] as const).map((k) => <a key={k} href={`/api/v1/evidence-packs/${p.id}/files/${k}`} className="mr-2 text-sm font-semibold text-primary hover:underline">{k.toUpperCase()}</a>)}</td>
              </tr>
            ))}
          </Table>
        )}
      </TableCard>
    </>
  );
}
