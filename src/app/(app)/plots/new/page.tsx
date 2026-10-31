import type { Metadata } from "next";
import { getCtxWith } from "@/lib/auth/current";
import { prisma } from "@/lib/db";
import { parseSettings } from "@/lib/settings";
import { PageHeader } from "@/components/ui";
import { PlotForm } from "../plot-form";

export const metadata: Metadata = { title: "Kebun baru" };

export default async function NewPlotPage({ searchParams }: PageProps<"/plots/new">) {
  const ctx = await getCtxWith("plot:write");
  const sp = await searchParams;
  const farmerId = typeof sp.farmerId === "string" ? sp.farmerId : undefined;
  const [farmers, org] = await Promise.all([
    prisma.farmer.findMany({ where: { orgId: ctx.orgId }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true } }),
    prisma.organization.findUniqueOrThrow({ where: { id: ctx.orgId } }),
  ]);
  return (
    <>
      <PageHeader back={farmerId ? { href: `/farmers/${farmerId}`, label: "Petani" } : { href: "/plots", label: "Kebun" }} title="Petakan kebun" subtitle="Ketuk sudut kebun di peta, atau impor GeoJSON/KML dari GPS/QGIS" />
      <PlotForm farmers={farmers} farmerId={farmerId} polygonAboveHa={parseSettings(org.settings).risk.polygonRequiredAboveHa} />
    </>
  );
}
