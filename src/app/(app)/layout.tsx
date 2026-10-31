import { getCtx } from "@/lib/auth/current";
import { can, ROLE_LABEL } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db";
import { Sidebar, Topbar, type NavSection } from "@/components/shell";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const ctx = await getCtx();
  const [org, openErrors, plotsToVerify] = await Promise.all([
    prisma.organization.findUnique({ where: { id: ctx.orgId }, select: { name: true } }),
    can(ctx.role, "shipment:read")
      ? prisma.finding.count({ where: { orgId: ctx.orgId, status: "OPEN", severity: "ERROR" } })
      : 0,
    can(ctx.role, "plot:read")
      ? prisma.plot.count({ where: { orgId: ctx.orgId, riskStatus: { in: ["REVIEW", "RISK", "ERROR"] } } })
      : 0,
  ]);
  const r = ctx.role;

  const sections: NavSection[] = [
    {
      title: "Ringkasan",
      items: [{ href: "/dashboard", label: "Dasbor", icon: "dashboard", perm: true }],
    },
    {
      title: "Lapangan",
      items: [
        { href: "/farmers", label: "Petani", icon: "farmers", perm: can(r, "farmer:read") },
        { href: "/plots", label: "Kebun", icon: "plots", perm: can(r, "plot:read") },
        { href: "/map", label: "Peta Kebun", icon: "map", perm: can(r, "plot:read") },
        { href: "/risk", label: "Cek Risiko", icon: "risk", badge: plotsToVerify, perm: can(r, "plot:read") },
        { href: "/field", label: "Aplikasi Lapangan", icon: "field", perm: can(r, "sync") },
      ],
    },
    {
      title: "Rantai Pasok",
      items: [
        { href: "/purchases", label: "Pembelian", icon: "purchases", perm: can(r, "purchase:read") },
        { href: "/lots", label: "Lot", icon: "lots", perm: can(r, "lot:read") },
      ],
    },
    {
      title: "Ekspor",
      items: [
        { href: "/shipments", label: "Pengiriman", icon: "shipments", badge: openErrors, perm: can(r, "shipment:read") },
        { href: "/packs", label: "Paket Bukti", icon: "packs", perm: can(r, "pack:read") },
      ],
    },
    {
      title: "Pengaturan",
      items: [
        { href: "/settings/users", label: "Pengguna & Peran", icon: "users", perm: can(r, "user:manage") },
        { href: "/settings/org", label: "Organisasi", icon: "settings", perm: can(r, "settings:manage") },
        { href: "/settings/rules", label: "Pustaka Aturan", icon: "rules", perm: can(r, "rules:read") },
        { href: "/settings/audit", label: "Audit Log", icon: "audit", perm: can(r, "audit:read") },
      ],
    },
    {
      title: "Super Admin",
      items: [
        { href: "/admin/tenants", label: "Tenant", icon: "tenants", perm: can(r, "tenant:manage") },
        { href: "/admin/datasets", label: "Dataset Referensi", icon: "datasets", perm: can(r, "dataset:manage") },
      ],
    },
  ];

  return (
    <div className="min-h-screen">
      <Sidebar sections={sections} orgName={org?.name ?? ""} userName={ctx.name} roleLabel={ROLE_LABEL[ctx.role]} />
      <div className="lg:pl-[264px]">
        <Topbar orgName={org?.name ?? ""} alerts={openErrors + plotsToVerify} />
        <main className="mx-auto max-w-[1440px] px-4 py-8 sm:px-8 lg:px-10 lg:py-12">{children}</main>
      </div>
    </div>
  );
}
