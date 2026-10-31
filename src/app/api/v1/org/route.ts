import { route } from "@/lib/api";
import { getOrg, updateOrg } from "@/server/org";

export const GET = route(null, async ({ ctx }) => getOrg(ctx));
export const PATCH = route("settings:manage", async ({ req, ctx }) => updateOrg(ctx, await req.json()));
