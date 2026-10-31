import { NextResponse, type NextRequest } from "next/server";

// Optimistic check only: real authorization happens in route()/getCtx() against the DB.
const PUBLIC_PREFIXES = ["/login", "/invite", "/p/", "/api/", "/_next", "/favicon", "/field/sw.js", "/manifest"];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return NextResponse.next();
  if (!req.cookies.get("kp_session")) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\.(?:png|jpg|svg|ico|webmanifest)$).*)"],
};
