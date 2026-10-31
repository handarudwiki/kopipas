import type { Ctx } from "@/lib/context";
import { can } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db";
import { fmtDateTime, fmtNum } from "@/lib/format";
import type { getPlot } from "@/server/farmers";
import { Alert, Card, Empty, Tag } from "@/components/ui";
import { RiskPill } from "@/components/status";
import { DecisionForm, RecheckButton } from "./risk-client";

type Plot = Awaited<ReturnType<typeof getPlot>>;
type Reason = { ruleId?: string; status?: string; message?: string; assessed?: string };

/** F3.1–F3.4 — risk check history and admin verification. */
export async function RiskSection({ plot, ctx }: { plot: Plot; ctx: Ctx }) {
  const [latest, ...older] = plot.riskChecks;
  const deciderIds = plot.riskChecks.map((c) => c.decidedBy).filter(Boolean) as string[];
  const users = new Map((await prisma.user.findMany({ where: { id: { in: deciderIds }, orgId: ctx.orgId }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const needsDecision = latest && !latest.decisionStatus && (latest.status === "REVIEW" || latest.status === "RISK");

  return (
    <Card title="Cek risiko deforestasi" actions={can(ctx.role, "plot:write") && <RecheckButton plotId={plot.id} />}>
      {!latest ? (
        <Empty title="Belum ada cek risiko" hint="Cek berjalan otomatis setelah kebun disimpan." />
      ) : (
        <div className="space-y-5">
          <div className="rounded-xl border border-line p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <RiskPill status={latest.status} />
                {latest.decisionStatus && <><span className="text-muted">→</span><RiskPill status={latest.decisionStatus} /><Tag tone="info">diverifikasi</Tag></>}
              </div>
              <span className="text-xs text-muted">{fmtDateTime(latest.createdAt)} · {latest.durationMs ?? "?"} ms</span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div><p className="text-xs font-semibold text-muted">Tutupan hutan 2020</p><p className="text-lg font-bold">{latest.forestPct2020 != null ? `${fmtNum(latest.forestPct2020, 2)}%` : "—"}</p></div>
              <div><p className="text-xs font-semibold text-muted">Kawasan hutan</p><p className="text-lg font-bold">{latest.overlapsForestArea ? "Beririsan" : "Tidak"}</p></div>
            </div>
            <ul className="mt-3 space-y-1 text-sm">
              {(latest.reasons as Reason[]).filter((r) => r.ruleId).map((r, i) => (
                <li key={i} className="flex gap-2"><span className="font-mono text-xs font-bold text-fg-2">{r.ruleId}</span><span className="text-fg-2">{r.message}</span></li>
              ))}
            </ul>
            <p className="mt-3 text-[11px] text-muted">Dataset {latest.datasetVersion} · aturan {latest.rulesVersion} · {(latest.reasons as Reason[]).find((r) => r.assessed)?.assessed === "point-buffer" ? "dinilai sebagai lingkaran seluas luas dinyatakan di sekitar titik" : "dinilai pada poligon"}</p>
            {latest.decisionStatus && (
              <div className="mt-3 rounded-lg bg-info-soft p-3 text-sm text-info">
                <p className="font-semibold">Keputusan {users.get(latest.decidedBy ?? "") ?? "admin"} · {fmtDateTime(latest.decidedAt)}</p>
                <p className="mt-0.5">{latest.decisionNote}</p>
                {latest.verificationPhotoKeys.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {latest.verificationPhotoKeys.map((k) => (
                      <a key={k} href={`/api/v1/files/${k}`} target="_blank">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`/api/v1/files/${k}`} alt="Foto verifikasi" className="size-16 rounded-lg border border-line object-cover" />
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {latest.status === "ERROR" && <Alert tone="danger" title="Tidak bisa dicek">Petakan kebun sebagai poligon karena luas dinyatakan melebihi batas.</Alert>}
          {needsDecision && (can(ctx.role, "risk:decide") ? (
            <DecisionForm plotId={plot.id} checkId={latest.id} />
          ) : (
            <Alert tone="warn" title="Menunggu verifikasi admin">Status hanya bisa diubah lewat keputusan admin (F3.4).</Alert>
          ))}

          {older.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer font-semibold text-fg-2">Riwayat ({older.length} versi sebelumnya)</summary>
              <ul className="mt-2 space-y-2">
                {older.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-2 border-b border-line pb-2 text-xs">
                    <RiskPill status={c.decisionStatus ?? c.status} />
                    <span className="text-fg-2">{c.forestPct2020 != null ? `${fmtNum(c.forestPct2020, 2)}% hutan` : "—"}</span>
                    <span className="text-muted">{fmtDateTime(c.createdAt)} · {c.datasetVersion}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </Card>
  );
}
