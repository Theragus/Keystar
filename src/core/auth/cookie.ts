import { env } from "@/core/env";

/**
 * Session cookie settings. Kept free of database imports so `src/proxy.ts`
 * can renew the cookie on every navigation (sliding sessions).
 */
export const SESSION_COOKIE = "ks_session";
export const SESSION_DAYS = 30;

export function sessionCookieOptions(maxAgeSeconds = SESSION_DAYS * 24 * 60 * 60) {
  return {
    httpOnly: true,
    secure: env().APP_URL.startsWith("https://"),
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}
