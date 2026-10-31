import { route } from "@/lib/api";
import { requestValidation } from "@/server/shipments";

export const POST = route<{ id: string }>("shipment:write", async ({ ctx, params }) => {
  const job = await requestValidation(ctx, params.id);
  return { jobId: job.id, status: job.status };
});
