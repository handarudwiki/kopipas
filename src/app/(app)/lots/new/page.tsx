import type { Metadata } from "next";
import { getCtxWith } from "@/lib/auth/current";
import { prisma } from "@/lib/db";
import { num } from "@/lib/format";
import { parseSettings } from "@/lib/settings";
import { listPurchases, nextLotCode } from "@/server/lots";
import { PageHeader } from "@/components/ui";
import { LotBuilder } from "../lot-builder";

export const metadata: Metadata = { title: "Lot baru" };

export default async function NewLotPage() {
  const ctx = await getCtxWith("lot:write");
  const [purchases, org, code] = await Promise.all([listPurchases(ctx, { unassigned: true }), prisma.organization.findUniqueOrThrow({ where: { id: ctx.orgId } }), nextLotCode(ctx)]);
  return (
    <>
      <PageHeader back={{ href: "/lots", label: "Lot" }} title="Susun lot" subtitle="Pilih pembelian; berat tersedia dihitung dengan rasio konversi organisasi (F4.3)" />
      <LotBuilder
        defaultCode={code}
        conversion={parseSettings(org.settings).conversion}
        purchases={purchases.map((p) => ({ id: p.id, date: p.date.toISOString().slice(0, 10), farmer: p.farmer.fullName, plot: p.plot.label ?? "Kebun", riskStatus: p.plot.riskStatus, weightKg: num(p.weightKg), form: p.form }))}
      />
    </>
  );
}
