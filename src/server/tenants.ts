import { z } from "zod";
import { prisma } from "@/lib/db";
import type { Ctx } from "@/lib/context";
import { inviteUser } from "./auth";

/** Super admin — tenant (exporter organisation) management. */
export async function listTenants() {
  const orgs = await prisma.organization.findMany({
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { users: true, farmers: true, shipments: true } } },
  });
  const plots = await prisma.plot.groupBy({ by: ["orgId"], _count: true });
  const byOrg = new Map(plots.map((p) => [p.orgId, p._count]));
  return orgs.map((o) => ({ ...o, plotCount: byOrg.get(o.id) ?? 0 }));
}

export const tenantSchema = z.object({
  name: z.string().trim().min(2).max(200),
  npwp: z.string().trim().max(32).nullish(),
  address: z.string().trim().max(500).nullish(),
  country: z.string().trim().length(2).default("ID"),
  adminEmail: z.string().email(),
  adminName: z.string().trim().min(2),
});

export async function createTenant(ctx: Ctx, input: unknown) {
  const d = tenantSchema.parse(input);
  const org = await prisma.organization.create({ data: { name: d.name, npwp: d.npwp ?? null, address: d.address ?? null, country: d.country.toUpperCase() } });
  const invite = await inviteUser(ctx, { email: d.adminEmail, name: d.adminName, role: "ADMIN", orgId: org.id });
  return { org, inviteUrl: invite.inviteUrl };
}
