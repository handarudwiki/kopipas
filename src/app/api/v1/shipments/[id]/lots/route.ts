import { route } from "@/lib/api";
import { linkLots } from "@/server/lots";

export const POST = route<{ id: string }>("shipment:write", async ({ req, ctx, params }) => linkLots(ctx, params.id, await req.json()));
