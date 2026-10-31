import { prisma } from "@/lib/db";
import { runAsActor, type Ctx } from "@/lib/context";
import type { Role } from "@/generated/prisma/enums";
import { setJobMode } from "@/lib/jobs";
import "@/server/register";

// run async jobs inline so tests are deterministic
setJobMode("inline");

let n = 0;

/** Creates an isolated organisation + user and returns its Ctx. */
export async function makeOrg(role: Role = "ADMIN", name?: string) {
  n += 1;
  const tag = `${Date.now()}-${n}-${Math.random().toString(36).slice(2, 7)}`;
  const org = await prisma.organization.create({ data: { name: name ?? `Org ${tag}`, country: "ID" } });
  const user = await prisma.user.create({
    data: { orgId: org.id, email: `u-${tag}@test.id`, name: `User ${tag}`, role, passwordHash: "x" },
  });
  const ctx: Ctx = { userId: user.id, orgId: org.id, role, name: user.name, email: user.email };
  return { org, user, ctx };
}

export async function addUser(orgId: string, role: Role) {
  n += 1;
  const tag = `${Date.now()}-${n}-${Math.random().toString(36).slice(2, 7)}`;
  const user = await prisma.user.create({ data: { orgId, email: `u-${tag}@test.id`, name: `User ${tag}`, role, passwordHash: "x" } });
  const ctx: Ctx = { userId: user.id, orgId, role, name: user.name, email: user.email };
  return ctx;
}

/** Run service code as the given actor, like route() does. */
export const as = <T>(ctx: Ctx, fn: () => Promise<T>) => runAsActor({ orgId: ctx.orgId, actorId: ctx.userId }, fn);
