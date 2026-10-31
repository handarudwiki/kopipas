import { prisma } from "@/lib/db";
import type { Ctx } from "@/lib/context";
import { can } from "@/lib/auth/rbac";

/** Pilot KPIs from the BRD "Target MVP" table plus operational counts. */
export async function dashboardData(ctx: Ctx) {
  const org = { orgId: ctx.orgId };
  const [plots, plotsByRisk, farmers, shipmentsByStatus, packs, packedShipments, findingsOpen, purchases, recentShipments, recentLogs] = await Promise.all([
    prisma.plot.count({ where: org }),
    prisma.plot.groupBy({ by: ["riskStatus"], where: org, _count: true }),
    prisma.farmer.count({ where: org }),
    prisma.shipment.groupBy({ by: ["status"], where: org, _count: true }),
    prisma.evidencePack.count({ where: org }),
    prisma.evidencePack.findMany({ where: org, distinct: ["shipmentId"], select: { shipmentId: true, shareLinks: { select: { accessCount: true } } } }),
    prisma.finding.groupBy({ by: ["severity"], where: { ...org, status: "OPEN" }, _count: true }),
    prisma.purchase.aggregate({ where: org, _sum: { weightKg: true }, _count: true }),
    can(ctx.role, "shipment:read")
      ? prisma.shipment.findMany({ where: org, orderBy: { updatedAt: "desc" }, take: 6, include: { findings: { where: { status: "OPEN", severity: "ERROR" }, select: { id: true } } } })
      : Promise.resolve([]),
    can(ctx.role, "audit:read")
      ? prisma.auditLog.findMany({ where: { ...org, action: { in: ["CREATE", "UPDATE", "ACCESS", "SYNC_CONFLICT"] } }, orderBy: { createdAt: "desc" }, take: 8 })
      : Promise.resolve([]),
  ]);
  const risk = Object.fromEntries(plotsByRisk.map((r) => [r.riskStatus, r._count])) as Record<string, number>;
  const ship = Object.fromEntries(shipmentsByStatus.map((r) => [r.status, r._count])) as Record<string, number>;
  const open = Object.fromEntries(findingsOpen.map((r) => [r.severity, r._count])) as Record<string, number>;
  const actorIds = [...new Set(recentLogs.map((l) => l.actorId).filter(Boolean))] as string[];
  const actors = new Map((await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  return {
    plots, farmers, risk, ship, open, packs,
    shipmentsWithPack: packedShipments.length,
    packsAccessedByImporter: packedShipments.filter((p) => p.shareLinks.some((l) => l.accessCount > 0)).length,
    purchasesKg: Number(purchases._sum.weightKg ?? 0),
    purchasesCount: purchases._count,
    recentShipments,
    recentLogs: recentLogs.map((l) => ({ ...l, actorName: l.actorId ? actors.get(l.actorId) ?? null : null })),
  };
}

export async function globalSearch(ctx: Ctx, q: string) {
  const term = q.trim();
  if (term.length < 2) return { shipments: [], farmers: [], plots: [], lots: [] };
  const like = { contains: term, mode: "insensitive" as const };
  const [shipments, farmers, plots, lots] = await Promise.all([
    can(ctx.role, "shipment:read") ? prisma.shipment.findMany({ where: { orgId: ctx.orgId, OR: [{ reference: like }, { buyerName: like }] }, take: 10 }) : [],
    can(ctx.role, "farmer:read") ? prisma.farmer.findMany({ where: { orgId: ctx.orgId, OR: [{ fullName: like }, { village: like }, { phone: like }] }, take: 10 }) : [],
    can(ctx.role, "plot:read") ? prisma.plot.findMany({ where: { orgId: ctx.orgId, label: like }, take: 10, include: { farmer: { select: { fullName: true } } } }) : [],
    can(ctx.role, "lot:read") ? prisma.lot.findMany({ where: { orgId: ctx.orgId, code: like }, take: 10 }) : [],
  ]);
  return { shipments, farmers, plots, lots };
}
