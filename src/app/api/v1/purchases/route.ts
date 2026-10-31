import { route } from "@/lib/api";
import { createPurchase, listPurchases } from "@/server/lots";

export const GET = route("purchase:read", async ({ req, ctx }) => ({ items: await listPurchases(ctx, { unassigned: req.nextUrl.searchParams.get("unassigned") === "1" }) }));
export const POST = route("purchase:write", async ({ req, ctx }) => createPurchase(ctx, await req.json()));
