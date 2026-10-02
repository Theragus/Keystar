import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic auth redirect: send visitors without a session cookie to /login.
 * Real authorisation happens in the Data Access Layer (src/core/auth/dal.ts).
 */
export function proxy(request: NextRequest) {
  if (!request.cookies.has("ks_session")) {
    const url = new URL("/login", request.url);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!login|join|auth|api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|ico|webp|woff2?)$).*)"],
};
