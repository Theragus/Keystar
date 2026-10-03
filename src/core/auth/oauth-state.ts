import { z } from "zod";
import { decrypt, deriveKey, encrypt } from "@/core/crypto";

export const OAUTH_COOKIE = "ks_oauth";
export const OAUTH_MAX_AGE_SECONDS = 600;

const stateSchema = z.object({
  state: z.string().min(16),
  verifier: z.string().min(43),
  intent: z.enum(["login", "join", "link", "link-corp"]),
  returnTo: z.string(),
  createdAt: z.number(),
  /** Opt-in scopes the user asked to remove; losing them is expected, not a surprise. */
  optionalRemoved: z.array(z.string()).max(20).default([]),
});

export type OAuthState = z.infer<typeof stateSchema>;

export function sealOAuthState(state: z.input<typeof stateSchema>): string {
  return encrypt(JSON.stringify(state), deriveKey("oauth-state"));
}

export function unsealOAuthState(value: string | undefined): OAuthState | null {
  if (!value) return null;
  try {
    const parsed = stateSchema.parse(JSON.parse(decrypt(value, deriveKey("oauth-state"))));
    if (Date.now() - parsed.createdAt > OAUTH_MAX_AGE_SECONDS * 1000) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Only allow same-origin relative paths as post-login redirect targets. */
export function safeReturnTo(value: string | null | undefined, fallback = "/"): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  return value;
}
