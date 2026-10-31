"use client";

import type { FeatureCollection } from "geojson";
import { PlotsMap } from "@/components/map";

export function PublicMap({ data }: { data: FeatureCollection }) {
  // risk colours expect internal codes; everything in a published pack has passed
  const fc: FeatureCollection = { ...data, features: data.features.map((f) => ({ ...f, properties: { ...f.properties, riskStatus: "PASS" } })) };
  return <PlotsMap data={fc} height={440} />;
}
