"use client";

import { CloudOff, CloudUpload, Coffee, Home, MapPinned, RefreshCw, ShoppingBasket, Users, Wifi } from "lucide-react";
import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { cx } from "@/components/ui";
import { idb, queue, type LocalRecord, type QueuedOp } from "@/lib/field/store";
import { AuthError, syncAll, type Snapshot } from "@/lib/field/sync";
import { HomeScreen } from "./screens/home";
import { FarmerScreen } from "./screens/farmer";
import { PlotScreen } from "./screens/plot";
import { PurchaseScreen } from "./screens/purchase";

export type Rules = { maxGpsAccuracyM: number; polygonRequiredAboveHa: number };
export type FarmerOption = { key: string; id?: string; clientId?: string; name: string; village?: string; pending: boolean };
export type PlotOption = { key: string; id?: string; clientId?: string; name: string; farmerKey: string; pending: boolean };

type Ctx = {
  rules: Rules;
  online: boolean;
  snapshot: Snapshot | null;
  locals: LocalRecord[];
  ops: QueuedOp[];
  lastSync: string | null;
  syncing: boolean;
  syncError: string | null;
  farmers: FarmerOption[];
  plots: PlotOption[];
  refresh: () => Promise<void>;
  sync: () => Promise<void>;
};

const FieldCtx = createContext<Ctx | null>(null);
export const useField = () => useContext(FieldCtx)!;

export function FieldApp({ user, orgName, rules }: { user: { name: string; role: string; canPurchase: boolean }; orgName: string; rules: Rules }) {
  const [tab, setTab] = useState<"home" | "farmer" | "plot" | "purchase">("home");
  const [online, setOnline] = useState(true);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [locals, setLocals] = useState<LocalRecord[]>([]);
  const [ops, setOps] = useState<QueuedOp[]>([]);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [snap, loc, q, ls] = await Promise.all([idb.get<Snapshot>("meta", "snapshot"), idb.all<LocalRecord>("local"), queue(), idb.get<string>("meta", "lastSync")]);
    setSnapshot(snap ?? null);
    setLocals(loc);
    setOps(q);
    setLastSync(ls ?? null);
  }, []);

  const sync = useCallback(async () => {
    if (!navigator.onLine) return;
    setSyncing(true);
    setSyncError(null);
    try {
      await syncAll();
    } catch (e) {
      setSyncError(e instanceof AuthError ? e.message : e instanceof Error ? e.message : "Sinkron gagal");
    } finally {
      setSyncing(false);
      await refresh();
    }
  }, [refresh]);

  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    const up = () => { setOnline(true); void sync(); };
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    // initial state from the browser + local store, then a first sync
    const t = setTimeout(() => { setOnline(navigator.onLine); void refresh().then(sync); }, 0);
    const iv = setInterval(() => { if (navigator.onLine) void sync(); }, 60_000);
    return () => {
      clearTimeout(t);
      clearInterval(iv);
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, [refresh, sync]);

  const farmers = useMemo<FarmerOption[]>(() => {
    const fromServer: FarmerOption[] = (snapshot?.farmers ?? []).map((f) => ({ key: f.id, id: f.id, clientId: f.clientId ?? undefined, name: f.fullName, village: f.village, pending: false }));
    const known = new Set(fromServer.map((f) => f.clientId).filter(Boolean));
    const pending: FarmerOption[] = locals
      .filter((l) => l.kind === "farmer" && !known.has(l.clientId))
      .map((l) => ({ key: l.serverId ?? l.clientId, id: l.serverId, clientId: l.clientId, name: l.name, pending: !l.serverId }));
    return [...pending, ...fromServer];
  }, [snapshot, locals]);

  const plots = useMemo<PlotOption[]>(() => {
    const byFarmerId = new Map(farmers.map((f) => [f.id ?? f.clientId, f.key]));
    const fromServer: PlotOption[] = (snapshot?.plots ?? []).map((p) => ({ key: p.id, id: p.id, clientId: p.clientId ?? undefined, name: p.label ?? `Kebun ${p.id.slice(0, 6)}`, farmerKey: byFarmerId.get(p.farmerId) ?? p.farmerId, pending: false }));
    const known = new Set(fromServer.map((p) => p.clientId).filter(Boolean));
    const pending: PlotOption[] = locals
      .filter((l) => l.kind === "plot" && !known.has(l.clientId))
      .map((l) => ({ key: l.serverId ?? l.clientId, id: l.serverId, clientId: l.clientId, name: l.name, farmerKey: (l.farmerRef?.id && byFarmerId.get(l.farmerRef.id)) || byFarmerId.get(l.farmerRef?.clientId ?? "") || "", pending: !l.serverId }));
    return [...pending, ...fromServer];
  }, [snapshot, locals, farmers]);

  const value: Ctx = { rules, online, snapshot, locals, ops, lastSync, syncing, syncError, farmers, plots, refresh, sync };
  const pending = ops.filter((o) => o.status === "pending").length;
  const failed = ops.filter((o) => o.status === "failed").length;

  const tabs = [
    { key: "home", label: "Beranda", icon: Home },
    { key: "farmer", label: "Petani", icon: Users },
    { key: "plot", label: "Kebun", icon: MapPinned },
    ...(user.canPurchase ? [{ key: "purchase" as const, label: "Pembelian", icon: ShoppingBasket }] : []),
  ] as const;

  return (
    <FieldCtx.Provider value={value}>
      <div className="mx-auto flex min-h-screen max-w-xl flex-col bg-bg">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-line bg-surface/95 px-4 py-3 backdrop-blur">
          <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-fg"><Coffee className="size-4" /></span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-fg">{orgName}</p>
            <p className="truncate text-xs text-muted">{user.name} · {user.role}</p>
          </div>
          <button
            type="button"
            onClick={() => void sync()}
            disabled={!online || syncing}
            className={cx("inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold", online ? "bg-ok-soft text-ok" : "bg-warn-soft text-warn")}
          >
            {syncing ? <RefreshCw className="size-3.5 animate-spin" /> : online ? (pending ? <CloudUpload className="size-3.5" /> : <Wifi className="size-3.5" />) : <CloudOff className="size-3.5" />}
            {online ? (pending ? `${pending} antre` : "Online") : `Offline${pending ? ` · ${pending}` : ""}`}
            {failed > 0 && <span className="rounded-full bg-err px-1.5 text-white">{failed}</span>}
          </button>
        </header>

        <main className="flex-1 px-4 pb-28 pt-4">
          {tab === "home" && <HomeScreen go={(t) => setTab(t)} />}
          {tab === "farmer" && <FarmerScreen onDone={() => setTab("home")} />}
          {tab === "plot" && <PlotScreen onDone={() => setTab("home")} />}
          {tab === "purchase" && user.canPurchase && <PurchaseScreen onDone={() => setTab("home")} />}
          <p className="mt-8 text-center text-xs text-muted"><Link href="/dashboard" className="underline">Buka dasbor web</Link></p>
        </main>

        <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
          <div className="mx-auto flex max-w-xl">
            {tabs.map((t) => (
              <button key={t.key} type="button" onClick={() => setTab(t.key)} className={cx("flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-semibold", tab === t.key ? "text-primary" : "text-muted")}>
                <t.icon className="size-5" />
                {t.label}
              </button>
            ))}
          </div>
        </nav>
      </div>
    </FieldCtx.Provider>
  );
}
