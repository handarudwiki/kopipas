import { route } from "@/lib/api";
import { notFound } from "@/lib/errors";
import { getJob } from "@/lib/jobs";

export const GET = route<{ id: string }>(null, async ({ ctx, params }) => {
  const job = await getJob(ctx.orgId, params.id);
  if (!job) throw notFound("Job tidak ditemukan");
  return { id: job.id, type: job.type, status: job.status, result: job.result, error: job.error, createdAt: job.createdAt, finishedAt: job.finishedAt };
});
