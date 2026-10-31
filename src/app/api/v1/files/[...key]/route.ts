import { route } from "@/lib/api";
import { notFound } from "@/lib/errors";
import { getObject } from "@/lib/storage";

const TYPES: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", pdf: "application/pdf", json: "application/json", geojson: "application/geo+json" };

/** Serves stored files; the key must belong to the caller's organisation (N5). */
export const GET = route<{ key: string[] }>(null, async ({ ctx, params }) => {
  const key = params.key.map(decodeURIComponent).join("/");
  if (!key.startsWith(`${ctx.orgId}/`)) throw notFound();
  const data = await getObject(key).catch(() => {
    throw notFound();
  });
  const ext = key.split(".").pop()?.toLowerCase() ?? "";
  return new Response(new Uint8Array(data), {
    headers: { "content-type": TYPES[ext] ?? "application/octet-stream", "x-content-type-options": "nosniff", "cache-control": "private, max-age=600" },
  });
});
