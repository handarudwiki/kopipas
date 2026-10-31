import { prisma } from "@/lib/db";
import type { Ctx } from "@/lib/context";
import { forbidden } from "@/lib/errors";
import { can, type Permission } from "./rbac";
import { verifySession } from "./session";

/** Resolve a JWT into a fresh Ctx (re-reads the user so deactivation takes effect immediately). */
export async function ctxFromToken(token: string | undefined | null): Promise<Ctx | null> {
  if (!token) return null;
  const claims = await verifySession(token);
  if (!claims) return null;
  const user = await prisma.user.findUnique({ where: { id: claims.sub } });
  if (!user || !user.isActive || !user.passwordHash || user.orgId !== claims.orgId) return null;
  return { userId: user.id, orgId: user.orgId, role: user.role, name: user.name, email: user.email };
}

/**
 * F1.2 — reject actions outside the user's role with HTTP 403 and record the attempt in the audit log.
 */
export async function requirePermission(ctx: Ctx, perm: Permission, target?: { entity: string; entityId?: string }) {
  if (can(ctx.role, perm)) return;
  await prisma.auditLog.create({
    data: {
      orgId: ctx.orgId,
      actorId: ctx.userId,
      entity: target?.entity ?? perm.split(":")[0],
      entityId: target?.entityId ?? null,
      action: "FORBIDDEN",
      meta: { permission: perm, role: ctx.role },
    },
  });
  throw forbidden();
}
