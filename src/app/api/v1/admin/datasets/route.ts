import { route } from "@/lib/api";
import { badRequest, unprocessable } from "@/lib/errors";
import { createDataset, listDatasets } from "@/server/risk";

export const GET = route("dataset:manage", async () => ({ items: await listDatasets() }));

/** multipart: kind, version, name, source?, file (GeoJSON FeatureCollection) */
export const POST = route("dataset:manage", async ({ req, ctx }) => {
  const form = await req.formData();
  const file = form.get("file");
  if (!file || typeof file === "string") throw badRequest("File GeoJSON wajib");
  if (file.size > 50 * 1024 * 1024) throw badRequest("File maksimal 50 MB");
  let json: unknown;
  try {
    json = JSON.parse(await file.text());
  } catch {
    throw unprocessable("File bukan JSON yang valid");
  }
  return createDataset(ctx, { kind: form.get("kind"), version: form.get("version"), name: form.get("name"), source: form.get("source") || null }, json, form.get("activate") !== "false");
});
