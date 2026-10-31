import { z } from "zod";
import { prisma } from "@/lib/db";
import type { Ctx } from "@/lib/context";
import { badRequest, notFound } from "@/lib/errors";
import { orgSettingsSchema, parseSettings } from "@/lib/settings";
import { Role } from "@/generated/prisma/enums";

export async function getOrg(ctx: Ctx) {
  const org = await prisma.organization.findUnique({ where: { id: ctx.orgId } });
  if (!org) throw notFound();
  return { ...org, settings: parseSettings(org.settings) };
}

export const orgUpdateSchema = z.object({
  name: z.string().min(2).optional(),
  npwp: z.string().max(32).nullable().optional(),
  address: z.string().max(500).nullable().optional(),
  country: z.string().length(2).optional(),
  settings: orgSettingsSchema.optional(),
});

export async function updateOrg(ctx: Ctx, input: unknown) {
  const data = orgUpdateSchema.parse(input);
  if (data.settings && data.settings.risk.passBelowPct > data.settings.risk.riskAbovePct) {
    throw badRequest("Ambang LOLOS harus ≤ ambang BERISIKO");
  }
  return prisma.organization.update({ where: { id: ctx.orgId }, data });
}

export async function listUsers(ctx: Ctx) {
  return prisma.user.findMany({
    where: { orgId: ctx.orgId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true, email: true, name: true, role: true, isActive: true,
      lastLoginAt: true, createdAt: true, passwordHash: true, inviteExpiresAt: true,
    },
  }).then((rows) =>
    rows.map(({ passwordHash, ...u }) => ({ ...u, status: passwordHash ? "ACTIVE" : "INVITED" })),
  );
}

export const userUpdateSchema = z.object({
  name: z.string().min(2).optional(),
  role: z.enum([Role.ADMIN, Role.DOC_STAFF, Role.FIELD_OFFICER, Role.FORWARDER]).optional(),
  isActive: z.boolean().optional(),
});

export async function updateUser(ctx: Ctx, id: string, input: unknown) {
  const data = userUpdateSchema.parse(input);
  const user = await prisma.user.findFirst({ where: { id, orgId: ctx.orgId } });
  if (!user) throw notFound();
  if (id === ctx.userId && (data.isActive === false || (data.role && data.role !== ctx.role))) {
    throw badRequest("Tidak dapat menonaktifkan atau mengubah peran akun sendiri");
  }
  return prisma.user.update({
    where: { id },
    data,
    select: { id: true, email: true, name: true, role: true, isActive: true },
  });
}

export async function listAuditLogs(
  ctx: Ctx,
  q: { entity?: string; entityId?: string; action?: string; take?: number; cursor?: string },
) {
  const where = {
    ...(ctx.role === "SUPER_ADMIN" ? {} : { orgId: ctx.orgId }),
    ...(q.entity ? { entity: q.entity } : {}),
    ...(q.entityId ? { entityId: q.entityId } : {}),
    ...(q.action ? { action: q.action } : {}),
  };
  const take = Math.min(q.take ?? 50, 200);
  const rows = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: take + 1,
    ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
  });
  const actorIds = [...new Set(rows.map((r) => r.actorId).filter(Boolean))] as string[];
  const actors = await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } });
  const names = new Map(actors.map((a) => [a.id, a.name]));
  return {
    items: rows.slice(0, take).map((r) => ({ ...r, actorName: r.actorId ? names.get(r.actorId) ?? null : null })),
    nextCursor: rows.length > take ? rows[take - 1].id : null,
  };
}
