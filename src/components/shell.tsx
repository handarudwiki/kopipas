"use client";

import clsx from "clsx";
import {
  AlertCircle, BadgeCheck, Boxes, Building2, ChevronDown, Coffee, Database, FileStack, FileText,
  LayoutDashboard, LogOut, Map, MapPinned, Menu, Moon, Package, ScrollText, Search, Settings,
  ShieldAlert, ShoppingBasket, Smartphone, Sun, Users, X, BookOpenCheck,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ComponentType } from "react";
import { initials } from "@/lib/format";

type NavItem = { href: string; label: string; icon: string; badge?: number; perm: boolean };
export type NavSection = { title: string; items: NavItem[] };

const ICONS: Record<string, ComponentType<{ className?: string }>> = {
  dashboard: LayoutDashboard, farmers: Users, plots: MapPinned, map: Map, risk: ShieldAlert,
  purchases: ShoppingBasket, lots: Boxes, shipments: Package, packs: BadgeCheck, field: Smartphone,
  users: Users, settings: Settings, audit: ScrollText, tenants: Building2, datasets: Database,
  rules: BookOpenCheck, docs: FileStack, findings: AlertCircle, report: FileText,
};

export function Logo({ orgName }: { orgName: string }) {
  return (
    <Link href="/dashboard" className="flex items-center gap-3">
      <span className="grid size-11 place-items-center rounded-xl bg-primary text-primary-fg">
        <Coffee className="size-5" />
      </span>
      <span className="min-w-0">
        <span className="block text-[17px] font-bold leading-tight text-fg">KopiPass</span>
        <span className="block truncate text-xs text-muted">{orgName}</span>
      </span>
    </Link>
  );
}

function NavLinks({ sections, onNavigate }: { sections: NavSection[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex-1 space-y-6 overflow-y-auto px-4 pb-6">
      {sections.map((s) => {
        const items = s.items.filter((i) => i.perm);
        if (!items.length) return null;
        return (
          <div key={s.title}>
            <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">{s.title}</p>
            <ul className="space-y-0.5">
              {items.map((i) => {
                const Icon = ICONS[i.icon] ?? LayoutDashboard;
                const active = pathname === i.href || pathname.startsWith(`${i.href}/`);
                return (
                  <li key={i.href}>
                    <Link
                      href={i.href}
                      onClick={onNavigate}
                      className={clsx(
                        "flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium transition-colors",
                        active ? "bg-primary text-primary-fg shadow-[0_6px_16px_-6px_var(--primary)]" : "text-fg-2 hover:bg-surface-2 hover:text-fg",
                      )}
                    >
                      <Icon className="size-[18px] shrink-0" />
                      <span className="flex-1 truncate">{i.label}</span>
                      {!!i.badge && (
                        <span className={clsx("rounded-md px-1.5 py-0.5 text-[11px] font-bold", active ? "bg-white/20 text-white" : "bg-err-soft text-err")}>
                          {i.badge}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

function UserCard({ name, roleLabel }: { name: string; roleLabel: string }) {
  const router = useRouter();
  return (
    <div className="m-4 flex items-center gap-3 rounded-2xl bg-surface-2 p-3.5">
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary-soft text-sm font-bold text-primary">{initials(name)}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-fg">{name}</p>
        <p className="truncate text-xs text-muted">{roleLabel}</p>
      </div>
      <button
        type="button"
        aria-label="Keluar"
        title="Keluar"
        className="rounded-lg p-2 text-fg-2 hover:bg-surface hover:text-err"
        onClick={async () => {
          await fetch("/api/v1/auth/logout", { method: "POST" });
          router.push("/login");
          router.refresh();
        }}
      >
        <LogOut className="size-[18px]" />
      </button>
    </div>
  );
}

export function Sidebar({ sections, orgName, userName, roleLabel }: { sections: NavSection[]; orgName: string; userName: string; roleLabel: string }) {
  const [open, setOpen] = useState(false);

  const body = (
    <>
      <div className="px-7 pb-8 pt-7">
        <Logo orgName={orgName} />
      </div>
      <NavLinks sections={sections} onNavigate={() => setOpen(false)} />
      <UserCard name={userName} roleLabel={roleLabel} />
    </>
  );

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[264px] flex-col border-r border-line bg-sidebar lg:flex">{body}</aside>
      <button type="button" className="fixed left-4 top-4 z-40 rounded-xl border border-line bg-surface p-2.5 lg:hidden" onClick={() => setOpen(true)} aria-label="Buka menu">
        <Menu className="size-5" />
      </button>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 lg:hidden" onClick={() => setOpen(false)}>
          <aside className="flex h-full w-[280px] flex-col bg-sidebar" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="absolute left-[244px] top-4 rounded-lg p-1.5 text-fg-2" onClick={() => setOpen(false)} aria-label="Tutup menu">
              <X className="size-5" />
            </button>
            {body}
          </aside>
        </div>
      )}
    </>
  );
}

export function ThemeToggle() {
  return (
    <button
      type="button"
      aria-label="Ganti tema"
      className="grid size-11 place-items-center rounded-xl border border-line bg-surface text-fg-2 hover:text-fg"
      onClick={() => {
        const next = document.documentElement.dataset.theme !== "dark";
        document.documentElement.dataset.theme = next ? "dark" : "light";
        try {
          localStorage.setItem("kp-theme", next ? "dark" : "light");
        } catch {}
      }}
    >
      <Moon className="size-[18px] dark:hidden" />
      <Sun className="hidden size-[18px] dark:block" />
    </button>
  );
}

export function Topbar({ orgName, alerts }: { orgName: string; alerts: number }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-bg/85 backdrop-blur">
      <div className="flex items-center gap-3 py-4 pl-16 pr-4 sm:pr-8 lg:px-10">
        <form
          className="relative min-w-0 max-w-[620px] flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            if (q.trim()) router.push(`/search?q=${encodeURIComponent(q.trim())}`);
          }}
        >
          <Search className="pointer-events-none absolute left-4 top-1/2 size-[18px] -translate-y-1/2 text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari pengiriman, petani, lot (SHP-…)"
            className="h-12 w-full rounded-2xl border border-line bg-surface pl-11 pr-4 text-sm text-fg outline-none placeholder:text-muted focus:border-primary"
          />
        </form>
        <div className="ml-auto flex items-center gap-2.5">
          <Link href="/settings/org" className="hidden h-11 items-center gap-2.5 rounded-xl border border-line bg-surface px-4 text-sm font-semibold text-fg md:flex">
            <Building2 className="size-[18px] text-muted" />
            <span className="max-w-[240px] truncate">{orgName}</span>
            <ChevronDown className="size-4 text-muted" />
          </Link>
          <ThemeToggle />
          <Link href="/alerts" aria-label="Peringatan" className="relative grid size-11 place-items-center rounded-xl border border-line bg-surface text-fg-2 hover:text-fg">
            <AlertCircle className="size-[18px]" />
            {alerts > 0 && (
              <span className="absolute -right-1.5 -top-1.5 grid min-w-5 place-items-center rounded-full bg-err px-1 text-[11px] font-bold leading-5 text-white">
                {alerts > 99 ? "99+" : alerts}
              </span>
            )}
          </Link>
        </div>
      </div>
    </header>
  );
}
