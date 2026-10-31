import { route } from "@/lib/api";
import { addEvidence } from "@/server/farmers";

/** multipart: type, documentNumber?, notes?, photo (0..n) — or JSON with photoKeys (mobile sync uploads). */
export const POST = route<{ id: string }>("plot:write", async ({ req, ctx, params }) => {
  if (req.headers.get("content-type")?.includes("application/json")) {
    const body = await req.json();
    return addEvidence(ctx, params.id, body, [], Array.isArray(body.photoKeys) ? body.photoKeys : []);
  }
  const form = await req.formData();
  const photos = form.getAll("photo").filter((f): f is File => typeof f !== "string" && f.size > 0);
  return addEvidence(ctx, params.id, {
    type: form.get("type"),
    documentNumber: form.get("documentNumber") || null,
    notes: form.get("notes") || null,
  }, photos);
});
