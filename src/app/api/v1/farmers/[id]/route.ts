import { route } from "@/lib/api";
import { getFarmer, updateFarmer } from "@/server/farmers";

type P = { id: string };
export const GET = route<P>("farmer:read", async ({ ctx, params }) => getFarmer(ctx, params.id));
export const PATCH = route<P>("farmer:write", async ({ req, ctx, params }) => updateFarmer(ctx, params.id, await req.json()));
