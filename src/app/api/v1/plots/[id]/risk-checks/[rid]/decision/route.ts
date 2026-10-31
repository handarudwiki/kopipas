import { route } from "@/lib/api";
import { decideRiskCheck } from "@/server/risk";

/** F3.4 — admin-only verification decision: multipart (decision, note, photo*) or JSON with photoKeys. */
export const POST = route<{ id: string; rid: string }>("risk:decide", async ({ req, ctx, params }) => {
  if (req.headers.get("content-type")?.includes("application/json")) {
    const body = await req.json();
    return decideRiskCheck(ctx, params.id, params.rid, body, [], Array.isArray(body.photoKeys) ? body.photoKeys : []);
  }
  const form = await req.formData();
  const photos = form.getAll("photo").filter((f): f is File => typeof f !== "string" && f.size > 0);
  return decideRiskCheck(ctx, params.id, params.rid, { decision: form.get("decision"), note: form.get("note") }, photos);
});
