import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { Ctx } from "@/lib/context";
import { ctxFromToken } from "./guard";
import { can, type Permission } from "./rbac";
import { SESSION_COOKIE } from "./session";

/** Current user for Server Components; redirects to /login when there is no valid session. */
export const getCtx = cache(async (): Promise<Ctx> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const ctx = await ctxFromToken(token);
  if (!ctx) redirect("/login");
  return ctx;
});

/** Page-level permission gate: renders the 403 page via redirect. */
export async function getCtxWith(perm: Permission): Promise<Ctx> {
  const ctx = await getCtx();
  if (!can(ctx.role, perm)) redirect("/forbidden");
  return ctx;
}
