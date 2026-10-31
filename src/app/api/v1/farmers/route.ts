import { route } from "@/lib/api";
import { createFarmer, listFarmers } from "@/server/farmers";

export const GET = route("farmer:read", async ({ req, ctx }) => ({ items: await listFarmers(ctx, { search: req.nextUrl.searchParams.get("q") ?? undefined }) }));
export const POST = route("farmer:write", async ({ req, ctx }) => createFarmer(ctx, await req.json()));
