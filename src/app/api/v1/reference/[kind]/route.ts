import { route } from "@/lib/api";
import { notFound } from "@/lib/errors";
import { activeDataset, type DatasetKind } from "@/server/risk";

/** Active reference layer as GeoJSON (forest 2020 / forest area) for maps (F3.5). */
export const GET = route<{ kind: string }>("plot:read", async ({ params }) => {
  const kind = params.kind.toUpperCase() as DatasetKind;
  if (kind !== "FOREST_COVER_2020" && kind !== "FOREST_AREA") throw notFound();
  const ds = await activeDataset(kind);
  if (!ds) throw notFound("Dataset belum dimuat");
  return Response.json(ds.geojson, { headers: { "x-dataset-version": ds.version, "cache-control": "private, max-age=600" } });
});
