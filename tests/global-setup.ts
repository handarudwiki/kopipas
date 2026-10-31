import { execSync } from "node:child_process";
import { rmSync } from "node:fs";

/**
 * Bring the dedicated test database up to date (non-destructive). Every test creates its own
 * organisation, so tests never depend on an empty database.
 */
export default function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url || !/test/.test(url)) throw new Error("TEST_DATABASE_URL must point to a *test* database");
  execSync("npx prisma migrate deploy", { stdio: "inherit", env: { ...process.env, DATABASE_URL: url } });
  rmSync("./.test-storage", { recursive: true, force: true });
}
