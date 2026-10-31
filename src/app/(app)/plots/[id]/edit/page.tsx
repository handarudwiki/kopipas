import type { Metadata } from "next";
import type { Point, Polygon } from "geojson";
import { getCtxWith } from "@/lib/auth/current";
import { prisma } from "@/lib/db";
import { parseSettings } from "@/lib/settings";
import { getPlot } from "@/server/farmers";
import { PageHeader } from "@/components/ui";
import { PlotForm } from "../../plot-form";

export const metadata: Metadata = { title: "Ubah kebun" };

export default async function EditPlotPage({ params }: PageProps<"/plots/[id]/edit">) {
  const ctx = await getCtxWith("plot:write");
  const { id } = await params;
  const p = await getPlot(ctx, id);
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: ctx.orgId } });
  return (
    <>
      <PageHeader back={{ href: `/plots/${p.id}`, label: p.label ?? "Kebun" }} title="Ubah geometri kebun" subtitle="Perubahan geometri memicu cek risiko ulang" />
      <PlotForm
        polygonAboveHa={parseSettings(org.settings).risk.polygonRequiredAboveHa}
        plot={{ id: p.id, label: p.label, declaredAreaHa: Number(p.declaredAreaHa), point: p.geomPolygon ? null : (p.geomPoint as Point | null), polygon: p.geomPolygon as Polygon | null }}
      />
    </>
  );
}
