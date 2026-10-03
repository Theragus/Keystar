import type { LatestEvent, PilotProfile } from "./types";

/** Never confuse the lost hull with the final-blow attacker's hull. */
export const eventTargetHull = (event: LatestEvent) => (event.isLoss ? event.shipTypeId : event.otherShipTypeId);

export function latestEvidence(profile: PilotProfile | null) {
  const events = [...(profile?.recent.latest ?? [])].sort((a, b) => Date.parse(b.time) - Date.parse(a.time));
  return { kill: events.find((e) => !e.isLoss) ?? null, loss: events.find((e) => e.isLoss) ?? null };
}

export function cynoEvidence(profile: PilotProfile | null) {
  return (["covertCyno", "cyno", "industrialCyno"] as const).flatMap((kind) => {
    const fit = profile?.fits[kind];
    return fit && fit.count > 0 ? [{ kind, ...fit }] : [];
  });
}

export interface ObservedGroup {
  time: string;
  systemId: number;
  killmailIds: number[];
  members: { characterId: number; shipTypeId: number | null; time: string; changed: boolean }[];
}

/** Partial local-only reconstruction. Same killmail proves co-attack, never fleet membership.
 * Merge only within 30 minutes of the newest event, same system, with two shared pilots.
 * Losses cannot turn the victim's opponents into associates. No stats-only associations.
 */
export function observedGroups(pilots: { characterId: number; profile: PilotProfile | null }[], now: Date): ObservedGroup[] {
  const encounters = new Map<number, ObservedGroup>();
  for (const pilot of pilots) {
    for (const event of pilot.profile?.recent.latest ?? []) {
      const age = now.getTime() - Date.parse(event.time);
      if (event.isLoss || !Number.isFinite(age) || age < 0 || age > 6 * 60 * 60_000) continue;
      const group = encounters.get(event.killmailId) ?? {
        time: event.time,
        systemId: event.systemId,
        killmailIds: [event.killmailId],
        members: [],
      };
      if (!group.members.some((m) => m.characterId === pilot.characterId)) {
        group.members.push({ characterId: pilot.characterId, shipTypeId: event.shipTypeId, time: event.time, changed: false });
      }
      encounters.set(event.killmailId, group);
    }
  }
  const groups: ObservedGroup[] = [];
  for (const encounter of [...encounters.values()]
    .filter((g) => g.members.length >= 2)
    .sort((a, b) => Date.parse(b.time) - Date.parse(a.time))) {
    const group = groups.find(
      (g) =>
        g.systemId === encounter.systemId &&
        Date.parse(g.time) - Date.parse(encounter.time) <= 30 * 60_000 &&
        encounter.members.filter((m) => g.members.some((n) => n.characterId === m.characterId)).length >= 2,
    );
    if (!group) {
      groups.push(encounter);
      continue;
    }
    group.killmailIds.push(...encounter.killmailIds);
    for (const member of encounter.members) {
      const existing = group.members.find((m) => m.characterId === member.characterId);
      if (!existing) group.members.push(member);
      else if (existing.shipTypeId !== member.shipTypeId) existing.changed = true;
    }
  }
  return groups;
}
