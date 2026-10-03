import { PROFILE_VERSION } from "../constants";
import { fitKeyOf, locationKind } from "../hulls";
import { isNpcCorporation } from "../priority";
import { gangBuckets } from "../stats";
import type { CorpHistoryEntry, FitEvidence, HullUse, LatestEvent, NormalizedStats, PilotProfile, TimeZone } from "../types";
import { DAY_MS, weightAt } from "./decay";

/**
 * Builds a pilot's profile from zKillboard's statistics and the digest of
 * their newest killmails. Everything is weighted by recency: the digest
 * covers the newest killmails exactly, and the monthly statistics fill in
 * the time before it, so nothing is counted twice.
 */

/** One digest row (see intel_pilot_killmails). */
export interface DigestRow {
  killmailId: number;
  killmailTime: Date;
  solarSystemId: number;
  locationId: number | null;
  isLoss: boolean;
  shipTypeId: number | null;
  finalBlow: boolean;
  attackerCount: number;
  totalValue: number;
  solo: boolean;
  npc: boolean;
  otherCharacterId: number | null;
  otherCorporationId: number | null;
  otherAllianceId: number | null;
  otherShipTypeId: number | null;
  allyIds: number[];
  fittedTypeIds: number[];
}

export interface ProfileInput {
  stats: NormalizedStats | null;
  /** Any order; NPC killmails are ignored. */
  digest: DigestRow[];
  /** Oldest time the digest covers; null without a deep pass. */
  coveredSince: Date | null;
  /** type id → group id for hulls and fitted modules. */
  typeGroups: Map<number, number>;
  /** System security, for highsec ganking. */
  systemSecurity: Map<number, number>;
  corpHistory: CorpHistoryEntry[] | null;
  birthday: Date | null;
  securityStatus: number | null;
  corporationId: number | null;
  now: Date;
}

const TZ_LABELS: Record<string, TimeZone> = { "tz:eu": "eu", "tz:use": "use", "tz:usw": "usw", "tz:au": "au", "tz:ru": "ru" };
/** zKillboard's "recent ships" count roughly the last months; one appearance weighs this much. */
const RECENT_SHIP_WEIGHT = 0.15;

function gangOf(attackers: number): "solo" | "small" | "fleet" | "blob" {
  if (attackers <= 1) return "solo";
  if (attackers < 10) return "small";
  if (attackers < 25) return "fleet";
  return "blob";
}

/** Share of a month's span that lies before `until` (the current month counts only its elapsed days). */
function monthSlice(year: number, month: number, until: Date, now: Date): { fraction: number; mid: Date } | null {
  const start = Date.UTC(year, month - 1, 1);
  const monthEnd = Math.min(Date.UTC(year, month, 1), now.getTime());
  const end = Math.min(monthEnd, until.getTime());
  if (end <= start || monthEnd <= start) return null;
  return { fraction: (end - start) / (monthEnd - start), mid: new Date((start + end) / 2) };
}

export function buildProfile(input: ProfileInput): PilotProfile {
  const { stats, now } = input;
  const rows = input.digest.filter((r) => !r.npc).sort((a, b) => b.killmailTime.getTime() - a.killmailTime.getTime());
  const deep = rows.length > 0 || !!input.coveredSince;
  const age = (t: Date) => now.getTime() - t.getTime();

  // --- Exact recent activity from the digest ------------------------------
  const kills = rows.filter((r) => !r.isLoss);
  const losses = rows.filter((r) => r.isLoss);
  const within = (list: DigestRow[], days: number) => list.filter((r) => age(r.killmailTime) <= days * DAY_MS).length;

  const decayed = {
    kills: 0,
    losses: 0,
    iskDestroyed: 0,
    iskLost: 0,
    finalBlows: 0,
    gang: { solo: 0, small: 0, fleet: 0, blob: 0 },
    hours: Array<number>(24).fill(0),
    gateKills: 0,
    highsecKills: 0,
  };
  const hulls = new Map<number, HullUse>();
  const systems = new Map<number, { systemId: number; weight: number; count30d: number }>();
  const fits: FitEvidence = {};
  const allies = new Map<number, number>();

  const countHull = (shipTypeId: number | null, w: number, time: Date | null) => {
    if (!shipTypeId) return;
    const h = hulls.get(shipTypeId) ?? { shipTypeId, groupId: input.typeGroups.get(shipTypeId) ?? null, weight: 0, count: 0, lastAt: null };
    h.weight += w;
    h.count++;
    if (time && (!h.lastAt || time.toISOString() > h.lastAt)) h.lastAt = time.toISOString();
    hulls.set(shipTypeId, h);
  };

  for (const r of rows) {
    const w = weightAt(r.killmailTime, now);
    countHull(r.shipTypeId, w, r.killmailTime);
    const s = systems.get(r.solarSystemId) ?? { systemId: r.solarSystemId, weight: 0, count30d: 0 };
    s.weight += w;
    if (age(r.killmailTime) <= 30 * DAY_MS) s.count30d++;
    systems.set(r.solarSystemId, s);
    if (r.isLoss) {
      decayed.losses += w;
      decayed.iskLost += w * r.totalValue;
      for (const typeId of r.fittedTypeIds) {
        const key = fitKeyOf(typeId, input.typeGroups.get(typeId));
        if (!key) continue;
        const f = fits[key] ?? { count: 0, lastAt: r.killmailTime.toISOString() };
        f.count++;
        if (r.killmailTime.toISOString() > f.lastAt) f.lastAt = r.killmailTime.toISOString();
        fits[key] = f;
      }
    } else {
      decayed.kills += w;
      decayed.iskDestroyed += w * r.totalValue;
      if (r.finalBlow) decayed.finalBlows += w;
      decayed.gang[gangOf(r.attackerCount)] += w;
      decayed.hours[r.killmailTime.getUTCHours()] += w;
      if (locationKind(r.locationId) === "gate") decayed.gateKills += w;
      if ((input.systemSecurity.get(r.solarSystemId) ?? 0) >= 0.45) decayed.highsecKills += w;
      for (const a of r.allyIds) allies.set(a, (allies.get(a) ?? 0) + 1);
    }
  }

  // --- Older activity from the monthly statistics -------------------------
  // With a digest the months fill in the time before it. Without one, zKillboard's
  // "last 7 days" counter stands in for the newest week and the months for the rest.
  const lastWeek = new Date(now.getTime() - 7 * DAY_MS);
  const killsUntil = input.coveredSince ?? (deep ? now : lastWeek);
  const restUntil = input.coveredSince ?? now;
  let statsKills = 0;
  if (stats) {
    for (const m of stats.months) {
      const k = monthSlice(m.year, m.month, killsUntil, now);
      if (k) {
        const w = weightAt(k.mid, now);
        statsKills += m.kills * k.fraction * w;
        decayed.kills += m.kills * k.fraction * w;
      }
      const r = monthSlice(m.year, m.month, restUntil, now);
      if (r) {
        const w = weightAt(r.mid, now);
        decayed.losses += m.losses * r.fraction * w;
        decayed.iskDestroyed += m.iskDestroyed * r.fraction * w;
        decayed.iskLost += m.iskLost * r.fraction * w;
      }
    }
    if (!deep && stats.activePvp?.kills) {
      const w = weightAt(new Date(now.getTime() - 3.5 * DAY_MS), now);
      statsKills += stats.activePvp.kills * w;
      decayed.kills += stats.activePvp.kills * w;
    }
    if (statsKills > 0) {
      const l = stats.labels;
      const total = (c: ReturnType<typeof gangBuckets>) => c.solo + c.small + c.fleet + c.blob;
      const buckets = [gangBuckets(l.weekly), gangBuckets(l.recent), gangBuckets(l.lifetime)].find((b) => total(b) >= 5);
      if (buckets) {
        const t = total(buckets);
        decayed.gang.solo += (statsKills * buckets.solo) / t;
        decayed.gang.small += (statsKills * buckets.small) / t;
        decayed.gang.fleet += (statsKills * buckets.fleet) / t;
        decayed.gang.blob += (statsKills * buckets.blob) / t;
      }
      if (stats.activity) {
        const byHour = Array.from({ length: 24 }, (_, h) => stats.activity!.reduce((s, day) => s + day[h], 0));
        const sum = byHour.reduce((a, b) => a + b, 0);
        if (sum) byHour.forEach((v, h) => (decayed.hours[h] += (statsKills * v) / sum));
      }
    }
    if (!rows.length) {
      for (const s of stats.recentShips) {
        const h = hulls.get(s.shipTypeId) ?? { shipTypeId: s.shipTypeId, groupId: s.groupId, weight: 0, count: 0, lastAt: null };
        h.weight += s.appearances * RECENT_SHIP_WEIGHT;
        h.count += s.appearances;
        hulls.set(s.shipTypeId, h);
      }
      for (const s of stats.topSystems) {
        const e = systems.get(s.systemId) ?? { systemId: s.systemId, weight: 0, count30d: 0 };
        e.weight += s.kills * 0.05;
        systems.set(s.systemId, e);
      }
    }
  }

  // --- Character ------------------------------------------------------------
  const birthday = input.birthday ?? (stats?.info.birthday ? new Date(stats.info.birthday) : null);
  const hops = (input.corpHistory ?? []).filter((c) => age(new Date(c.startDate)) <= 365 * DAY_MS).length;
  const latest: LatestEvent[] = rows.slice(0, 10).map((r) => ({
    killmailId: r.killmailId,
    time: r.killmailTime.toISOString(),
    isLoss: r.isLoss,
    shipTypeId: r.shipTypeId,
    otherShipTypeId: r.otherShipTypeId,
    otherCharacterId: r.otherCharacterId,
    otherCorporationId: r.otherCorporationId,
    otherAllianceId: r.otherAllianceId,
    systemId: r.solarSystemId,
    attackerCount: r.attackerCount,
    solo: r.solo,
    finalBlow: r.finalBlow,
    value: r.totalValue,
  }));
  const seen = rows[0];

  // --- Timezone ---------------------------------------------------------------
  const hourTotal = decayed.hours.reduce((a, b) => a + b, 0);
  const peakHours = hourTotal
    ? decayed.hours
        .map((v, h) => ({ v, h }))
        .sort((a, b) => b.v - a.v)
        .slice(0, 4)
        .filter((x) => x.v > 0)
        .map((x) => x.h)
        .sort((a, b) => a - b)
    : [];
  const tzLabels = stats ? (Object.keys(stats.labels.recent).length ? stats.labels.recent : stats.labels.lifetime) : {};
  const tz = Object.entries(TZ_LABELS)
    .map(([key, zone]) => ({ zone, n: (tzLabels[key]?.kills ?? 0) + (tzLabels[key]?.losses ?? 0) }))
    .sort((a, b) => b.n - a.n)[0];

  const lastActive = stats?.months.filter((m) => m.kills + m.losses > 0).at(-1);
  const associates = new Map<number, { characterId: number; sharedKills: number; source: "digest" | "stats" }>();
  for (const [characterId, n] of allies) associates.set(characterId, { characterId, sharedKills: n, source: "digest" });
  for (const a of stats?.associates ?? []) {
    if (!associates.has(a.characterId)) associates.set(a.characterId, { ...a, source: "stats" });
  }

  const round = (v: number) => Math.round(v * 1000) / 1000;
  return {
    version: PROFILE_VERSION,
    builtAt: now.toISOString(),
    depth: deep ? "deep" : stats ? "stats" : "none",
    recent: {
      latest,
      lastSeen: seen ? { time: seen.killmailTime.toISOString(), shipTypeId: seen.shipTypeId, systemId: seen.solarSystemId, isLoss: seen.isLoss } : null,
      kills7d: rows.length ? within(kills, 7) : (stats?.activePvp?.kills ?? 0),
      kills30d: within(kills, 30),
      kills90d: within(kills, 90),
      losses7d: within(losses, 7),
      losses30d: within(losses, 30),
      lastKillAt: kills[0]?.killmailTime.toISOString() ?? null,
      coveredSince: input.coveredSince?.toISOString() ?? null,
    },
    decayed: {
      kills: round(decayed.kills),
      losses: round(decayed.losses),
      iskDestroyed: Math.round(decayed.iskDestroyed),
      iskLost: Math.round(decayed.iskLost),
      finalBlows: round(decayed.finalBlows),
      gang: {
        solo: round(decayed.gang.solo),
        small: round(decayed.gang.small),
        fleet: round(decayed.gang.fleet),
        blob: round(decayed.gang.blob),
      },
      hours: decayed.hours.map(round),
      gateKills: round(decayed.gateKills),
      highsecKills: round(decayed.highsecKills),
    },
    hulls: [...hulls.values()]
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 15)
      .map((h) => ({ ...h, weight: round(h.weight) })),
    systems: [...systems.values()]
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 15)
      .map((s) => ({ ...s, weight: round(s.weight) })),
    fits,
    associates: [...associates.values()].sort((a, b) => b.sharedKills - a.sharedKills).slice(0, 30),
    lifetime: {
      kills: stats?.kills ?? 0,
      losses: stats?.losses ?? 0,
      iskDestroyed: stats?.iskDestroyed ?? 0,
      iskLost: stats?.iskLost ?? 0,
      soloKills: stats?.soloKills ?? 0,
      dangerRatio: stats?.dangerRatio ?? null,
      gangRatio: stats?.gangRatio ?? null,
      soloRatio: stats?.soloRatio ?? null,
      avgGangSize: stats?.avgGangSize ?? null,
      lastActiveMonth: lastActive ? `${lastActive.year}-${String(lastActive.month).padStart(2, "0")}` : null,
    },
    character: {
      ageDays: birthday && !Number.isNaN(birthday.getTime()) ? Math.floor(age(birthday) / DAY_MS) : null,
      corpHops365: hops,
      npcCorp: isNpcCorporation(input.corporationId),
      securityStatus: input.securityStatus ?? stats?.info.securityStatus ?? null,
    },
    timezone: { peakHours, zone: tz && tz.n > 0 ? tz.zone : null, heat: stats?.activity ?? null },
    flags: {
      blops: stats?.activityTags?.blops ?? 0,
      logi: stats?.activityTags?.logi ?? 0,
      capital: stats?.activityTags?.capital ?? 0,
      super: stats?.activityTags?.super ?? 0,
      titan: stats?.activityTags?.titan ?? 0,
      fcLevel: stats?.fc?.level ?? null,
    },
  };
}
