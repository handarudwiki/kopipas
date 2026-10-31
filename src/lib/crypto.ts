import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";

export const sha256 = (data: string | Buffer | Uint8Array) =>
  createHash("sha256").update(data).digest("hex");

/** URL-safe random token; only its SHA-256 is stored (N4). */
export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");

export const hashPassword = (pw: string) => bcrypt.hash(pw, 12);
export const verifyPassword = (pw: string, hash: string) => bcrypt.compare(pw, hash);
