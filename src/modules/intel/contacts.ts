import { and, eq, ne } from "drizzle-orm";
import { getCorporation } from "@/core/corp";
import { intelContacts, type Db } from "@/core/db";
import { ensureNames } from "@/core/eve/resolver";
import type { JobDefinition } from "@/core/sync/types";
import type { ContactOwner } from "./schema";

/**
 * The home corporation's and alliance's contact lists (standings), which
 * decide blue and red in threat scans. Neither endpoint needs an in-game role,
 * so any member who linked with corporation access can serve them.
 */
export const CONTACT_SCOPES = {
  corporation: "esi-corporations.read_contacts.v1",
  alliance: "esi-alliances.read_contacts.v1",
} as const;

interface EsiContact {
  contact_id: number;
  contact_type: string;
  standing: number;
  label_ids?: number[];
  is_watched?: boolean;
}

/** Replaces one owner's contact list. */
export async function replaceContacts(db: Db, ownerType: ContactOwner, ownerId: number, contacts: EsiContact[]): Promise<void> {
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.delete(intelContacts).where(and(eq(intelContacts.ownerType, ownerType), eq(intelContacts.ownerId, ownerId)));
    for (let i = 0; i < contacts.length; i += 500) {
      await tx.insert(intelContacts).values(
        contacts.slice(i, i + 500).map((c) => ({
          ownerType,
          ownerId,
          contactId: c.contact_id,
          contactType: c.contact_type,
          standing: c.standing,
          labelIds: c.label_ids ?? [],
          isWatched: c.is_watched ?? null,
          updatedAt: now,
        })),
      );
    }
  });
}

const summary = (contacts: EsiContact[]) => {
  const blue = contacts.filter((c) => c.standing > 0).length;
  const red = contacts.filter((c) => c.standing < 0).length;
  return `${contacts.length} contacts (${blue} positive, ${red} negative)`;
};

export const corporationContactsJob: JobDefinition = {
  key: "intel.corporation-contacts",
  label: "Corporation contacts (standings)",
  module: "intel",
  owner: "corporation",
  requiredScopes: [CONTACT_SCOPES.corporation],
  anyCorpMember: true,
  intervalSeconds: 900,
  async run({ esi, db, ownerId, characterId }) {
    const res = await esi.getAllPages<EsiContact>(`/corporations/${ownerId}/contacts`, { characterId: characterId! });
    await replaceContacts(db, "corporation", ownerId, res.data);
    await ensureNames(res.data.filter((c) => c.contact_type !== "faction").map((c) => c.contact_id));
    return { summary: summary(res.data), nextRunAt: res.expiresAt };
  },
};

export const allianceContactsJob: JobDefinition = {
  key: "intel.alliance-contacts",
  label: "Alliance contacts (standings)",
  module: "intel",
  owner: "corporation",
  requiredScopes: [CONTACT_SCOPES.alliance],
  anyCorpMember: true,
  intervalSeconds: 900,
  async run({ esi, db, ownerId, characterId }) {
    // The hourly affiliations job keeps the home corporation's alliance current.
    const allianceId = (await getCorporation(ownerId))?.allianceId ?? null;
    if (!allianceId) {
      await db.delete(intelContacts).where(eq(intelContacts.ownerType, "alliance"));
      return { summary: "Not in an alliance" };
    }
    const res = await esi.getAllPages<EsiContact>(`/alliances/${allianceId}/contacts`, { characterId: characterId! });
    await replaceContacts(db, "alliance", allianceId, res.data);
    // A corporation that changed alliance keeps no stale list.
    await db.delete(intelContacts).where(and(eq(intelContacts.ownerType, "alliance"), ne(intelContacts.ownerId, allianceId)));
    await ensureNames(res.data.filter((c) => c.contact_type !== "faction").map((c) => c.contact_id));
    return { summary: summary(res.data), nextRunAt: res.expiresAt };
  },
};
