import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/** Liveness/readiness for uptime monitoring: checks the database and reports queue backlog. */
export async function GET() {
  const started = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    const [queued, failed24h] = await Promise.all([
      prisma.job.count({ where: { status: { in: ["QUEUED", "RUNNING"] }, createdAt: { lt: new Date(Date.now() - 5 * 60_000) } } }),
      prisma.job.count({ where: { status: "FAILED", createdAt: { gt: new Date(Date.now() - 864e5) } } }),
    ]);
    return NextResponse.json({ status: "ok", db: "ok", stuckJobs: queued, failedJobs24h: failed24h, latencyMs: Date.now() - started }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ status: "error", db: "down", error: e instanceof Error ? e.message : String(e) }, { status: 503 });
  }
}
