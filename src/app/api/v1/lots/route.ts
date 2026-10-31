import { route } from "@/lib/api";
import { createLot, listLots } from "@/server/lots";

export const GET = route("lot:read", async ({ ctx }) => ({ items: await listLots(ctx) }));
export const POST = route("lot:write", async ({ req, ctx }) => createLot(ctx, await req.json()));
