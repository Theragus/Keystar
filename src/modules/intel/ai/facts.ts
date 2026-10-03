import { createHash } from "node:crypto";
import { MESSAGES } from "@/i18n/messages";
import { compact } from "@/lib/format";
import { hullClass } from "../hulls";
import type { DisplayNames } from "../names";
import type { DscanMatchRow } from "../dscan";
import type { GroupSummary } from "../score/summary";
import { reasonText, tagText } from "../text";
import type { Engagement, PilotHistory, PilotProfile, PilotScore, Standing } from "../types";

/**
 * The facts Claude writes from: computed numbers and names only. Key order is
 * deliberate — every pilot starts with their latest killmails, then recent
 * counts, then the scores and only last their lifetime numbers — so the model
 * reads recent activity first. Facts are in English whatever language the
 * note is written in.
 */

const EN = MESSAGES.en;

export interface FactsPilot {
  characterId: number;
  name: string;
  corporationTicker: string | null;
  corporationName: string | null;
  allianceName: string | null;
  standing: Standing;
  history: PilotHistory | null;
  profile: PilotProfile | null;
  score: PilotScore | null;
}

/** Briefings cover this many pilots in detail and summarize the rest. */
export const BRIEF_PILOTS = 25;
const ago = (iso: string | null | undefined, now: Date): string | null => {
  if (!iso) return null;
  const h = (now.getTime() - Date.parse(iso)) / 3_600_000;
  if (h < 1) return "under 1 hour";
  if (h < 48) return Math.round(h) === 1 ? "1 hour" : `${Math.round(h)} hours`;
  return `${Math.round(h / 24)} days`;
};
const eve = (iso: string) => `${iso.slice(0, 16).replace("T", " ")} EVE`;
const typeName = (names: DisplayNames, id: number | null | undefined) => (id ? (names.types.get(id)?.name ?? `type ${id}`) : null);
const systemName = (names: DisplayNames, id: number | null | undefined) => (id ? (names.systems.get(id)?.name ?? `system ${id}`) : null);

export function pilotFacts(p: FactsPilot, names: DisplayNames, now: Date) {
  const r = p.profile?.recent;
  const h = p.history;
  return {
    id: p.characterId,
    name: p.name,
    latestKillmails: (r?.latest ?? []).slice(0, 5).map((e) => ({
      ago: ago(e.time, now),
      type: e.isLoss ? "loss" : "kill",
      ship: typeName(names, e.shipTypeId),
      [e.isLoss ? "killedBy" : "victim"]: typeName(names, e.otherShipTypeId),
      system: systemName(names, e.systemId),
      pilotsOnKillmail: e.attackerCount,
      solo: e.solo,
      iskValue: compact(e.value),
    })),
    lastSeen: r?.lastSeen
      ? { ago: ago(r.lastSeen.time, now), ship: typeName(names, r.lastSeen.shipTypeId), system: systemName(names, r.lastSeen.systemId), lost: r.lastSeen.isLoss }
      : null,
    last7Days: r ? { kills: r.kills7d, losses: r.losses7d } : null,
    last30Days: r && p.profile?.depth === "deep" ? { kills: r.kills30d, losses: r.losses30d } : null,
    affiliation: {
      corporation: p.corporationTicker ? `${p.corporationName ?? "?"} [${p.corporationTicker}]` : p.corporationName,
      alliance: p.allianceName,
      standing: p.standing.cls,
    },
    threat: p.score
      ? {
          tier: p.score.tier,
          score: p.score.composite,
          tags: p.score.tags.map((t) => tagText(EN, t)),
          dimensions: p.score.dimensions
            .filter((d) => d.available)
            .map((d) => ({ dimension: EN.intel.dimensions[d.key], score: d.score, why: reasonText(EN, d.why, now) })),
        }
      : null,
    ships: (p.profile?.hulls ?? []).slice(0, 5).map((s) => ({ ship: typeName(names, s.shipTypeId), class: EN.intel.hullClasses[hullClass(s.groupId)] })),
    timezone: p.profile?.timezone.zone ? EN.intel.timeZones[p.profile.timezone.zone] : null,
    historyWithUs:
      h && h.killsOnUs + h.lossesToUs > 0
        ? { onOurLosses: h.killsOnUs, diedToUs: h.lossesToUs, last: ago(h.lastAt, now), shipsAgainstUs: h.ships.slice(0, 4).map((s) => typeName(names, s.shipTypeId)) }
        : null,
    lifetime: p.profile
      ? {
          kills: p.profile.lifetime.kills,
          losses: p.profile.lifetime.losses,
          dangerRatio: p.profile.lifetime.dangerRatio,
          lastActiveMonth: p.profile.lifetime.lastActiveMonth,
        }
      : null,
  };
}

export function engagementFacts(e: Engagement, names: DisplayNames, pilotNames: Map<number, string>, now: Date) {
  return {
    ago: ago(e.start, now),
    when: eve(e.start),
    system: systemName(names, e.systemId),
    theirPilotsFromThisList: e.pilots.map((p) => pilotNames.get(p.characterId) ?? String(p.characterId)),
    theyBrought: e.brought.slice(0, 10).map((b) => `${b.count > 1 ? `${b.count}× ` : ""}${typeName(names, b.shipTypeId)}`),
    weKilled: e.ourKills,
    weLost: e.ourLosses,
    iskKilled: compact(e.iskKilled),
    iskLost: compact(e.iskLost),
  };
}

export interface BriefingInput {
  scan: { pilotCount: number; createdAt: Date; system: string | null };
  pilots: FactsPilot[];
  summary: GroupSummary;
  engagements: Engagement[];
  names: DisplayNames;
  now: Date;
}

export function briefingFacts(input: BriefingInput) {
  const { names, now } = input;
  const pilotNames = new Map(input.pilots.map((p) => [p.characterId, p.name]));
  const hostile = input.pilots.filter((p) => p.standing.cls !== "own" && p.standing.cls !== "blue");
  const ranked = [...hostile].sort((a, b) => (b.score?.composite ?? -1) - (a.score?.composite ?? -1));
  const detailed = ranked.slice(0, BRIEF_PILOTS);
  const rest = ranked.slice(BRIEF_PILOTS);
  return {
    scan: {
      pilots: input.scan.pilotCount,
      nonFriendly: hostile.length,
      friendly: input.pilots.length - hostile.length,
      system: input.scan.system,
      scannedAt: eve(input.scan.createdAt.toISOString()),
    },
    historyWithUs: {
      engagements: input.engagements.slice(0, 5).map((e) => engagementFacts(e, names, pilotNames, now)),
      totalEngagements: input.engagements.length,
    },
    pilots: detailed.map((p) => pilotFacts(p, names, now)),
    group: {
      tiers: input.summary.tiers,
      likelyComposition: input.summary.comp.map((c) => ({ class: EN.intel.hullClasses[c.cls], pilots: c.pilots })),
      roles: input.summary.roles,
      flyTogether: input.summary.clusters.slice(0, 5).map((c) => c.map((id) => pilotNames.get(id) ?? String(id))),
      groups: input.summary.groups.map((g) => ({
        name: (g.allianceId && names.entities.get(g.allianceId)) || (g.corporationId && names.entities.get(g.corporationId)) || "unaffiliated",
        pilots: g.pilots,
      })),
    },
    otherPilots: rest.length
      ? { count: rest.length, tiers: rest.reduce<Record<string, number>>((acc, p) => ((acc[p.score?.tier ?? "unknown"] = (acc[p.score?.tier ?? "unknown"] ?? 0) + 1), acc), {}) }
      : null,
  };
}

export type BriefingFacts = ReturnType<typeof briefingFacts>;

export function dossierFacts(pilot: FactsPilot, engagements: Engagement[], names: DisplayNames, now: Date) {
  const pilotNames = new Map([[pilot.characterId, pilot.name]]);
  return {
    pilot: pilotFacts(pilot, names, now),
    fightsWithUs: engagements.slice(0, 5).map((e) => engagementFacts(e, names, pilotNames, now)),
    wingmen: (pilot.profile?.associates ?? []).slice(0, 8).map((a) => ({ name: names.entities.get(a.characterId) ?? `pilot ${a.characterId}`, sharedKills: a.sharedKills })),
  };
}

export type DossierFacts = ReturnType<typeof dossierFacts>;

/**
 * Stable hash of facts, ignoring relative times (and the reasons, which
 * contain some), to reuse a recent note for unchanged facts.
 */
export function factsHash(facts: unknown): string {
  const json = JSON.stringify(facts, (key, value) => (key === "ago" || key === "why" ? undefined : value));
  return createHash("sha256").update(json).digest("hex").slice(0, 32);
}

/** D-scan hulls with the computed candidates (only they may be named) and a baseline assignment. */
export function dscanFacts(rows: DscanMatchRow[], pilots: FactsPilot[], names: DisplayNames, now: Date) {
  const byId = new Map(pilots.map((p) => [p.characterId, p]));
  const name = (id: number) => byId.get(id)?.name ?? String(id);
  return {
    dscan: rows.map((r) => ({
      typeId: r.typeId,
      ship: r.name,
      class: EN.intel.hullClasses[r.cls],
      onScan: r.count,
      candidates: r.candidates.map((c) => ({
        id: c.characterId,
        name: name(c.characterId),
        flewThisExactHull: c.exact,
        lastFlown: ago(c.lastAt, now),
        uses: c.uses,
        evidence: Math.round(c.evidence * 100) / 100,
      })),
      computedAssignment: r.assigned.map((a) => ({ id: a.characterId, name: name(a.characterId), confidence: a.confidence })),
    })),
    pilotsInLocal: pilots
      .filter((p) => p.standing.cls !== "own" && p.standing.cls !== "blue")
      .slice(0, 40)
      .map((p) => ({
        id: p.characterId,
        name: p.name,
        lastSeen: p.profile?.recent.lastSeen ? `${typeName(names, p.profile.recent.lastSeen.shipTypeId)} ${ago(p.profile.recent.lastSeen.time, now)} ago` : null,
        tier: p.score?.tier ?? "unknown",
      })),
  };
}

export type DscanFacts = ReturnType<typeof dscanFacts>;
