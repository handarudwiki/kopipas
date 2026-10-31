import { route } from "@/lib/api";
import { deleteShipment, getShipmentDetail, updateShipment } from "@/server/shipments";

type P = { id: string };
export const GET = route<P>("shipment:read", async ({ ctx, params }) => getShipmentDetail(ctx, params.id));
export const PATCH = route<P>("shipment:write", async ({ req, ctx, params }) => updateShipment(ctx, params.id, await req.json()));
export const DELETE = route<P>("shipment:write", async ({ ctx, params }) => {
  await deleteShipment(ctx, params.id);
  return { ok: true };
});
