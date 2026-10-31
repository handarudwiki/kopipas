import { route } from "@/lib/api";
import { unlinkLot } from "@/server/lots";

export const DELETE = route<{ id: string; lotId: string }>("shipment:write", async ({ ctx, params }) => unlinkLot(ctx, params.id, params.lotId));
