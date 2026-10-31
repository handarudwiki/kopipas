import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/guard";
import { can } from "@/lib/auth/rbac";
import { verifySession } from "@/lib/auth/session";
import { acceptInvite, inviteUser, login } from "@/server/auth";
import { updateUser } from "@/server/org";
import { as, makeOrg } from "./helpers";

describe("F1.1 login + invite", () => {
  it("invited user can set a password, log in, and is scoped to the inviting org", async () => {
    const { ctx } = await makeOrg("ADMIN");
    const email = `invitee-${Date.now()}@test.id`;
    const inv = await as(ctx, () => inviteUser(ctx, { email, name: "Invitee", role: "DOC_STAFF" }));
    const token = inv.inviteUrl.split("/invite/")[1]!;

    // only the hash is stored
    const stored = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(stored.inviteTokenHash).not.toBe(token);
    expect(stored.passwordHash).toBeNull();

    await acceptInvite({ token, password: "rahasia-123" });
    const r = await login({ email, password: "rahasia-123" });
    const claims = await verifySession(r.token);
    expect(claims?.orgId).toBe(ctx.orgId);
    expect(claims?.role).toBe("DOC_STAFF");

    // token is single-use
    await expect(acceptInvite({ token, password: "another-123" })).rejects.toThrow(/tidak valid/);
  });

  it("rejects wrong password with 401", async () => {
    await expect(login({ email: "nobody@test.id", password: "x" })).rejects.toMatchObject({ status: 401 });
  });

  it("password is hashed (bcrypt)", async () => {
    const { ctx } = await makeOrg("ADMIN");
    const email = `hash-${Date.now()}@test.id`;
    const inv = await as(ctx, () => inviteUser(ctx, { email, name: "Hash", role: "FIELD_OFFICER" }));
    await acceptInvite({ token: inv.inviteUrl.split("/invite/")[1]!, password: "plaintext-pw" });
    const u = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(u.passwordHash).toMatch(/^\$2[aby]\$/);
  });
});

describe("F1.2 roles", () => {
  it("matrix matches BRD roles", () => {
    expect(can("ADMIN", "pack:generate")).toBe(true);
    expect(can("DOC_STAFF", "pack:generate")).toBe(false);
    expect(can("DOC_STAFF", "shipment:write")).toBe(true);
    expect(can("FIELD_OFFICER", "shipment:read")).toBe(false);
    expect(can("FIELD_OFFICER", "sync")).toBe(true);
    expect(can("ADMIN", "risk:decide")).toBe(true);
    expect(can("DOC_STAFF", "risk:decide")).toBe(false);
    expect(can("SUPER_ADMIN", "dataset:manage")).toBe(true);
    expect(can("ADMIN", "dataset:manage")).toBe(false);
  });

  it("denied action returns 403 and is written to the audit log", async () => {
    const { ctx } = await makeOrg("FIELD_OFFICER");
    await expect(requirePermission(ctx, "user:manage")).rejects.toMatchObject({ status: 403 });
    const log = await prisma.auditLog.findFirst({ where: { actorId: ctx.userId, action: "FORBIDDEN" } });
    expect(log).not.toBeNull();
    expect(log?.meta).toMatchObject({ permission: "user:manage", role: "FIELD_OFFICER" });
  });
});

describe("F1.3 audit log", () => {
  it("records who, old value and new value on update, without secrets", async () => {
    const { ctx } = await makeOrg("ADMIN");
    const other = await as(ctx, () => prisma.user.create({ data: { orgId: ctx.orgId, email: `a-${Date.now()}@t.id`, name: "Before", role: "DOC_STAFF", passwordHash: "secret-hash" } }));
    await as(ctx, () => updateUser(ctx, other.id, { name: "After" }));
    const log = await prisma.auditLog.findFirstOrThrow({ where: { entity: "user", entityId: other.id, action: "UPDATE" } });
    expect(log.actorId).toBe(ctx.userId);
    expect(log.orgId).toBe(ctx.orgId);
    expect((log.before as { name: string }).name).toBe("Before");
    expect((log.after as { name: string }).name).toBe("After");
    expect(JSON.stringify(log)).not.toContain("secret-hash");
  });

  it("user cannot update a user of another org", async () => {
    const a = await makeOrg("ADMIN");
    const b = await makeOrg("ADMIN");
    await expect(as(a.ctx, () => updateUser(a.ctx, b.user.id, { name: "hack" }))).rejects.toMatchObject({ status: 404 });
  });
});
