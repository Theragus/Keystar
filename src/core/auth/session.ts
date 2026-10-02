import { and, eq, gt, lt, sql } from "drizzle-orm";
import { randomToken, sha256Hex } from "@/core/crypto";
import { getDb, sessions } from "@/core/db";
import { env } from "@/core/env";

export const SESSION_COOKIE = "ks_session";
const SESSION_DAYS = 30;
const DAY = 24 * 60 * 60 * 1000;

export function sessionCookieOptions(maxAgeSeconds = SESSION_DAYS * 24 * 60 * 60) {
  return {
    httpOnly: true,
    secure: env().APP_URL.startsWith("https://"),
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

/** Creates a session row and returns the raw cookie token (only its hash is stored). */
export async function createSession(userId: string, meta: { ip?: string | null; userAgent?: string | null } = {}) {
  const token = randomToken(32);
  await getDb()
    .insert(sessions)
    .values({
      id: sha256Hex(token),
      userId,
      expiresAt: new Date(Date.now() + SESSION_DAYS * DAY),
      ipAddress: meta.ip ?? null,
      userAgent: meta.userAgent?.slice(0, 300) ?? null,
    });
  return token;
}

/** Returns the session for a cookie token, sliding its expiry. */
export async function validateSessionToken(token: string) {
  const db = getDb();
  const id = sha256Hex(token);
  const rows = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.id, id), gt(sessions.expiresAt, new Date())));
  const session = rows[0];
  if (!session) return null;

  const now = Date.now();
  const needsSlide = session.expiresAt.getTime() - now < (SESSION_DAYS / 2) * DAY;
  const needsTouch = now - session.lastSeenAt.getTime() > 5 * 60 * 1000;
  if (needsSlide || needsTouch) {
    await db
      .update(sessions)
      .set({
        lastSeenAt: new Date(),
        ...(needsSlide ? { expiresAt: new Date(now + SESSION_DAYS * DAY) } : {}),
      })
      .where(eq(sessions.id, id));
  }
  return session;
}

export async function deleteSessionToken(token: string): Promise<void> {
  await getDb().delete(sessions).where(eq(sessions.id, sha256Hex(token)));
}

export async function deleteUserSessions(userId: string): Promise<void> {
  await getDb().delete(sessions).where(eq(sessions.userId, userId));
}

export async function purgeExpiredSessions(): Promise<number> {
  const res = await getDb().delete(sessions).where(lt(sessions.expiresAt, sql`now()`)).returning({ id: sessions.id });
  return res.length;
}
