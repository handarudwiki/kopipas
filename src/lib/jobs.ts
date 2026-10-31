import { after } from "next/server";
import { prisma } from "@/lib/db";
import { runAsActor } from "@/lib/context";

/**
 * Minimal async job runner (stand-in for Celery+Redis in the BRD). Jobs are persisted in the
 * `job` table so clients can poll GET /jobs/{id}; work runs in-process after the response is sent.
 */
type Handler = (payload: Record<string, unknown>, job: { id: string; orgId: string; createdBy: string | null }) => Promise<unknown>;

const handlers = new Map<string, Handler>();

export function registerJob(type: string, handler: Handler) {
  handlers.set(type, handler);
}

export async function runJob(id: string) {
  const job = await prisma.job.findUnique({ where: { id } });
  if (!job || job.status !== "QUEUED") return job;
  const handler = handlers.get(job.type);
  await prisma.job.update({ where: { id }, data: { status: "RUNNING", startedAt: new Date() } });
  try {
    if (!handler) throw new Error(`no handler for job type ${job.type}`);
    const result = await runAsActor({ orgId: job.orgId, actorId: job.createdBy }, () =>
      handler(job.payload as Record<string, unknown>, { id: job.id, orgId: job.orgId, createdBy: job.createdBy }),
    );
    return prisma.job.update({
      where: { id },
      data: { status: "DONE", finishedAt: new Date(), result: (result ?? null) as object },
    });
  } catch (e) {
    console.error(`[job ${job.type}] failed`, e);
    return prisma.job.update({
      where: { id },
      data: { status: "FAILED", finishedAt: new Date(), error: e instanceof Error ? e.message : String(e) },
    });
  }
}

/** Mode: "after" (default, background after response), "inline" (await; used by tests/scripts). */
let mode: "after" | "inline" = process.env.JOBS_INLINE === "1" ? "inline" : "after";
export const setJobMode = (m: "after" | "inline") => (mode = m);

export async function enqueueJob(orgId: string, createdBy: string | null, type: string, payload: Record<string, unknown>) {
  const job = await prisma.job.create({ data: { orgId, createdBy, type, payload: payload as object } });
  if (mode === "inline") {
    return (await runJob(job.id)) ?? job;
  }
  try {
    after(() => runJob(job.id));
  } catch {
    // outside a request scope (scripts): run detached
    setImmediate(() => void runJob(job.id));
  }
  return job;
}

export async function getJob(orgId: string, id: string) {
  return prisma.job.findFirst({ where: { id, orgId } });
}
