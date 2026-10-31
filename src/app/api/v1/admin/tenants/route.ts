import { route } from "@/lib/api";
import { createTenant, listTenants } from "@/server/tenants";

export const GET = route("tenant:manage", async () => ({ items: await listTenants() }));
export const POST = route("tenant:manage", async ({ req, ctx }) => createTenant(ctx, await req.json()));
