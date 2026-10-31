import { route } from "@/lib/api";
import { listRiskChecks, requestRiskCheck } from "@/server/risk";

type P = { id: string };
export const GET = route<P>("plot:read", async ({ ctx, params }) => ({ items: await listRiskChecks(ctx, params.id) }));
export const POST = route<P>("plot:write", async ({ ctx, params }) => {
  const job = await requestRiskCheck(ctx, params.id);
  return { jobId: job.id };
});
