import { route } from "@/lib/api";
import { getPlot, updatePlot } from "@/server/farmers";

type P = { id: string };
export const GET = route<P>("plot:read", async ({ ctx, params }) => getPlot(ctx, params.id));
export const PATCH = route<P>("plot:write", async ({ req, ctx, params }) => updatePlot(ctx, params.id, await req.json()));
