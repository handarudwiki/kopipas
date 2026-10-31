import { route } from "@/lib/api";
import { lockLot } from "@/server/lots";

export const POST = route<{ id: string }>("lot:write", async ({ ctx, params }) => lockLot(ctx, params.id));
