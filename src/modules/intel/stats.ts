import type { LabelCounts, NormalizedStats, ShipUse } from "./types";

/**
 * Reads zKillboard's character statistics leniently: the endpoint is only
 * loosely documented and pilots with little history miss most keys, so every
 * field is optional and anything unexpected is ignored.
 */

type Raw = Record<string, unknown>;

const obj = (v: unknown): Raw | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : null);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const num = (v: unknown): number => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
};
const numOrNull = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};
const id = (v: unknown): number | null => {
  const n = num(v);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
};
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

function labels(v: unknown): LabelCounts {
  const out: LabelCounts = {};
  for (const [key, value] of Object.entries(obj(v) ?? {})) {
    const o = obj(value);
    if (o) out[key] = { kills: num(o.shipsDestroyed), losses: num(o.shipsLost) };
  }
  return out;
}

function ships(v: unknown): ShipUse[] {
  return arr(v)
    .map((s) => obj(s))
    .filter((s): s is Raw => !!s && !!id(s.shipTypeID))
    .map((s) => ({
      shipTypeId: id(s.shipTypeID)!,
      groupId: id(s.groupID),
      kills: num(s.kills),
      losses: num(s.losses),
      appearances: num(s.appearances) || num(s.kills) + num(s.losses),
    }))
    .slice(0, 20);
}

/** Weekday (0 = Sunday) × EVE hour kill counts, or null without data. */
function activity(v: unknown): number[][] | null {
  const o = obj(v);
  if (!o) return null;
  const grid = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  let total = 0;
  for (let day = 0; day < 7; day++) {
    for (const [hour, count] of Object.entries(obj(o[String(day)]) ?? {})) {
      const h = Number(hour);
      if (Number.isInteger(h) && h >= 0 && h < 24) {
        grid[day][h] = num(count);
        total += grid[day][h];
      }
    }
  }
  return total ? grid : null;
}

export function normalizeStats(raw: Raw): NormalizedStats {
  const active = obj(raw.activepvp);
  const activeCount = (key: string) => num(obj(active?.[key])?.count);
  const months = Object.values(obj(raw.months) ?? {})
    .map((m) => obj(m))
    .filter((m): m is Raw => !!m && num(m.year) > 2000 && num(m.month) >= 1)
    .map((m) => ({
      year: num(m.year),
      month: num(m.month),
      kills: num(m.shipsDestroyed),
      losses: num(m.shipsLost),
      iskDestroyed: num(m.iskDestroyed),
      iskLost: num(m.iskLost),
    }))
    .sort((a, b) => a.year - b.year || a.month - b.month);
  const groups = Object.values(obj(raw.groups) ?? {})
    .map((g) => obj(g))
    .filter((g): g is Raw => !!g && !!id(g.groupID))
    .map((g) => ({ groupId: id(g.groupID)!, kills: num(g.shipsDestroyed), losses: num(g.shipsLost) }));
  const fc = obj(raw.fc);
  const tags = obj(raw.activityTags);
  const systemList = arr(raw.topLists)
    .map((t) => obj(t))
    .find((t) => t?.type === "solarSystem");
  const info = obj(raw.info) ?? {};

  return {
    kills: num(raw.shipsDestroyed),
    losses: num(raw.shipsLost),
    iskDestroyed: num(raw.iskDestroyed),
    iskLost: num(raw.iskLost),
    soloKills: num(raw.soloKills),
    soloLosses: num(raw.soloLosses),
    dangerRatio: numOrNull(raw.dangerRatio),
    gangRatio: numOrNull(raw.gangRatio),
    soloRatio: numOrNull(raw.soloRatio),
    avgGangSize: numOrNull(raw.avgGangSize),
    activePvp:
      active && Object.keys(active).length
        ? { kills: activeCount("kills"), ships: activeCount("ships"), systems: activeCount("systems"), regions: activeCount("regions") }
        : null,
    months,
    groups,
    recentShips: ships(raw.recentShips),
    topShips: ships(raw.topShips),
    associates: arr(raw.associates)
      .map((a) => obj(a))
      .filter((a): a is Raw => !!a && !!id(a.characterID))
      .map((a) => ({ characterId: id(a.characterID)!, sharedKills: num(a.sharedKills) }))
      .slice(0, 50),
    activity: activity(raw.activity),
    labels: { lifetime: labels(raw.labels), recent: labels(raw.recentLabels), weekly: labels(raw.weeklyLabels) },
    fc: fc ? { level: str(fc.level), score: numOrNull(fc.score) } : null,
    activityTags: tags
      ? { blops: num(tags.blops), logi: num(tags.logi), capital: num(tags.capital), super: num(tags.super), titan: num(tags.titan) }
      : null,
    topSystems: arr(obj(systemList)?.values)
      .map((v) => obj(v))
      .filter((v): v is Raw => !!v && !!id(v.solarSystemID))
      .map((v) => ({ systemId: id(v.solarSystemID)!, kills: num(v.kills) }))
      .slice(0, 10),
    info: {
      name: str(info.name),
      corporationId: id(info.corporationID),
      allianceId: id(info.allianceID),
      birthday: str(info.birthday),
      securityStatus: numOrNull(info.secStatus),
    },
  };
}

/** Gang-size buckets from zKillboard's exclusive "#:" labels (1, 2–4, 5–9, 10–24, 25–49, 50–99, 100+). */
export function gangBuckets(l: LabelCounts, side: "kills" | "losses" = "kills") {
  const v = (key: string) => l[key]?.[side] ?? 0;
  return {
    solo: v("#:1"),
    small: v("#:2+") + v("#:5+"),
    fleet: v("#:10+"),
    blob: v("#:25+") + v("#:50+") + v("#:100+") + v("#:1000+"),
  };
}
