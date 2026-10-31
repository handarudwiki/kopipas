import { route } from "@/lib/api";
import { badRequest, unprocessable } from "@/lib/errors";
import { areaHa, GeoError, parseGeoFile } from "@/lib/geo";

/** Parses an uploaded GeoJSON / KML file and returns normalised geometry for preview. */
export const POST = route("plot:write", async ({ req }) => {
  const form = await req.formData();
  const file = form.get("file");
  if (!file || typeof file === "string") throw badRequest("Tidak ada file");
  if (file.size > 5 * 1024 * 1024) throw badRequest("File maksimal 5 MB");
  try {
    const g = await parseGeoFile(await file.text(), file.name);
    return { ...g, computedAreaHa: g.polygon ? areaHa(g.polygon) : null };
  } catch (e) {
    if (e instanceof GeoError) throw unprocessable(e.message);
    throw e;
  }
});
