import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";

/**
 * Local filesystem object storage (stand-in for S3/MinIO in the BRD).
 * Keys are always prefixed with the org id: `${orgId}/...`.
 */
function root() {
  return path.resolve(process.cwd(), process.env.STORAGE_DIR ?? "./storage");
}

function resolveKey(key: string) {
  if (key.includes("..") || path.isAbsolute(key)) throw new Error("invalid storage key");
  const full = path.resolve(root(), key);
  if (!full.startsWith(root() + path.sep)) throw new Error("invalid storage key");
  return full;
}

export async function putObject(key: string, data: Buffer | Uint8Array | string) {
  const full = resolveKey(key);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, data);
  return key;
}

export async function getObject(key: string): Promise<Buffer> {
  return readFile(resolveKey(key));
}

export async function objectExists(key: string) {
  try {
    await stat(resolveKey(key));
    return true;
  } catch {
    return false;
  }
}

export function safeFileName(name: string) {
  return name.replace(/[^\w.\-]+/g, "_").slice(-120) || "file";
}
