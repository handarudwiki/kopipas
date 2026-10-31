import type { Metadata } from "next";
import { headers } from "next/headers";
import type { FeatureCollection } from "geojson";
import { Coffee, Download, ShieldCheck } from "lucide-react";
import { ApiError } from "@/lib/errors";
import { runAsActor } from "@/lib/context";
import { publicPackSummary } from "@/server/packs";
import { Card, KV, Pill, Table, TableCard } from "@/components/ui";
import { PublicMap } from "./public-map";

export const metadata: Metadata = { title: "EUDR evidence pack", robots: { index: false, follow: false } };

type PackData = {
  shipment: { reference: string; portOfLoading: string; portOfDischarge: string };
  product: { description: string; hsCode: string; netWeightKg: number; lots: { code: string; weightKg: number; form: string }[] };
  countryOfProduction: string;
  harvestOrPurchasePeriod: { from: string; to: string } | null;
  operator: { name: string; address: string | null; country: string };
  buyer: { name: string; address: string | null; country: string };
  plots: {
    plotRef: string; location: { village: string; regency: string; province: string }; geometryType: string; declaredAreaHa: number; computedAreaHa: number | null;
    risk: { finalStatus: string; forestCover2020Pct: number | null; datasetVersion: string; verification: { decision: string; note: string | null } | null } | null;
    legality: { type: string; documentNumber: string | null }[];
  }[];
  riskSummary: { plots: number; pass: number; verifiedByAdmin: number; datasetVersions: string[]; rulesVersion: string };
  documentValidation: { rulesVersion: string | null; validatedAt: string | null; openErrors: number; openWarnings: number; documents: { type: string; fileName: string }[] };
};

/** Importer read-only page (F6.4): no account; every view is logged. */
export default async function PublicPackPage({ params }: PageProps<"/p/[token]">) {
  const { token } = await params;
  const h = await headers();
  let result: Awaited<ReturnType<typeof publicPackSummary>>;
  try {
    result = await runAsActor({ orgId: null, actorId: null }, () =>
      publicPackSummary(token, { ip: h.get("x-forwarded-for")?.split(",")[0] ?? null, ua: h.get("user-agent") }),
    );
  } catch (e) {
    const gone = e instanceof ApiError && e.status === 410;
    return (
      <main className="grid min-h-screen place-items-center px-4">
        <div className="card max-w-md p-8 text-center">
          <p className="text-4xl font-bold text-primary">{gone ? "410" : "404"}</p>
          <h1 className="mt-3 text-xl font-bold">{gone ? "This link has expired or been revoked" : "Link not found"}</h1>
          <p className="mt-2 text-sm text-muted">Please ask the exporter for a new evidence-pack link.</p>
        </div>
      </main>
    );
  }
  const d = result.data as PackData;
  const files = (["pdf", "geojson", "json"] as const).map((k) => ({ k, href: `/api/v1/public/packs/${token}/files/${k}`, label: { pdf: "Summary PDF", geojson: "Plots GeoJSON", json: "Structured JSON" }[k] }));

  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-4 sm:px-8">
          <span className="grid size-10 place-items-center rounded-xl bg-primary text-primary-fg"><Coffee className="size-5" /></span>
          <div className="min-w-0 flex-1">
            <p className="font-bold">KopiPass · EUDR evidence pack</p>
            <p className="truncate text-xs text-muted">Shared by {d.operator.name} · read-only · link valid until {result.expiresAt.toISOString().slice(0, 10)}</p>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Shipment {d.shipment.reference}</h1>
            <p className="mt-1 text-sm text-muted">Pack version {result.pack.version} · generated {result.pack.generatedAt.toISOString().replace("T", " ").slice(0, 16)} UTC</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {files.map((f) => <a key={f.k} href={f.href} className={f.k === "pdf" ? "btn-primary" : "btn-secondary"}><Download className="size-4" /> {f.label}</a>)}
          </div>
        </div>

        <div className="flex items-start gap-3 rounded-2xl border border-ok/30 bg-ok-soft p-4 text-sm text-ok">
          <ShieldCheck className="mt-0.5 size-5 shrink-0" />
          <div>
            <p className="font-semibold">All {d.riskSummary.plots} plots of production passed the deforestation check against forest cover on 31 December 2020{d.riskSummary.verifiedByAdmin ? ` (${d.riskSummary.verifiedByAdmin} after field verification)` : ""}; export documents have no open errors.</p>
            <p className="mt-1 break-all font-mono text-xs opacity-80">SHA-256 {result.pack.sha256}</p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card title="Product">
            <KV items={[
              ["Description", d.product.description], ["HS code", d.product.hsCode],
              ["Net weight", `${d.product.netWeightKg.toLocaleString("en-US")} kg`], ["Country of production", d.countryOfProduction === "ID" ? "Indonesia" : d.countryOfProduction],
              ["Harvest / purchase period", d.harvestOrPurchasePeriod ? `${d.harvestOrPurchasePeriod.from} → ${d.harvestOrPurchasePeriod.to}` : "—"],
              ["Lots", d.product.lots.map((l) => `${l.code} (${l.weightKg.toLocaleString("en-US")} kg)`).join(", ")],
            ]} />
          </Card>
          <Card title="Parties">
            <KV items={[
              ["Exporter", d.operator.name], ["Exporter address", d.operator.address],
              ["Buyer", d.buyer.name], ["Buyer address", `${d.buyer.address ?? "—"} (${d.buyer.country})`],
              ["Port of loading", d.shipment.portOfLoading], ["Port of discharge", d.shipment.portOfDischarge],
            ]} />
          </Card>
        </div>

        <Card title="Plots of production" className="p-4">
          <PublicMap data={result.geojson as FeatureCollection} />
        </Card>

        <TableCard>
          <Table head={["Plot", "Location", "Geometry", "Area (ha)", "Forest 2020", "Result", "Legality"]}>
            {d.plots.map((p) => (
              <tr key={p.plotRef} className="table-row">
                <td className="font-mono text-xs font-bold">{p.plotRef}</td>
                <td className="text-fg-2">{p.location.village}, {p.location.regency}</td>
                <td>{p.geometryType}</td>
                <td>{(p.computedAreaHa ?? p.declaredAreaHa).toFixed(2)}</td>
                <td>{p.risk?.forestCover2020Pct != null ? `${p.risk.forestCover2020Pct}%` : "—"}</td>
                <td>
                  <Pill tone={p.risk?.finalStatus === "PASS" ? "ok" : "warn"}>{p.risk?.finalStatus ?? "—"}</Pill>
                  {p.risk?.verification && <span className="mt-1 block max-w-[220px] text-[11px] text-muted">Field-verified: {p.risk.verification.note}</span>}
                </td>
                <td className="text-xs text-fg-2">{p.legality.map((l) => `${l.type}${l.documentNumber ? ` (${l.documentNumber})` : ""}`).join("; ") || "—"}</td>
              </tr>
            ))}
          </Table>
        </TableCard>

        <Card title="Export document validation">
          <KV items={[
            ["Rule set", d.documentValidation.rulesVersion], ["Validated", d.documentValidation.validatedAt?.slice(0, 16).replace("T", " ") ?? "—"],
            ["Open errors", String(d.documentValidation.openErrors)], ["Documents", d.documentValidation.documents.map((x) => x.type).join(", ")],
            ["Forest dataset", d.riskSummary.datasetVersions.join(", ")], ["Risk rules", d.riskSummary.rulesVersion],
          ]} />
        </Card>
        <p className="pb-8 text-center text-xs text-muted">Access to this page is logged. The operator remains responsible for its due diligence statement.</p>
      </main>
    </div>
  );
}
