import { route } from "@/lib/api";
import { badRequest } from "@/lib/errors";
import { syncUpload } from "@/server/sync";

export const POST = route("sync", async ({ req, ctx }) => {
  const file = (await req.formData()).get("file");
  if (!file || typeof file === "string") throw badRequest("Tidak ada file");
  return syncUpload(ctx, file);
});
