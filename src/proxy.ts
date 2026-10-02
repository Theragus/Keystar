import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, sessionCookieOptions } from "@/core/auth/cookie";

/**
 * Optimistic auth redirect: send visitors without a session cookie to /login.
 * Real authorisation happens in the Data Access Layer (src/core/auth/dal.ts).
 *
 * Also renews the session cookie on every navigation so it slides together
 * with the database expiry; the database row stays authoritative.
 */
export function proxy(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  const response = NextResponse.next();
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return response;
}

export const config = {
  matcher: ["/((?!login|join|auth|api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|ico|webp|woff2?)$).*)"],
};
