"use client";

/**
 * Offline store for the field app (IndexedDB). Holds the outgoing op queue, photo blobs,
 * locally created records (so they can be referenced before sync), and the cached snapshot.
 */
const DB_NAME = "kopipass-field";
const DB_VERSION = 1;
export const STORES = ["queue", "blobs", "local", "meta"] as const;
type StoreName = (typeof STORES)[number];

let dbp: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains("queue")) d.createObjectStore("queue", { keyPath: "opId" });
        if (!d.objectStoreNames.contains("blobs")) d.createObjectStore("blobs");
        if (!d.objectStoreNames.contains("local")) d.createObjectStore("local", { keyPath: "clientId" });
        if (!d.objectStoreNames.contains("meta")) d.createObjectStore("meta");
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbp;
}

function tx<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then(
    (d) =>
      new Promise<T>((resolve, reject) => {
        const t = d.transaction(store, mode);
        const req = fn(t.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

export const idb = {
  get: <T>(store: StoreName, key: IDBValidKey) => tx<T | undefined>(store, "readonly", (s) => s.get(key) as IDBRequest<T | undefined>),
  all: <T>(store: StoreName) => tx<T[]>(store, "readonly", (s) => s.getAll() as IDBRequest<T[]>),
  put: (store: StoreName, value: unknown, key?: IDBValidKey) => tx(store, "readwrite", (s) => (key !== undefined ? s.put(value, key) : s.put(value))),
  del: (store: StoreName, key: IDBValidKey) => tx(store, "readwrite", (s) => s.delete(key)),
};

export const newId = (prefix: string) =>
  `${prefix}-${(crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`)}`;

export type QueuedOp = {
  opId: string;
  type: "farmer.upsert" | "plot.upsert" | "evidence.create" | "purchase.create";
  clientId: string;
  data: Record<string, unknown>;
  fieldTimes?: Record<string, string>;
  /** blob ids that must be uploaded and turned into data.photoKeys before sending */
  photoBlobIds?: string[];
  createdAt: string;
  status: "pending" | "failed";
  error?: string;
  attempts: number;
  label: string;
};

export type LocalRecord = {
  clientId: string;
  kind: "farmer" | "plot";
  serverId?: string;
  name: string;
  farmerRef?: { id?: string; clientId?: string };
  declaredAreaHa?: number;
  createdAt: string;
};

export async function enqueue(op: Omit<QueuedOp, "opId" | "createdAt" | "status" | "attempts">) {
  const full: QueuedOp = { ...op, opId: newId("op"), createdAt: new Date().toISOString(), status: "pending", attempts: 0 };
  await idb.put("queue", full);
  return full;
}

export async function queue(): Promise<QueuedOp[]> {
  return (await idb.all<QueuedOp>("queue")).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Downscale a photo to ≤1600 px JPEG to keep the offline queue small. */
export async function compressPhoto(file: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    return await new Promise((res) => canvas.toBlob((b) => res(b ?? file), "image/jpeg", 0.82));
  } catch {
    return file;
  }
}

export async function saveBlob(blob: Blob) {
  const id = newId("blob");
  await idb.put("blobs", blob, id);
  return id;
}
