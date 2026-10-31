"use client";

import type { FeatureCollection } from "geojson";
import { PlotsMap } from "@/components/map";

export function PlotMapClient({ data, forest }: { data: FeatureCollection; forest?: FeatureCollection | null }) {
  return <PlotsMap data={data} forest={forest} height={420} />;
}
