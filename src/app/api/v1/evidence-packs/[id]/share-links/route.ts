import { route } from "@/lib/api";
import { createShareLink } from "@/server/packs";

export const POST = route<{ id: string }>("share:manage", async ({ req, ctx, params }) => createShareLink(ctx, params.id, await req.json().catch(() => ({}))));
