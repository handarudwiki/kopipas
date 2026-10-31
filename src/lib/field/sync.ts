"use client";

import { idb, queue, type LocalRecord, type QueuedOp } from "./store";

export type Snapshot = {
  farmers: { id: string; clientId: string | null; fullName: string; village: string; district: string; regency: string; province: string; phone: string | null }[];
  plots: { id: string; clientId: string | null; farmerId: string; label: string | null; declaredAreaHa: number; riskStatus: string; geomPoint: unknown }[];
  org: { name: string; settings: unknown };
  serverTime: string;
};

type Result = { opId: string; ok: boolean; id?: string; clientId?: string; error?: string; entity?: string };

class AuthError extends Error {}

async function uploadPhotos(op: QueuedOp): Promise<QueuedOp> {
  if (!op.photoBlobIds?.length) return op;
  const keys = [...((op.data.photoKeys as string[]) ?? [])];
  const remaining: string[] = [];
  for (const id of op.photoBlobIds) {
    const blob = await idb.get<Blob>("blobs", id);
    if (!blob) continue;
    const form = new FormData();
    form.append("file", new File([blob], `${id}.jpg`, { type: blob.type || "image/jpeg" }));
    const res = await fetch("/api/v1/sync/upload", { method: "POST", body: form, credentials: "same-origin" });
    if (res.status === 401) throw new AuthError("Sesi berakhir; masuk lagi saat online");
    if (!res.ok) {
      remaining.push(id);
      continue;
    }
    keys.push(((await res.json()) as { key: string }).key);
    await idb.del("blobs", id);
  }
  const next: QueuedOp = { ...op, data: { ...op.data, photoKeys: keys }, photoBlobIds: remaining };
  await idb.put("queue", next);
  return next;
}

/**
 * Push the queue to POST /api/v1/sync in order. Successful ops leave the queue; ops whose
 * references are not yet on the server stay pending; validation errors are marked failed.
 */
export async function pushQueue(): Promise<{ sent: number; ok: number; failed: number }> {
  let ops = (await queue()).filter((o) => o.status === "pending");
  if (!ops.length) return { sent: 0, ok: 0, failed: 0 };
  ops = await Promise.all(ops.map(uploadPhotos));
  const ready = ops.filter((o) => !o.photoBlobIds?.length).slice(0, 100);
  if (!ready.length) return { sent: 0, ok: 0, failed: 0 };

  const res = await fetch("/api/v1/sync", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ops: ready.map(({ opId, type, clientId, data, fieldTimes }) => ({ opId, type, clientId, data, fieldTimes })) }),
  });
  if (res.status === 401) throw new AuthError("Sesi berakhir; masuk lagi saat online");
  if (!res.ok) throw new Error(`Sinkron gagal (HTTP ${res.status})`);
  const { results } = (await res.json()) as { results: Result[] };

  let ok = 0;
  let failed = 0;
  for (const r of results) {
    const op = ready.find((o) => o.opId === r.opId);
    if (!op) continue;
    if (r.ok) {
      ok++;
      await idb.del("queue", op.opId);
      if (r.id && (op.type === "farmer.upsert" || op.type === "plot.upsert")) {
        const local = await idb.get<LocalRecord>("local", op.clientId);
        if (local) await idb.put("local", { ...local, serverId: r.id });
      }
    } else if (r.error && /belum tersinkron/.test(r.error)) {
      await idb.put("queue", { ...op, attempts: op.attempts + 1 });
    } else {
      failed++;
      await idb.put("queue", { ...op, status: "failed", error: r.error, attempts: op.attempts + 1 });
    }
  }
  return { sent: ready.length, ok, failed };
}

export async function pullSnapshot(): Promise<Snapshot | null> {
  const res = await fetch("/api/v1/sync/snapshot", { credentials: "same-origin" });
  if (res.status === 401) throw new AuthError("Sesi berakhir; masuk lagi saat online");
  if (!res.ok) return null;
  const snap = (await res.json()) as Snapshot;
  await idb.put("meta", snap, "snapshot");
  return snap;
}

export async function syncAll() {
  const pushed = await pushQueue();
  // a second pass lets ops that referenced just-created records go through
  if (pushed.ok && (await queue()).some((o) => o.status === "pending")) await pushQueue();
  const snap = await pullSnapshot();
  const at = new Date().toISOString();
  await idb.put("meta", at, "lastSync");
  return { pushed, snap, at };
}

export { AuthError };

/** F2.7 — pre-download satellite tiles around a point for offline use (cached by the service worker). */
export const TILE_URL = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

function lonLatToTile(lon: number, lat: number, z: number) {
  const n = 2 ** z;
  const x = Math.floor(((lon + 180) / 360) * n);
  const r = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n);
  return { x, y };
}

export function tilesAround(lon: number, lat: number, radiusKm: number, zooms = [12, 13, 14, 15, 16, 17]) {
  const dLat = radiusKm / 111;
  const dLon = radiusKm / (111 * Math.cos((lat * Math.PI) / 180));
  const urls: string[] = [];
  for (const z of zooms) {
    const a = lonLatToTile(lon - dLon, lat + dLat, z);
    const b = lonLatToTile(lon + dLon, lat - dLat, z);
    for (let x = a.x; x <= b.x; x++) for (let y = a.y; y <= b.y; y++) urls.push(TILE_URL.replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y)));
  }
  return urls;
}

export async function downloadTiles(urls: string[], onProgress: (done: number, total: number) => void) {
  const cache = await caches.open("kp-tiles-v1");
  let done = 0;
  const workers = Array.from({ length: 6 }, async () => {
    while (urls.length) {
      const url = urls.pop()!;
      try {
        if (!(await cache.match(url))) {
          const res = await fetch(url, { mode: "cors" });
          if (res.ok) await cache.put(url, res);
        }
      } catch {
        /* skip tile */
      }
      onProgress(++done, done + urls.length);
    }
  });
  await Promise.all(workers);
}
