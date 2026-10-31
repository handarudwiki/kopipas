import type { FeatureCollection } from "geojson";
import { activeDataset } from "@/server/risk";

/** Active forest-cover-2020 reference layer for map display (F3.5). */
export async function activeForestLayer(): Promise<FeatureCollection | null> {
  const ds = await activeDataset("FOREST_COVER_2020");
  return (ds?.geojson as unknown as FeatureCollection) ?? null;
}
