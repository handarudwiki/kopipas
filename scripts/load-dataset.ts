/**
 * Load a reference dataset (GeoJSON FeatureCollection of polygons) and make it active.
 *   npx tsx scripts/load-dataset.ts --kind FOREST_COVER_2020 --version jrc-gfc2020-v2-dairi \
 *     --name "JRC GFC2020 v2 — Dairi" --source "https://forest-observatory.ec.europa.eu" --file path.geojson
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { prisma } from "../src/lib/db";
import { runAsActor } from "../src/lib/context";
import { activateDataset, validateFeatureCollection } from "../src/server/risk";

const { values } = parseArgs({
  options: { kind: { type: "string" }, version: { type: "string" }, name: { type: "string" }, source: { type: "string" }, file: { type: "string" } },
});

async function main() {
  if (!values.kind || !values.version || !values.name || !values.file) throw new Error("--kind --version --name --file are required");
  const fc = validateFeatureCollection(JSON.parse(readFileSync(values.file, "utf8")));
  const existing = await prisma.referenceDataset.findFirst({ where: { kind: values.kind, version: values.version } });
  const ds = existing ?? (await prisma.referenceDataset.create({
    data: { kind: values.kind, version: values.version, name: values.name, source: values.source ?? null, geojson: fc as unknown as object, isActive: false },
  }));
  await activateDataset({ userId: "", orgId: "", role: "SUPER_ADMIN", name: "cli", email: "" }, ds.id);
  console.log(`${existing ? "activated existing" : "loaded"} ${values.kind} ${values.version} (${fc.features.length} polygons)`);
}

runAsActor({ orgId: null, actorId: null }, main).then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
