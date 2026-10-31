import { route } from "@/lib/api";
import { deleteLot, getLot, updateLot } from "@/server/lots";

type P = { id: string };
export const GET = route<P>("lot:read", async ({ ctx, params }) => getLot(ctx, params.id));
export const PATCH = route<P>("lot:write", async ({ req, ctx, params }) => updateLot(ctx, params.id, await req.json()));
export const DELETE = route<P>("lot:write", async ({ ctx, params }) => {
  await deleteLot(ctx, params.id);
  return { ok: true };
});
