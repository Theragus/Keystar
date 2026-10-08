import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { esiTokens, getDb, skillsCharacterSkills } from "@/core/db";
import { SKILLS_SCOPE } from "@/modules/skills/module";
import { FITTINGS_SCOPE } from "./module";
import { fittingEsiFittings, type EsiFittingItemRow } from "./schema";

const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));
const str = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));

export interface FittingAccessStatus {
  characterId: number;
  name: string;
  grantedScopes: string[];
  granted: boolean;
  /** Switched off in Keystar while the token still holds the scope (can be switched back on without a login). */
  switchedOff: boolean;
  tokenStatus: "active" | "invalid" | null;
  lastSuccessAt: Date | null;
  lastStatus: string | null;
  lastError: string | null;
  /** Saved fittings stored for the character. */
  stored: number;
}

/** The viewer's characters with their fitting access, for the settings page. */
export async function getFittingAccess(userId: string): Promise<FittingAccessStatus[]> {
  const rows = await getDb().execute<Record<string, unknown>>(sql`
    SELECT c.character_id, c.name, t.scopes, t.disabled_scopes, t.status AS token_status,
           j.last_success_at, j.last_status, j.last_error,
           (SELECT COUNT(*) FROM fitting_esi_fittings f WHERE f.character_id = c.character_id) AS stored
    FROM characters c
    JOIN users u ON u.id = c.user_id
    LEFT JOIN esi_tokens t ON t.character_id = c.character_id
    LEFT JOIN sync_jobs j ON j.job_key = 'fitting.esi-fittings' AND j.owner_type = 'character' AND j.owner_id = c.character_id
    WHERE c.user_id = ${userId}::uuid
    ORDER BY c.character_id IS NOT DISTINCT FROM u.main_character_id DESC, c.name`);
  return rows.map((r) => {
    const scopes = Array.isArray(r.scopes) ? (r.scopes as string[]) : [];
    const disabled = Array.isArray(r.disabled_scopes) ? (r.disabled_scopes as string[]) : [];
    const granted = scopes.includes(FITTINGS_SCOPE);
    return {
      characterId: num(r.character_id),
      name: String(r.name),
      grantedScopes: scopes,
      granted,
      // A revoked token can't be switched back on in Keystar; it needs the EVE login.
      switchedOff: !granted && r.token_status === "active" && disabled.includes(FITTINGS_SCOPE),
      tokenStatus: r.token_status === "active" || r.token_status === "invalid" ? r.token_status : null,
      lastSuccessAt: r.last_success_at ? new Date(String(r.last_success_at)) : null,
      lastStatus: str(r.last_status),
      lastError: str(r.last_error),
      stored: num(r.stored),
    };
  });
}

export interface SkillSourceCharacter {
  characterId: number;
  name: string;
  /** Skills are shared and synced at least once. */
  skillsReady: boolean;
}

/** The viewer's characters, saying which can lend their skills to the calculator (skills module scope on and synced). */
export async function getSkillSources(characters: { characterId: number; name: string }[]): Promise<SkillSourceCharacter[]> {
  if (!characters.length) return [];
  const ids = characters.map((c) => c.characterId);
  const rows = await getDb().execute<Record<string, unknown>>(sql`
    SELECT t.character_id
    FROM esi_tokens t
    WHERE t.character_id IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})
      AND t.status = 'active' AND t.scopes @> ARRAY[${SKILLS_SCOPE}]::text[]
      AND EXISTS (SELECT 1 FROM skills_character_skills s WHERE s.character_id = t.character_id)`);
  const ready = new Set(rows.map((r) => num(r.character_id)));
  return characters.map((c) => ({ ...c, skillsReady: ready.has(c.characterId) }));
}

/** A character's skills as the engine wants them: skill type id → level the clone can use (alpha clones are capped). */
export async function getCharacterSkillLevels(characterId: number): Promise<Record<number, number>> {
  const rows = await getDb()
    .select({ skillId: skillsCharacterSkills.skillId, level: skillsCharacterSkills.activeLevel })
    .from(skillsCharacterSkills)
    .where(eq(skillsCharacterSkills.characterId, characterId));
  return Object.fromEntries(rows.map((r) => [r.skillId, r.level]));
}

export interface EsiFittingSummary {
  characterId: number;
  fittingId: number;
  name: string;
  description: string;
  shipTypeId: number;
  items: EsiFittingItemRow[];
}

/** The stored in-game fittings of the given characters (the viewer's), by hull then name. */
export async function getEsiFittings(characterIds: number[]): Promise<EsiFittingSummary[]> {
  if (!characterIds.length) return [];
  const sharing = await getDb()
    .select({ characterId: esiTokens.characterId })
    .from(esiTokens)
    .where(and(inArray(esiTokens.characterId, characterIds), sql`${esiTokens.scopes} @> ARRAY[${FITTINGS_SCOPE}]::text[]`));
  const ids = sharing.map((s) => s.characterId);
  if (!ids.length) return [];
  return getDb()
    .select({
      characterId: fittingEsiFittings.characterId,
      fittingId: fittingEsiFittings.fittingId,
      name: fittingEsiFittings.name,
      description: fittingEsiFittings.description,
      shipTypeId: fittingEsiFittings.shipTypeId,
      items: fittingEsiFittings.items,
    })
    .from(fittingEsiFittings)
    .where(inArray(fittingEsiFittings.characterId, ids))
    .orderBy(asc(fittingEsiFittings.shipTypeId), asc(fittingEsiFittings.name));
}
