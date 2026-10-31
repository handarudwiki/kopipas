import { route } from "@/lib/api";
import { badRequest } from "@/lib/errors";
import { uploadDocument } from "@/server/documents";

/** Multipart upload: one or more `file` parts, optional `type` (manual override). */
export const POST = route<{ id: string }>("shipment:write", async ({ req, ctx, params }) => {
  const form = await req.formData();
  const files = form.getAll("file").filter((f): f is File => typeof f !== "string");
  if (!files.length) throw badRequest("Tidak ada file");
  const type = form.get("type");
  const items = [];
  for (const f of files) items.push(await uploadDocument(ctx, params.id, f, typeof type === "string" && type ? type : null));
  return { items };
});
