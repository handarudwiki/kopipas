import type { Metadata } from "next";
import type { FeatureCollection } from "geojson";
import { getCtxWith } from "@/lib/auth/current";
import { listPlots } from "@/server/farmers";
import { activeForestLayer } from "./forest-layer";
import { PageHeader } from "@/components/ui";
import { RISK_LEGEND } from "./legend";
import { MapClient } from "./map-client";

export const metadata: Metadata = { title: "Peta Kebun" };

export default async function MapPage() {
  const ctx = await getCtxWith("plot:read");
  const plots = await listPlots(ctx);
  const data: FeatureCollection = {
    type: "FeatureCollection",
    features: plots.map((p) => ({
      type: "Feature",
      properties: { id: p.id, riskStatus: p.riskStatus, label: p.label, farmer: p.farmer.fullName },
      geometry: (p.geomPolygon ?? p.geomPoint) as unknown as FeatureCollection["features"][number]["geometry"],
    })),
  };
  const forest = await activeForestLayer();
  return (
    <>
      <PageHeader title="Peta Kebun" subtitle="Semua kebun terdaftar di atas lapisan tutupan hutan 2020 (F3.5). Klik kebun untuk membuka detail." />
      <div className="mb-4 flex flex-wrap gap-4 text-xs font-semibold text-fg-2">
        {RISK_LEGEND.map(([label, color]) => (
          <span key={label} className="inline-flex items-center gap-1.5"><span className="size-3 rounded-sm" style={{ background: color }} />{label}</span>
        ))}
      </div>
      <div className="card p-3">
        <MapClient data={data} forest={forest} />
      </div>
    </>
  );
}
