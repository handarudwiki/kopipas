import type { Ctx } from "@/lib/context";
import { can } from "@/lib/auth/rbac";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { packBlockers, packFreshness } from "@/server/packs";
import type { getShipmentDetail } from "@/server/shipments";
import { Alert, Card, Empty, Pill, Table, TableCard } from "@/components/ui";
import { CopyText, GeneratePackButton, NewShareLinkButton, RevokeLinkButton } from "./pack-client";

type Shipment = Awaited<ReturnType<typeof getShipmentDetail>>;

/** F6 — evidence pack generation, versions, and share links. */
export async function PackTab({ s, ctx }: { s: Shipment; ctx: Ctx }) {
  const [blockers, fresh] = await Promise.all([packBlockers(ctx.orgId, s.id), packFreshness(ctx.orgId, s.id)]);
  const canGenerate = can(ctx.role, "pack:generate");
  const canShare = can(ctx.role, "share:manage");
  const now = new Date();

  return (
    <div className="space-y-6">
      <Card
        title="Paket bukti EUDR"
        actions={canGenerate && <GeneratePackButton shipmentId={s.id} disabled={blockers.length > 0} reason={blockers[0]} />}
      >
        <p className="text-sm text-fg-2">PDF ringkasan, GeoJSON semua kebun asal, dan JSON data terstruktur — diberi hash SHA-256 dan nomor versi. Paket hanya dibuat oleh admin (persetujuan berbagi data, N6).</p>
        {blockers.length > 0 && (
          <div className="mt-4">
            <Alert tone="warn" title="Paket belum dapat dibuat (F6.2)">
              <ul className="mt-1 list-disc space-y-0.5 pl-5">{blockers.map((b) => <li key={b}>{b}</li>)}</ul>
            </Alert>
          </div>
        )}
        {fresh.latest && fresh.stale && blockers.length === 0 && (
          <div className="mt-4"><Alert tone="info" title="Data berubah sejak versi terakhir">Buat ulang paket untuk menerbitkan versi baru dengan hash baru (F6.3).</Alert></div>
        )}
        {!canGenerate && <p className="mt-3 text-xs text-muted">Hanya admin eksportir yang dapat menyetujui dan membuat paket bukti.</p>}
      </Card>

      <TableCard>
        <h2 className="px-2 pb-3 pt-1 text-base font-bold">Versi paket</h2>
        {s.evidencePacks.length === 0 ? (
          <Empty title="Belum ada paket bukti" />
        ) : (
          <Table head={["Versi", "Dibuat", "SHA-256", "Dataset / aturan", "Unduh", "Tautan aktif"]}>
            {s.evidencePacks.map((p, i) => (
              <tr key={p.id} className="table-row">
                <td><span className="font-bold">v{p.version}</span> {i === 0 && <Pill tone="ok">Terbaru</Pill>}</td>
                <td className="whitespace-nowrap text-fg-2">{fmtDateTime(p.generatedAt)}</td>
                <td className="max-w-[200px]"><CopyText text={p.sha256} short /></td>
                <td className="max-w-[220px] text-xs text-fg-2">{p.datasetVersion}<span className="block text-muted">{p.rulesVersion}</span></td>
                <td className="whitespace-nowrap">
                  {(["pdf", "geojson", "json"] as const).map((k) => (
                    <a key={k} href={`/api/v1/evidence-packs/${p.id}/files/${k}`} className="mr-2 text-sm font-semibold text-primary hover:underline">{k.toUpperCase()}</a>
                  ))}
                </td>
                <td>{p.shareLinks.filter((l) => !l.revokedAt && l.expiresAt > now).length}</td>
              </tr>
            ))}
          </Table>
        )}
      </TableCard>

      {s.evidencePacks.length > 0 && (
        <TableCard>
          <div className="flex items-center justify-between px-2 pb-3 pt-1">
            <h2 className="text-base font-bold">Tautan berbagi untuk importir (F6.4)</h2>
            {canShare && <NewShareLinkButton packs={s.evidencePacks.map((p) => ({ id: p.id, version: p.version }))} />}
          </div>
          {s.evidencePacks.every((p) => !p.shareLinks.length) ? (
            <Empty title="Belum ada tautan" hint="Buat tautan baca-saja bertanda tangan dengan masa berlaku (default 90 hari)." />
          ) : (
            <Table head={["Versi", "Label", "Dibuat", "Kedaluwarsa", "Akses", "Status", ""]}>
              {s.evidencePacks.flatMap((p) =>
                p.shareLinks.map((l) => {
                  const active = !l.revokedAt && l.expiresAt > now;
                  return (
                    <tr key={l.id} className="table-row">
                      <td className="font-semibold">v{p.version}</td>
                      <td className="text-fg-2">{l.label ?? "—"}</td>
                      <td className="whitespace-nowrap text-fg-2">{fmtDate(l.createdAt)}</td>
                      <td className="whitespace-nowrap text-fg-2">{fmtDate(l.expiresAt)}</td>
                      <td>{l.accessCount}{l.lastAccessAt && <span className="block text-[11px] text-muted">terakhir {fmtDateTime(l.lastAccessAt)}</span>}</td>
                      <td>{l.revokedAt ? <Pill tone="err">Dicabut</Pill> : active ? <Pill tone="ok">Aktif</Pill> : <Pill tone="neutral">Kedaluwarsa</Pill>}</td>
                      <td className="text-right">{canShare && active && <RevokeLinkButton id={l.id} />}</td>
                    </tr>
                  );
                }),
              )}
            </Table>
          )}
        </TableCard>
      )}
    </div>
  );
}
