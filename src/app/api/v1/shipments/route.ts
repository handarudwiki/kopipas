import { route } from "@/lib/api";
import { createShipment, listShipments } from "@/server/shipments";

export const GET = route("shipment:read", async ({ req, ctx }) => ({
  items: await listShipments(ctx, {
    status: req.nextUrl.searchParams.get("status") ?? undefined,
    search: req.nextUrl.searchParams.get("q") ?? undefined,
  }),
}));

export const POST = route("shipment:write", async ({ req, ctx }) => createShipment(ctx, await req.json()));
