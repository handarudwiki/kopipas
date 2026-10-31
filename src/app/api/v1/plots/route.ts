import { route } from "@/lib/api";
import { createPlot, listPlots } from "@/server/farmers";

export const GET = route("plot:read", async ({ req, ctx }) => {
  const sp = req.nextUrl.searchParams;
  const items = await listPlots(ctx, { risk: sp.get("risk") ?? undefined, farmerId: sp.get("farmerId") ?? undefined });
  if (sp.get("format") === "geojson") {
    return {
      type: "FeatureCollection",
      features: items.map((p) => ({
        type: "Feature",
        id: p.id,
        geometry: p.geomPolygon ?? p.geomPoint,
        properties: { id: p.id, label: p.label, farmer: p.farmer.fullName, riskStatus: p.riskStatus, declaredAreaHa: Number(p.declaredAreaHa) },
      })),
    };
  }
  return { items };
});
export const POST = route("plot:write", async ({ req, ctx }) => createPlot(ctx, await req.json()));
