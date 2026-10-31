import { route } from "@/lib/api";
import { getPackFile } from "@/server/packs";

export const GET = route<{ id: string; kind: string }>("pack:read", async ({ ctx, params }) => {
  const f = await getPackFile(ctx.orgId, params.id, params.kind);
  return new Response(new Uint8Array(f.data), { headers: { "content-type": f.contentType, "content-disposition": `attachment; filename="${f.fileName}"` } });
});
