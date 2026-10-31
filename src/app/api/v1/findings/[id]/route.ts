import { route } from "@/lib/api";
import { updateFinding } from "@/server/shipments";

export const PATCH = route<{ id: string }>("finding:update", async ({ req, ctx, params }) => updateFinding(ctx, params.id, await req.json()));
