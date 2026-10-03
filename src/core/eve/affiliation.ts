import type { EsiClient } from "@/core/esi/client";

export interface Affiliation {
  characterId: number;
  corporationId: number;
  allianceId: number | null;
  factionId: number | null;
}

/** POST /characters/affiliation accepts at most this many ids. */
const CHUNK = 1000;

/** Current corporation/alliance/faction of any characters (public, cached by ESI for an hour). */
export async function fetchAffiliations(esi: EsiClient, characterIds: Iterable<number>): Promise<Affiliation[]> {
  const ids = [...new Set([...characterIds].filter((n) => Number.isSafeInteger(n) && n > 0))];
  const out: Affiliation[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const res = await esi.post<{ character_id: number; corporation_id: number; alliance_id?: number; faction_id?: number }[]>(
      "/characters/affiliation",
      ids.slice(i, i + CHUNK),
    );
    for (const a of res.data) {
      out.push({
        characterId: a.character_id,
        corporationId: a.corporation_id,
        allianceId: a.alliance_id ?? null,
        factionId: a.faction_id ?? null,
      });
    }
  }
  return out;
}
