import type { Metadata } from "next";
import { getCtx } from "@/lib/auth/current";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Dasbor" };

export default async function DashboardPage() {
  const ctx = await getCtx();
  return <PageHeader title={`Halo, ${ctx.name.split(" ")[0]}`} subtitle="Ringkasan kesiapan paket bukti EUDR organisasi Anda" />;
}
