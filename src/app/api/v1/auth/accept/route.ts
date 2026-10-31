import { NextResponse } from "next/server";
import { publicRoute } from "@/lib/api";
import { SESSION_COOKIE, SESSION_TTL_SECONDS } from "@/lib/auth/session";
import { acceptInvite } from "@/server/auth";

export const POST = publicRoute(async ({ req }) => {
  const result = await acceptInvite(await req.json());
  const res = NextResponse.json(result);
  res.cookies.set(SESSION_COOKIE, result.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  return res;
});
