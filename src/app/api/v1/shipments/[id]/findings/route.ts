import { route } from "@/lib/api";
import { listFindings } from "@/server/shipments";

export const GET = route<{ id: string }>("shipment:read", async ({ ctx, params }) => ({ items: await listFindings(ctx, params.id) }));
