import { route } from "@/lib/api";
import { syncBatch } from "@/server/sync";

/** Batch sync from the offline field app; idempotent by opId (N1). */
export const POST = route("sync", async ({ req, ctx }) => syncBatch(ctx, await req.json()));
