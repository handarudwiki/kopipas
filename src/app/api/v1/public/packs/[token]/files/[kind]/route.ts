import { publicRoute } from "@/lib/api";
import { publicPackFile } from "@/server/packs";

export const GET = publicRoute<{ token: string; kind: string }>(async ({ req, params }) => {
  const f = await publicPackFile(params.token, params.kind, { ip: req.headers.get("x-forwarded-for")?.split(",")[0] ?? null, ua: req.headers.get("user-agent") });
  return new Response(new Uint8Array(f.data), {
    headers: { "content-type": f.contentType, "content-disposition": `attachment; filename="${f.fileName}"`, "cache-control": "no-store", "x-robots-tag": "noindex" },
  });
});
