import type { Metadata } from "next";
import Link from "next/link";
import { getCtx } from "@/lib/auth/current";
import { globalSearch } from "@/server/dashboard";
import { Card, Empty, PageHeader } from "@/components/ui";
import { RiskPill, ShipmentStatusPill } from "@/components/status";

export const metadata: Metadata = { title: "Pencarian" };

export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  const ctx = await getCtx();
  const q = typeof (await searchParams).q === "string" ? String((await searchParams).q) : "";
  const r = await globalSearch(ctx, q);
  const total = r.shipments.length + r.farmers.length + r.plots.length + r.lots.length;
  return (
    <>
      <PageHeader title="Pencarian" subtitle={q ? `${total} hasil untuk “${q}”` : "Ketik minimal 2 huruf di kolom pencarian"} />
      {total === 0 ? (
        <Card><Empty title="Tidak ada hasil" /></Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {r.shipments.length > 0 && (
            <Card title="Pengiriman">
              <ul className="divide-y divide-line">{r.shipments.map((s) => <li key={s.id} className="flex items-center justify-between py-2.5"><Link href={`/shipments/${s.id}`} className="font-semibold hover:text-primary">{s.reference} <span className="font-normal text-muted">· {s.buyerName}</span></Link><ShipmentStatusPill status={s.status} /></li>)}</ul>
            </Card>
          )}
          {r.farmers.length > 0 && (
            <Card title="Petani">
              <ul className="divide-y divide-line">{r.farmers.map((f) => <li key={f.id} className="py-2.5"><Link href={`/farmers/${f.id}`} className="font-semibold hover:text-primary">{f.fullName}</Link> <span className="text-sm text-muted">· {f.village}, {f.regency}</span></li>)}</ul>
            </Card>
          )}
          {r.plots.length > 0 && (
            <Card title="Kebun">
              <ul className="divide-y divide-line">{r.plots.map((p) => <li key={p.id} className="flex items-center justify-between py-2.5"><Link href={`/plots/${p.id}`} className="font-semibold hover:text-primary">{p.label} <span className="font-normal text-muted">· {p.farmer.fullName}</span></Link><RiskPill status={p.riskStatus} /></li>)}</ul>
            </Card>
          )}
          {r.lots.length > 0 && (
            <Card title="Lot">
              <ul className="divide-y divide-line">{r.lots.map((l) => <li key={l.id} className="py-2.5"><Link href={`/lots/${l.id}`} className="font-semibold hover:text-primary">{l.code}</Link></li>)}</ul>
            </Card>
          )}
        </div>
      )}
    </>
  );
}
