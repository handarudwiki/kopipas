import { z } from "zod";
import { prisma } from "@/lib/db";
import type { Ctx } from "@/lib/context";
import { hashPassword, randomToken, sha256, verifyPassword } from "@/lib/crypto";
import { badRequest, conflict, forbidden, unauthorized } from "@/lib/errors";
import { signSession } from "@/lib/auth/session";
import { Role } from "@/generated/prisma/enums";

export const loginSchema = z.object({
  email: z.string().email().transform((s) => s.toLowerCase().trim()),
  password: z.string().min(1),
});

export async function login(input: z.input<typeof loginSchema>) {
  const { email, password } = loginSchema.parse(input);
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.isActive || !user.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
    await prisma.auditLog.create({
      data: { orgId: user?.orgId ?? null, entity: "auth", action: "LOGIN_FAILED", meta: { email } },
    });
    throw unauthorized("Email atau password salah");
  }
  await prisma.auditLog.create({
    data: { orgId: user.orgId, actorId: user.id, entity: "auth", entityId: user.id, action: "LOGIN" },
  });
  const token = await signSession({ sub: user.id, orgId: user.orgId, role: user.role });
  return {
    token,
    user: { id: user.id, email: user.email, name: user.name, role: user.role, orgId: user.orgId },
  };
}

export const INVITE_TTL_DAYS = 7;

export const inviteSchema = z.object({
  email: z.string().email().transform((s) => s.toLowerCase().trim()),
  name: z.string().min(2).max(120),
  role: z.enum([Role.ADMIN, Role.DOC_STAFF, Role.FIELD_OFFICER, Role.FORWARDER]),
  /** super admin may invite into another org (tenant bootstrap) */
  orgId: z.string().uuid().optional(),
});

/** F1.1 — invite a user into the caller's organisation. Returns a one-time token (only its hash is stored). */
export async function inviteUser(ctx: Ctx, input: z.input<typeof inviteSchema>) {
  const data = inviteSchema.parse(input);
  const orgId = ctx.role === "SUPER_ADMIN" && data.orgId ? data.orgId : ctx.orgId;
  if (data.orgId && data.orgId !== ctx.orgId && ctx.role !== "SUPER_ADMIN") throw forbidden();

  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing && existing.passwordHash) throw conflict("Email sudah terdaftar");
  if (existing && existing.orgId !== orgId) throw conflict("Email sudah diundang ke organisasi lain");

  const token = randomToken();
  const fields = {
    name: data.name,
    role: data.role,
    inviteTokenHash: sha256(token),
    inviteExpiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 864e5),
    isActive: true,
  };
  const user = existing
    ? await prisma.user.update({ where: { id: existing.id }, data: fields })
    : await prisma.user.create({ data: { ...fields, email: data.email, orgId, createdBy: ctx.userId } });

  const base = process.env.APP_URL ?? "http://localhost:3000";
  return {
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
    inviteUrl: `${base}/invite/${token}`,
    expiresAt: fields.inviteExpiresAt,
  };
}

export const acceptSchema = z.object({
  token: z.string().min(20),
  password: z.string().min(8, "Password minimal 8 karakter"),
  name: z.string().min(2).optional(),
});

export async function acceptInvite(input: z.input<typeof acceptSchema>) {
  const data = acceptSchema.parse(input);
  const user = await prisma.user.findUnique({ where: { inviteTokenHash: sha256(data.token) } });
  if (!user || !user.inviteExpiresAt || user.inviteExpiresAt < new Date()) {
    throw badRequest("Undangan tidak valid atau sudah kedaluwarsa");
  }
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await hashPassword(data.password),
      inviteTokenHash: null,
      inviteExpiresAt: null,
      name: data.name ?? user.name,
    },
  });
  const token = await signSession({ sub: updated.id, orgId: updated.orgId, role: updated.role });
  return { token, user: { id: updated.id, email: updated.email, name: updated.name, role: updated.role } };
}

export async function inviteInfo(token: string) {
  const user = await prisma.user.findUnique({
    where: { inviteTokenHash: sha256(token) },
    include: { org: { select: { name: true } } },
  });
  if (!user || !user.inviteExpiresAt || user.inviteExpiresAt < new Date()) return null;
  return { email: user.email, name: user.name, role: user.role, orgName: user.org.name };
}
