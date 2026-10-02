import { NextResponse, type NextRequest } from "next/server";
import { audit } from "@/core/audit";
import { SESSION_COOKIE, createSession, sessionCookieOptions } from "@/core/auth/session";
import { env } from "@/core/env";
import { getSetting } from "@/core/settings";

/** Demo mode only: sign in as one of the seeded demo users (?as=admin|director|…). */
export async function GET(request: NextRequest) {
  const e = env();
  if (!e.KEYSTAR_DEMO_MODE) return NextResponse.redirect(new URL("/login?error=demo_disabled", e.APP_URL));

  const role = request.nextUrl.searchParams.get("as") ?? "admin";
  const demoUsers = await getSetting("demo.users");
  const userId = demoUsers[role];
  if (!userId) return NextResponse.redirect(new URL("/login?error=demo_disabled", e.APP_URL));

  const token = await createSession(userId, { userAgent: request.headers.get("user-agent") });
  await audit({ actorUserId: userId, action: "user.login.demo", details: { role } });
  const res = NextResponse.redirect(new URL("/", e.APP_URL));
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return res;
}
