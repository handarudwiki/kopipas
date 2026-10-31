import type { Metadata, Viewport } from "next";
import { getCtx } from "@/lib/auth/current";
import { can, ROLE_LABEL } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db";
import { parseSettings } from "@/lib/settings";
import { redirect } from "next/navigation";
import { FieldApp } from "./field-app";

export const metadata: Metadata = { title: "Aplikasi Lapangan", manifest: "/manifest.webmanifest" };
export const viewport: Viewport = { themeColor: "#0e8f7e", width: "device-width", initialScale: 1, maximumScale: 1 };

export default async function FieldPage() {
  const ctx = await getCtx();
  if (!can(ctx.role, "sync")) redirect("/forbidden");
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: ctx.orgId } });
  const s = parseSettings(org.settings);
  return (
    <FieldApp
      user={{ name: ctx.name, role: ROLE_LABEL[ctx.role], canPurchase: can(ctx.role, "purchase:write") }}
      orgName={org.name}
      rules={{ maxGpsAccuracyM: s.risk.maxGpsAccuracyM, polygonRequiredAboveHa: s.risk.polygonRequiredAboveHa }}
    />
  );
}
