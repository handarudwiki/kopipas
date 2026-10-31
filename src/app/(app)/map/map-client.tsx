"use client";

import type { FeatureCollection } from "geojson";
import { useRouter } from "next/navigation";
import { PlotsMap } from "@/components/map";

export function MapClient({ data, forest }: { data: FeatureCollection; forest: FeatureCollection | null }) {
  const router = useRouter();
  return <PlotsMap data={data} forest={forest} height={640} onSelect={(id) => router.push(`/plots/${id}`)} />;
}
