import { eq, sql } from "drizzle-orm";
import { decryptToken, encryptToken } from "@/core/crypto";
import { esiTokens, getDb } from "@/core/db";
import { refreshAccessToken, SsoError, verifyAccessToken } from "@/core/auth/sso";

export class TokenInvalidError extends Error {
  constructor(
    readonly characterId: number,
    message: string,
  ) {
    super(message);
    this.name = "TokenInvalidError";
  }
}

const inflight = new Map<number, Promise<string>>();

/**
 * Returns a valid ESI access token for a character, refreshing it through SSO
 * when it expires within a minute. Refreshes are serialised per character
 * in-process and guarded by a row lock across processes.
 */
export function getAccessToken(characterId: number, opts: { forceRefresh?: boolean } = {}): Promise<string> {
  const pending = inflight.get(characterId);
  if (pending) return pending;
  const promise = loadOrRefresh(characterId, opts.forceRefresh ?? false).finally(() => inflight.delete(characterId));
  inflight.set(characterId, promise);
  return promise;
}

async function loadOrRefresh(characterId: number, forceRefresh: boolean): Promise<string> {
  const db = getDb();
  return db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(esiTokens)
      .where(eq(esiTokens.characterId, characterId))
      .for("update");
    const row = rows[0];
    if (!row) throw new TokenInvalidError(characterId, "No ESI token stored for character");
    if (row.status !== "active") throw new TokenInvalidError(characterId, row.lastError ?? "Token is invalid");

    const stillValid =
      row.accessTokenEnc && row.accessTokenExpiresAt && row.accessTokenExpiresAt.getTime() - Date.now() > 60_000;
    if (stillValid && !forceRefresh) return decryptToken(row.accessTokenEnc!);

    try {
      const res = await refreshAccessToken(decryptToken(row.refreshTokenEnc));
      const verified = await verifyAccessToken(res.access_token);
      if (verified.characterId !== characterId) throw new SsoError("Refreshed token belongs to another character");
      await tx
        .update(esiTokens)
        .set({
          accessTokenEnc: encryptToken(res.access_token),
          accessTokenExpiresAt: new Date(Date.now() + res.expires_in * 1000),
          refreshTokenEnc: encryptToken(res.refresh_token),
          scopes: verified.scopes,
          lastRefreshedAt: new Date(),
          lastError: null,
          updatedAt: new Date(),
        })
        .where(eq(esiTokens.characterId, characterId));
      return res.access_token;
    } catch (err) {
      // invalid_grant = revoked by the player or CCP; anything else may be transient.
      if (err instanceof SsoError && (err.code === "invalid_grant" || err.status === 400 || err.status === 401)) {
        await tx
          .update(esiTokens)
          .set({ status: "invalid", lastError: err.message, accessTokenEnc: null, updatedAt: sql`now()` })
          .where(eq(esiTokens.characterId, characterId));
        throw new TokenInvalidError(characterId, err.message);
      }
      throw err;
    }
  });
}

export function hasScopes(granted: readonly string[], required: readonly string[]): boolean {
  return required.every((s) => granted.includes(s));
}
