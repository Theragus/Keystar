import { NextResponse, type NextRequest } from "next/server";
import { OAUTH_COOKIE, unsealOAuthState } from "@/core/auth/oauth-state";
import { ProvisionError, provisionFromSso } from "@/core/auth/provision";
import { SESSION_COOKIE, createSession, sessionCookieOptions, validateSessionToken } from "@/core/auth/session";
import { exchangeCode, verifyAccessToken } from "@/core/auth/sso";
import { env } from "@/core/env";
import { createLogger, errorMessage } from "@/core/logger";

const log = createLogger("sso");

function fail(code: string, message?: string) {
  const url = new URL("/login", env().APP_URL);
  url.searchParams.set("error", code);
  if (message) url.searchParams.set("message", message.slice(0, 200));
  const res = NextResponse.redirect(url);
  res.cookies.delete({ name: OAUTH_COOKIE, path: "/auth" });
  return res;
}

/** EVE SSO redirects here with ?code&state. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  if (params.get("error")) return fail("sso_denied", params.get("error_description") ?? undefined);

  const saved = unsealOAuthState(request.cookies.get(OAUTH_COOKIE)?.value);
  const code = params.get("code");
  if (!saved || !code || params.get("state") !== saved.state) {
    return fail("invalid_state");
  }

  const existingToken = request.cookies.get(SESSION_COOKIE)?.value;
  const existingSession = existingToken ? await validateSessionToken(existingToken) : null;

  try {
    const tokens = await exchangeCode(code, saved.verifier);
    const verified = await verifyAccessToken(tokens.access_token);
    const result = await provisionFromSso({
      verified,
      tokens,
      intent: saved.intent,
      currentUserId: existingSession?.userId ?? null,
    });

    const res = NextResponse.redirect(new URL(saved.returnTo, env().APP_URL));
    res.cookies.delete({ name: OAUTH_COOKIE, path: "/auth" });
    // Linking keeps the current session; logins start a fresh one.
    if (!existingSession || existingSession.userId !== result.userId) {
      const token = await createSession(result.userId, {
        ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
        userAgent: request.headers.get("user-agent"),
      });
      res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    }
    return res;
  } catch (err) {
    if (err instanceof ProvisionError) return fail("provision", err.message);
    // Details stay in the server log; the unauthenticated login page only gets a generic error.
    log.error("SSO callback failed", { error: errorMessage(err) });
    return fail("sso_failed");
  }
}
