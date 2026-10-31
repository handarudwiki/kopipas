import type { Metadata } from "next";
import Link from "next/link";
import type { FeatureCollection, Point, Polygon } from "geojson";
import { getCtxWith } from "@/lib/auth/current";
import { can } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db";
import { fmtDate, fmtDateTime, fmtHa, fmtNum } from "@/lib/format";
import { getPlot } from "@/server/farmers";
import { Card, Empty, KV, PageHeader, Tag } from "@/components/ui";
import { RiskPill } from "@/components/status";
import { PlotMapClient } from "./plot-map-client";
import { DeleteEvidenceButton, EvidenceForm } from "./evidence-client";
import { RiskSection } from "./risk-section";

export const metadata: Metadata = { title: "Detail kebun" };

const EVIDENCE_LABEL = { SHM: "Sertifikat Hak Milik (SHM)", SKT: "Surat Keterangan Tanah (SKT)", SKD: "Surat keterangan desa", OTHER: "Lainnya", NONE: "Belum ada bukti legalitas" } as const;

export default async function PlotPage({ params }: PageProps<"/plots/[id]">) {
  const ctx = await getCtxWith("plot:read");
  const { id } = await params;
  const p = await getPlot(ctx, id);
  const canWrite = can(ctx.role, "plot:write");
  const capturedBy = p.capturedBy ? await prisma.user.findFirst({ where: { id: p.capturedBy, orgId: ctx.orgId }, select: { name: true } }) : null;
  const point = p.geomPoint as Point | null;
  const polygon = p.geomPolygon as Polygon | null;
  const fc: FeatureCollection = {
    type: "FeatureCollection",
    features: [{ type: "Feature", properties: { id: p.id, riskStatus: p.riskStatus }, geometry: polygon ?? point! }],
  };

  return (
    <>
      <PageHeader
        back={{ href: `/farmers/${p.farmerId}`, label: p.farmer.fullName }}
        title={<span className="flex flex-wrap items-center gap-3">{p.label ?? `Kebun ${p.id.slice(0, 6)}`} <RiskPill status={p.riskStatus} /></span>}
        subtitle={`${p.farmer.village}, ${p.farmer.district}, ${p.farmer.regency}`}
        actions={canWrite && <Link href={`/plots/${p.id}/edit`} className="btn-secondary">Ubah geometri</Link>}
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card className="p-4">
          <PlotMapClient data={fc} />
        </Card>
        <Card title="Data kebun">
          <KV items={[
            ["Geometri", polygon ? `Poligon (${polygon.coordinates[0]!.length - 1} titik)` : "Titik"],
            ["Koordinat (lat, lon)", point ? `${point.coordinates[1]!.toFixed(6)}, ${point.coordinates[0]!.toFixed(6)}` : "—"],
            ["Luas dinyatakan", fmtHa(p.declaredAreaHa)],
            ["Luas terhitung", p.computedAreaHa ? fmtHa(p.computedAreaHa) : "— (titik)"],
            ["Akurasi GPS", p.gpsAccuracyM != null ? `${fmtNum(p.gpsAccuracyM, 1)} m` : "—"],
            ["Direkam", `${fmtDateTime(p.capturedAt)}${capturedBy ? ` · ${capturedBy.name}` : ""}`],
          ]} />
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card title="Bukti legalitas lahan">
          {p.evidence.length === 0 ? (
            <Empty title="Belum dicatat" hint='Tambahkan foto bukti, atau catat "Belum ada" secara eksplisit (F2.5).' />
          ) : (
            <ul className="space-y-3">
              {p.evidence.map((e) => (
                <li key={e.id} className="rounded-xl border border-line p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-fg">{EVIDENCE_LABEL[e.type]}</p>
                      <p className="text-xs text-muted">{e.documentNumber ? `No. ${e.documentNumber} · ` : ""}{fmtDate(e.createdAt)}</p>
                      {e.notes && <p className="mt-1 text-sm text-fg-2">{e.notes}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <Tag tone={e.type === "NONE" ? "warn" : "ok"}>{e.photoKeys.length} foto</Tag>
                      {canWrite && <DeleteEvidenceButton id={e.id} />}
                    </div>
                  </div>
                  {e.photoKeys.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {e.photoKeys.map((k) => (
                        <a key={k} href={`/api/v1/files/${k}`} target="_blank" className="block">
                          {k.endsWith(".pdf") ? (
                            <span className="grid size-20 place-items-center rounded-lg border border-line text-xs font-semibold text-fg-2">PDF</span>
                          ) : (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={`/api/v1/files/${k}`} alt="Bukti legalitas" className="size-20 rounded-lg border border-line object-cover" />
                          )}
                        </a>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
          {canWrite && <div className="mt-5 border-t border-line pt-5"><EvidenceForm plotId={p.id} /></div>}
        </Card>
        <RiskSection plot={p} ctx={ctx} />
      </div>
    </>
  );
}
