import type { Metadata } from "next";
import { getCtxWith } from "@/lib/auth/current";
import { getOrg } from "@/server/org";
import { PageHeader } from "@/components/ui";
import { OrgForm } from "./org-form";

export const metadata: Metadata = { title: "Organisasi" };

export default async function OrgPage() {
  const ctx = await getCtxWith("settings:manage");
  const org = await getOrg(ctx);
  return (
    <>
      <PageHeader title="Organisasi" subtitle="Profil eksportir, ambang risiko, rasio konversi dan toleransi validasi" />
      <OrgForm org={{ name: org.name, npwp: org.npwp, address: org.address, country: org.country, settings: org.settings }} />
    </>
  );
}
