import clsx from "clsx";
import Link from "next/link";
import type { ReactNode } from "react";

export { clsx as cx };

type Tone = "ok" | "warn" | "danger" | "err" | "info" | "neutral" | "primary";

const toneClass: Record<Tone, string> = {
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  danger: "bg-danger-soft text-danger",
  err: "bg-err-soft text-err",
  info: "bg-info-soft text-info",
  neutral: "bg-neutral-soft text-fg-2",
  primary: "bg-primary-soft text-primary",
};

const dotClass: Record<Tone, string> = {
  ok: "bg-ok",
  warn: "bg-warn",
  danger: "bg-danger",
  err: "bg-err",
  info: "bg-info",
  neutral: "bg-muted",
  primary: "bg-primary",
};

/** Rounded status pill with a leading dot (reference: "● Available"). */
export function Pill({ tone = "neutral", dot = true, children, className }: { tone?: Tone; dot?: boolean; children: ReactNode; className?: string }) {
  return (
    <span className={clsx("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold", toneClass[tone], className)}>
      {dot && <span className={clsx("size-1.5 rounded-full", dotClass[tone])} />}
      {children}
    </span>
  );
}

/** Small rectangular tag (reference: "🔒 Controlled", "❄ 2–8 °C"). */
export function Tag({ tone = "neutral", icon, children }: { tone?: Tone; icon?: ReactNode; children: ReactNode }) {
  return (
    <span className={clsx("inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium", toneClass[tone])}>
      {icon}
      {children}
    </span>
  );
}

export function CountBadge({ n, tone = "neutral" }: { n: number; tone?: "neutral" | "err" }) {
  return (
    <span className={clsx("ml-1.5 rounded-md px-1.5 py-0.5 text-[11px] font-semibold", tone === "err" ? "bg-err-soft text-err" : "bg-neutral-soft text-fg-2")}>
      {n}
    </span>
  );
}

export function PageHeader({ title, subtitle, actions, back }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {back && (
          <Link href={back.href} className="mb-2 inline-block text-xs font-semibold text-muted hover:text-primary">
            ← {back.label}
          </Link>
        )}
        <h1 className="text-[26px] font-bold tracking-tight text-fg sm:text-[30px]">{title}</h1>
        {subtitle && <p className="mt-1.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function TabLinks({ tabs, active }: { tabs: { href: string; label: string; count?: number; key: string }[]; active: string }) {
  return (
    <div className="mb-6 inline-flex max-w-full gap-1 overflow-x-auto rounded-2xl bg-surface-2 p-1.5">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          scroll={false}
          className={clsx(
            "whitespace-nowrap rounded-xl px-4 py-2 text-sm font-semibold transition-colors",
            t.key === active ? "bg-surface text-fg shadow-card" : "text-fg-2 hover:text-fg",
          )}
        >
          {t.label}
          {t.count !== undefined && <CountBadge n={t.count} />}
        </Link>
      ))}
    </div>
  );
}

export function Card({ children, className, title, actions }: { children: ReactNode; className?: string; title?: ReactNode; actions?: ReactNode }) {
  return (
    <section className={clsx("card p-6", className)}>
      {(title || actions) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 className="text-base font-bold text-fg">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function TableCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={clsx("card p-3 sm:p-4", className)}>
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}

export function Table({ head, children }: { head: ReactNode[]; children: ReactNode }) {
  return (
    <table className="w-full min-w-[640px] border-separate border-spacing-0">
      <thead className="table-head">
        <tr>
          {head.map((h, i) => (
            <th key={i}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}

export function Empty({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <p className="text-sm font-semibold text-fg">{title}</p>
      {hint && <p className="mt-1 max-w-md text-sm text-muted">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Stat({ label, value, hint, tone = "neutral", icon }: { label: string; value: ReactNode; hint?: ReactNode; tone?: Tone; icon?: ReactNode }) {
  return (
    <div className="card flex items-start justify-between gap-3 p-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">{label}</p>
        <p className="mt-2 text-[28px] font-bold leading-none tracking-tight text-fg">{value}</p>
        {hint && <p className="mt-2 text-xs text-muted">{hint}</p>}
      </div>
      {icon && <div className={clsx("grid size-10 place-items-center rounded-xl", toneClass[tone])}>{icon}</div>}
    </div>
  );
}

export function KV({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
      {items.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-xs font-semibold text-muted">{k}</dt>
          <dd className="mt-0.5 break-words text-sm text-fg">{v ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Alert({ tone = "info", title, children }: { tone?: Tone; title?: ReactNode; children?: ReactNode }) {
  return (
    <div className={clsx("rounded-xl px-4 py-3 text-sm", toneClass[tone])}>
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={clsx(title && "mt-0.5", "opacity-90")}>{children}</div>}
    </div>
  );
}
