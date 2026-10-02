import { NextResponse, type NextRequest } from "next/server";
import { OAUTH_COOKIE, OAUTH_MAX_AGE_SECONDS, safeReturnTo, sealOAuthState } from "@/core/auth/oauth-state";
import { buildAuthorizeUrl, createPkcePair } from "@/core/auth/sso";
import { randomToken } from "@/core/crypto";
import { env, ssoConfigured } from "@/core/env";
import { characterScopes, corporationScopes } from "@/core/modules/registry";

const INTENTS = ["login", "join", "link", "link-corp"] as const;
type Intent = (typeof INTENTS)[number];

/** Starts the EVE SSO flow. ?intent=login|join|link|link-corp&returnTo=/path */
export async function GET(request: NextRequest) {
  const appUrl = env().APP_URL;
  if (!ssoConfigured()) {
    return NextResponse.redirect(new URL("/login?error=sso_not_configured", appUrl));
  }

  const requested = request.nextUrl.searchParams.get("intent");
  const intent: Intent = (INTENTS as readonly string[]).includes(requested ?? "") ? (requested as Intent) : "login";
  const defaultReturn = intent === "link" || intent === "link-corp" ? "/characters" : "/";
  const returnTo = safeReturnTo(request.nextUrl.searchParams.get("returnTo"), defaultReturn);

  const scopes = intent === "login" ? [] : intent === "link-corp" ? corporationScopes() : characterScopes();
  const { verifier, challenge } = createPkcePair();
  const state = randomToken(24);

  const response = NextResponse.redirect(buildAuthorizeUrl({ state, codeChallenge: challenge, scopes }));
  response.cookies.set(OAUTH_COOKIE, sealOAuthState({ state, verifier, intent, returnTo, createdAt: Date.now() }), {
    httpOnly: true,
    secure: appUrl.startsWith("https://"),
    sameSite: "lax",
    path: "/auth",
    maxAge: OAUTH_MAX_AGE_SECONDS,
  });
  return response;
}
