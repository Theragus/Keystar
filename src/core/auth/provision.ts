import { asc, eq, sql } from "drizzle-orm";
import { audit } from "@/core/audit";
import { encryptToken } from "@/core/crypto";
import { characters, esiTokens, eveCorporations, getDb, sessions, users, type Db } from "@/core/db";
import { env } from "@/core/env";
import { getEsi } from "@/core/esi";
import { ensureNames, refreshCorporations } from "@/core/eve/resolver";
import type { Role } from "@/core/rbac/roles";
import { getSettings, setSetting } from "@/core/settings";
import { policyRole, reconcileRole } from "./policy";
import type { TokenResponse, VerifiedCharacter } from "./sso";

export type SsoIntent = "login" | "join" | "link" | "link-corp";

/** Advisory lock id that serialises provisioning (first-admin bootstrap, linking). */
const PROVISION_LOCK = 727_275;

export class ProvisionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProvisionError";
  }
}

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * Removes a character whose EVE account changed (sold or transferred) from its
 * previous Keystar account. An account left without characters is retired:
 * disabled and signed out everywhere, so the previous owner can't keep using an
 * existing session. It keeps its role, so a former admin still counts for the
 * first-user bootstrap and a newcomer can't become admin that way.
 */
export async function detachTransferredCharacter(
  tx: Tx,
  characterId: number,
  previousUserId: string,
  opts: { keepAccount: boolean },
): Promise<{ retired: boolean }> {
  await tx.delete(characters).where(eq(characters.characterId, characterId));
  const [next] = await tx
    .select({ characterId: characters.characterId })
    .from(characters)
    .where(eq(characters.userId, previousUserId))
    .orderBy(asc(characters.characterId))
    .limit(1);
  const retired = !next && !opts.keepAccount;
  await tx
    .update(users)
    .set({
      mainCharacterId: sql`CASE WHEN ${users.mainCharacterId} = ${characterId} THEN ${next?.characterId ?? null}::bigint ELSE ${users.mainCharacterId} END`,
      ...(retired ? { isDisabled: true } : {}),
      updatedAt: new Date(),
    })
    .where(eq(users.id, previousUserId));
  if (retired) await tx.delete(sessions).where(eq(sessions.userId, previousUserId));
  return { retired };
}

export interface ProvisionResult {
  userId: string;
  characterId: number;
  createdUser: boolean;
  role: Role;
}

/**
 * Turns a successful SSO round-trip into a user/character/token. Handles
 * new accounts, linking alts, re-authorising scopes and character transfers
 * (detected through the SSO owner hash).
 */
export async function provisionFromSso(params: {
  verified: VerifiedCharacter;
  tokens: TokenResponse;
  intent: SsoIntent;
  currentUserId: string | null;
}): Promise<ProvisionResult> {
  const { verified, tokens, intent, currentUserId } = params;
  const linking = intent === "link" || intent === "link-corp";
  if (linking && !currentUserId) throw new ProvisionError("Sign in before linking another character.");

  const pub = await getEsi().get<{ corporation_id: number; alliance_id?: number }>(`/characters/${verified.characterId}`);
  const corporationId = pub.data.corporation_id;
  const allianceId = pub.data.alliance_id ?? null;

  const settings = await getSettings();
  let homeCorporationId = settings["corp.homeCorporationId"];
  await refreshCorporations(homeCorporationId ? [corporationId, homeCorporationId] : [corporationId]);
  await ensureNames([verified.characterId, corporationId, ...(allianceId ? [allianceId] : [])]);

  const db = getDb();
  const result = await db.transaction(async (tx) => {
    // Serialise sign-ins so two simultaneous first logins can't both become admin;
    // the admin count below is read after the lock, so it sees the other commit.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${PROVISION_LOCK})`);
    const [existing] = await tx.select().from(characters).where(eq(characters.characterId, verified.characterId));

    if (existing && existing.ownerHash !== verified.ownerHash) {
      // The character was sold/transferred: the old account loses it entirely.
      // Keep the account when it is linking the character back to itself.
      const { retired } = await detachTransferredCharacter(tx, verified.characterId, existing.userId, {
        keepAccount: linking && existing.userId === currentUserId,
      });
      await audit({
        action: "character.transferred",
        targetType: "character",
        targetId: verified.characterId,
        details: { previousUserId: existing.userId, name: verified.name, previousAccountRetired: retired },
      });
    }
    const owned = existing && existing.ownerHash === verified.ownerHash ? existing : undefined;

    const [{ count: adminCount }] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(users)
      .where(eq(users.role, "admin"));
    const homeCorp = homeCorporationId
      ? (await tx.select().from(eveCorporations).where(eq(eveCorporations.corporationId, homeCorporationId)))[0]
      : undefined;
    const policy = policyRole({
      characterId: verified.characterId,
      corporationId,
      allianceId,
      adminCharacterIds: env().ADMIN_CHARACTER_IDS,
      hasAdmin: adminCount > 0,
      homeCorporationId,
      homeAllianceId: homeCorp?.allianceId ?? null,
      autoApproveCorpMembers: settings["access.autoApproveCorpMembers"],
      autoApproveAllianceMembers: settings["access.autoApproveAllianceMembers"],
    });

    let userId: string;
    let createdUser = false;
    let role: Role;

    if (linking) {
      if (owned && owned.userId !== currentUserId) {
        throw new ProvisionError(`${verified.name} is already linked to another Keystar account.`);
      }
      userId = currentUserId!;
      const [u] = await tx.select().from(users).where(eq(users.id, userId));
      role = u.role;
    } else if (owned) {
      userId = owned.userId;
      const [u] = await tx.select().from(users).where(eq(users.id, userId));
      if (u.isDisabled) throw new ProvisionError("This account has been disabled by an administrator.");
      role = reconcileRole(u.role, policy);
      if (role !== u.role) {
        await audit({
          action: "user.role.auto",
          targetType: "user",
          targetId: userId,
          details: { from: u.role, to: role, character: verified.name },
        });
      }
    } else {
      role = policy;
      const [u] = await tx.insert(users).values({ role, mainCharacterId: verified.characterId }).returning();
      userId = u.id;
      createdUser = true;
    }

    await tx
      .insert(characters)
      .values({
        characterId: verified.characterId,
        userId,
        name: verified.name,
        corporationId,
        allianceId,
        ownerHash: verified.ownerHash,
        affiliationUpdatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: characters.characterId,
        set: {
          userId,
          name: verified.name,
          corporationId,
          allianceId,
          ownerHash: verified.ownerHash,
          affiliationUpdatedAt: new Date(),
          updatedAt: new Date(),
        },
      });

    if (verified.scopes.length > 0) {
      const tokenValues = {
        refreshTokenEnc: encryptToken(tokens.refresh_token),
        accessTokenEnc: encryptToken(tokens.access_token),
        accessTokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        scopes: verified.scopes,
        status: "active" as const,
        lastError: null,
        lastRefreshedAt: new Date(),
        updatedAt: new Date(),
      };
      await tx
        .insert(esiTokens)
        .values({ characterId: verified.characterId, ...tokenValues })
        .onConflictDoUpdate({ target: esiTokens.characterId, set: tokenValues });
    }

    await tx
      .update(users)
      .set({
        role,
        mainCharacterId: sql`COALESCE(${users.mainCharacterId}, ${verified.characterId})`,
        ...(linking ? {} : { lastLoginAt: new Date() }),
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    return { userId, characterId: verified.characterId, createdUser, role };
  });

  // The first admin's corporation becomes the home corporation if none is configured.
  if (!homeCorporationId && result.role === "admin") {
    homeCorporationId = corporationId;
    await setSetting("corp.homeCorporationId", corporationId, result.userId);
  }

  await audit({
    actorUserId: result.userId,
    actorName: verified.name,
    action: linking ? "character.linked" : result.createdUser ? "user.registered" : "user.login",
    targetType: "character",
    targetId: verified.characterId,
    details: { intent, scopes: verified.scopes.length, role: result.role },
  });

  return result;
}
