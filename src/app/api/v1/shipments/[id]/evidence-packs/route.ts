import { route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { packBlockers, requestPack } from "@/server/packs";
import { getShipmentOr404 } from "@/server/shipments";

type P = { id: string };
export const GET = route<P>("pack:read", async ({ ctx, params }) => {
  await getShipmentOr404(ctx, params.id);
  const [items, blockers] = await Promise.all([
    prisma.evidencePack.findMany({ where: { shipmentId: params.id, orgId: ctx.orgId }, orderBy: { version: "desc" } }),
    packBlockers(ctx.orgId, params.id),
  ]);
  return { items, canGenerate: blockers.length === 0, blockers };
});

/** F6.1 — async generation; returns a job id. Admin approval = generating the pack (N6). */
export const POST = route<P>("pack:generate", async ({ ctx, params }) => {
  const job = await requestPack(ctx, params.id);
  return { jobId: job.id };
});
