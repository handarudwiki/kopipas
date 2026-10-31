import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { ctxFromToken, requirePermission } from "@/lib/auth/guard";
import type { Permission } from "@/lib/auth/rbac";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { runAsActor, type Ctx } from "@/lib/context";
import { ApiError, unauthorized } from "@/lib/errors";
import { reportError } from "@/lib/monitoring";
import "@/server/register";

type RouteCtx<P> = { params: Promise<P> };

export function tokenFromRequest(req: NextRequest): string | null {
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  return req.cookies.get(SESSION_COOKIE)?.value ?? null;
}

export function errorResponse(err: unknown, req?: NextRequest) {
  if (err instanceof ApiError) {
    return NextResponse.json({ error: err.message, details: err.details ?? null }, { status: err.status });
  }
  if (err instanceof ZodError) {
    return NextResponse.json(
      { error: "Data tidak valid", details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })) },
      { status: 422 },
    );
  }
  void reportError(err, { path: req?.nextUrl.pathname, method: req?.method, routeType: "route" });
  return NextResponse.json({ error: "Terjadi kesalahan server" }, { status: 500 });
}

/**
 * Authenticated, tenant-scoped API route. Every handler receives a Ctx whose orgId must be
 * used to filter all queries (N5). Permission failures return 403 and are audited (F1.2).
 */
export function route<P = Record<string, string>>(
  perm: Permission | null,
  handler: (args: { req: NextRequest; ctx: Ctx; params: P }) => Promise<unknown>,
) {
  return async (req: NextRequest, rc: RouteCtx<P>) => {
    try {
      const ctx = await ctxFromToken(tokenFromRequest(req));
      if (!ctx) throw unauthorized();
      return await runAsActor({ orgId: ctx.orgId, actorId: ctx.userId }, async () => {
        if (perm) await requirePermission(ctx, perm);
        const params = (await rc.params) ?? ({} as P);
        const out = await handler({ req, ctx, params });
        return out instanceof Response ? out : NextResponse.json(out ?? { ok: true });
      });
    } catch (err) {
      return errorResponse(err, req);
    }
  };
}

/** Unauthenticated route (login, invite accept, public pack). */
export function publicRoute<P = Record<string, string>>(
  handler: (args: { req: NextRequest; params: P }) => Promise<unknown>,
) {
  return async (req: NextRequest, rc: RouteCtx<P>) => {
    try {
      return await runAsActor({ orgId: null, actorId: null }, async () => {
        const params = (await rc.params) ?? ({} as P);
        const out = await handler({ req, params });
        return out instanceof Response ? out : NextResponse.json(out ?? { ok: true });
      });
    } catch (err) {
      return errorResponse(err, req);
    }
  };
}
