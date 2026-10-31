import { publicRoute } from "@/lib/api";
import { publicPackSummary } from "@/server/packs";

/** Importer access without login (F6.4); every access is logged. */
export const GET = publicRoute<{ token: string }>(async ({ req, params }) =>
  publicPackSummary(params.token, { ip: req.headers.get("x-forwarded-for")?.split(",")[0] ?? null, ua: req.headers.get("user-agent") }),
);
