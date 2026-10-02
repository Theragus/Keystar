import { compact } from "@/lib/format";
import { hullClass, type HullClass } from "../hulls";
import type {
  DimensionKey,
  DimensionScore,
  Evidence,
  PilotHistory,
  PilotProfile,
  PilotScore,
  PilotTag,
  Standing,
  TagKey,
  Tier,
} from "../types";
import { clamp, DAY_MS, saturate } from "./decay";

/**
 * Turns a profile into explained scores. Every dimension is 0–100 with a
 * one-line reason; the composite is their weighted average, damped for pilots
 * who are not active right now (the recency gate), so lifetime fame alone
 * never makes a pilot dangerous today.
 */

export const DIMENSION_WEIGHTS: Record<DimensionKey, number> = {
  activity: 0.2,
  lethality: 0.2,
  style: 0.1,
  specialty: 0.15,
  relevance: 0.15,
  history: 0.1,
  timezone: 0.05,
  character: 0.05,
};

const LABELS: Record<DimensionKey, string> = {
  activity: "Recent activity",
  lethality: "Lethality",
  style: "Fighting style",
  specialty: "Specialties",
  relevance: "Nearby",
  history: "History with us",
  timezone: "Active now",
  character: "Character",
};

const TAG_SEVERITY: Record<TagKey, number> = {
  cyno: 25,
  capital: 30,
  blops: 25,
  hunter: 20,
  tackle: 15,
  gatecamper: 15,
  ganker: 15,
  logi: 10,
  fc: 10,
  solo: 10,
  blob: 0,
  newchar: 5,
  npcalt: 5,
  activenow: 0,
};

/** Historic-only tags count this much toward the specialty score. */
const HISTORIC_TAG_FACTOR = 0.25;

export interface ScoreContext {
  now: Date;
  standing: Standing;
  /** Null when no home corporation is set (history unknown). */
  history: PilotHistory | null | undefined;
  historyAvailable: boolean;
  /** The scan's system, if one was given. */
  system: { systemId: number; constellationId: number | null; regionId: number | null } | null;
  /** Constellation and region of the systems in the profile. */
  systemsInfo: Map<number, { constellationId: number | null; regionId: number | null }>;
}

export function tierOf(composite: number): Tier {
  if (composite >= 75) return "extreme";
  if (composite >= 50) return "high";
  if (composite >= 25) return "moderate";
  return "low";
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const ago = (iso: string, now: Date) => {
  const h = (now.getTime() - Date.parse(iso)) / 3_600_000;
  if (h < 1) return "under an hour ago";
  if (h < 48) return `${Math.round(h)} h ago`;
  return `${Math.round(h / 24)} days ago`;
};
const hourRange = (hours: number[]) => {
  if (!hours.length) return null;
  const lo = Math.min(...hours);
  const hi = Math.max(...hours);
  return hi - lo <= 6 ? `${String(lo).padStart(2, "0")}–${String((hi + 1) % 24).padStart(2, "0")}` : hours.map((h) => String(h).padStart(2, "0")).join(", ");
};

/** Share of recent hull use per class, plus when each class was last flown. */
function classUse(profile: PilotProfile) {
  const total = profile.hulls.reduce((s, h) => s + h.weight, 0);
  const byClass = new Map<HullClass, { share: number; lastAt: string | null }>();
  for (const h of profile.hulls) {
    const c = hullClass(h.groupId);
    const e = byClass.get(c) ?? { share: 0, lastAt: null };
    e.share += total ? h.weight / total : 0;
    if (h.lastAt && (!e.lastAt || h.lastAt > e.lastAt)) e.lastAt = h.lastAt;
    byClass.set(c, e);
  }
  return byClass;
}

export function computeTags(profile: PilotProfile, ctx: Pick<ScoreContext, "now">): PilotTag[] {
  const tags: PilotTag[] = [];
  const recentWindow = 30 * DAY_MS;
  const isRecent = (iso: string | null | undefined) => !!iso && ctx.now.getTime() - Date.parse(iso) <= recentWindow;
  const deep = profile.depth === "deep";
  const classes = classUse(profile);
  // Hull evidence is "recent" when the digest saw it in the last 30 days, or from zKillboard's recent ships.
  const hullTag = (cls: HullClass[], minShare: number): { evidence: "recent" | "lifetime"; share: number } | null => {
    let share = 0;
    let lastAt: string | null = null;
    for (const c of cls) {
      const e = classes.get(c);
      if (!e) continue;
      share += e.share;
      if (e.lastAt && (!lastAt || e.lastAt > lastAt)) lastAt = e.lastAt;
    }
    if (share < minShare) return null;
    return { evidence: !deep || isRecent(lastAt) ? "recent" : "lifetime", share };
  };
  const add = (key: TagKey, label: string, evidence: "recent" | "lifetime", why: string) => tags.push({ key, label, evidence, why });
  const pct = (v: number) => `${Math.round(v * 100)}%`;

  const cyno = profile.fits.cyno ?? profile.fits.covertCyno ?? profile.fits.industrialCyno;
  if (cyno) {
    const covert = profile.fits.covertCyno;
    const lastAt = [profile.fits.cyno, profile.fits.covertCyno, profile.fits.industrialCyno]
      .filter(Boolean)
      .map((f) => f!.lastAt)
      .sort()
      .at(-1)!;
    const count = (profile.fits.cyno?.count ?? 0) + (covert?.count ?? 0) + (profile.fits.industrialCyno?.count ?? 0);
    add("cyno", covert ? "Covert cyno" : "Cyno", isRecent(lastAt) ? "recent" : "lifetime", `Cyno fitted on ${plural(count, "lost ship")}, last ${ago(lastAt, ctx.now)}`);
  }

  const capital = hullTag(["capital", "supercapital"], 0.05);
  const capFlags = profile.flags.capital + profile.flags.super + profile.flags.titan;
  if (capital || capFlags > 0) {
    const sup = (classes.get("supercapital")?.share ?? 0) > 0 || profile.flags.super + profile.flags.titan > 0;
    add(
      "capital",
      sup ? "Supercapital" : "Capital",
      capital?.evidence ?? "lifetime",
      capital ? `${pct(capital.share)} of recent activity in capitals` : `On ${plural(capFlags, "capital killmail")} (zKillboard)`,
    );
  }

  const blops = hullTag(["blackOps"], 0.05);
  if (blops || profile.flags.blops > 0) {
    add("blops", "Black Ops", blops?.evidence ?? "lifetime", blops ? `${pct(blops.share)} of recent activity in Black Ops` : "Black Ops kills on zKillboard");
  }

  const gang = profile.decayed.gang;
  const gangTotal = gang.solo + gang.small + gang.fleet + gang.blob;
  const smallShare = gangTotal ? (gang.solo + gang.small) / gangTotal : 0;
  const hunterHulls = hullTag(["hunter", "recon"], 0.2);
  const cloaked = profile.fits.cloak ?? profile.fits.covertCloak;
  if ((hunterHulls || cloaked) && smallShare >= 0.5) {
    add(
      "hunter",
      "Hunter",
      hunterHulls?.evidence ?? (isRecent(cloaked?.lastAt) ? "recent" : "lifetime"),
      hunterHulls ? `${pct(hunterHulls.share)} of activity in covert, bomber or recon hulls, mostly small gang` : "Cloaks on lost ships, mostly small gang",
    );
  }

  const tackle = hullTag(["tackle"], 0.2);
  const tackleFits = (profile.fits.scram?.count ?? 0) + (profile.fits.bubble?.count ?? 0);
  if (tackle || tackleFits >= 2) {
    add("tackle", "Tackle", tackle?.evidence ?? "lifetime", tackle ? `${pct(tackle.share)} of activity in interceptors or dictors` : "Scrams or bubbles on lost ships");
  }

  const logi = hullTag(["logistics"], 0.2);
  if (logi) add("logi", "Logi", logi.evidence, `${pct(logi.share)} of activity in logistics hulls`);

  const k = profile.decayed.kills;
  if (k >= 3 && profile.decayed.gateKills / k >= 0.6) {
    const top = profile.systems[0];
    const topShare = top ? top.weight / profile.systems.reduce((s, x) => s + x.weight, 0) : 0;
    if (topShare >= 0.5 && profile.recent.kills30d >= 8) {
      add("gatecamper", "Gate camper", "recent", `${pct(profile.decayed.gateKills / k)} of recent kills on gates, mostly in one system`);
    }
  }

  const sec = profile.character.securityStatus;
  if (k >= 2 && profile.decayed.highsecKills / k >= 0.5 && sec !== null && sec < -2) {
    add("ganker", "Ganker", "recent", `${pct(profile.decayed.highsecKills / k)} of recent kills in highsec, security status ${sec.toFixed(1)}`);
  }

  if (profile.flags.fcLevel === "medium" || profile.flags.fcLevel === "high") {
    add("fc", "FC", "lifetime", `zKillboard rates their fleet command ${profile.flags.fcLevel}`);
  }

  if (gangTotal >= 1.5 && gang.solo / gangTotal >= 0.5) add("solo", "Solo", "recent", `${pct(gang.solo / gangTotal)} of recent kills solo`);
  if (gangTotal >= 1.5 && gang.blob / gangTotal >= 0.5) add("blob", "Blob", "recent", `${pct(gang.blob / gangTotal)} of recent kills with 25+ pilots`);

  const ageDays = profile.character.ageDays;
  if (ageDays !== null && ageDays < 30) add("newchar", "New char", "recent", `Created ${plural(ageDays, "day")} ago`);
  if (profile.character.npcCorp) add("npcalt", "NPC corp", "recent", "In an NPC corporation");

  return tags;
}

function dimension(key: DimensionKey, score: number, why: string, evidence: Evidence, available = true): DimensionScore {
  return { key, label: LABELS[key], score: Math.round(clamp(score)), weight: DIMENSION_WEIGHTS[key], available, why, evidence };
}

export function scorePilot(profile: PilotProfile | null, ctx: ScoreContext): PilotScore {
  const excluded = ctx.standing.cls === "own" ? "own" : ctx.standing.cls === "blue" ? "blue" : null;
  if (!profile || profile.depth === "none") {
    return { composite: 0, tier: "unknown", recencyGate: 0, dimensions: [], tags: [], excluded, quick: true };
  }
  const deep = profile.depth === "deep";
  const recentEvidence: Evidence = deep || profile.recent.kills7d > 0 ? "recent" : "lifetime";
  const d = profile.decayed;
  const r = profile.recent;
  const dims: DimensionScore[] = [];

  // Activity
  const activity = saturate(d.kills, 6);
  const activityWhy = deep
    ? r.kills30d
      ? `${plural(r.kills7d, "kill")} in 7 days, ${r.kills30d} in 30${r.lastKillAt ? `; last ${ago(r.lastKillAt, ctx.now)}` : ""}`
      : `No kills in 30 days${profile.lifetime.lastActiveMonth ? `; last active ${profile.lifetime.lastActiveMonth}` : ""}`
    : r.kills7d
      ? `${plural(r.kills7d, "kill")} in the last 7 days (zKillboard)`
      : `No kills this week${profile.lifetime.lastActiveMonth ? `; last active ${profile.lifetime.lastActiveMonth}` : ""}`;
  dims.push(dimension("activity", activity, activityWhy, d.kills > 0.05 ? recentEvidence : "none"));

  // Lethality
  const kd = d.kills + d.losses > 0 ? (d.kills / (d.kills + d.losses)) * Math.min(1, d.kills / 4) : 0;
  const isk = clamp(((Math.log10(d.iskDestroyed + 1) - 7) / 3.5) * 100) / 100;
  const fb = d.kills > 0 ? d.finalBlows / d.kills : 0;
  const lethality = deep ? 100 * (0.45 * kd + 0.35 * isk + 0.2 * fb) : 100 * ((0.45 * kd + 0.35 * isk) / 0.8);
  const kdText = d.kills + d.losses > 0 ? `${Math.round((d.kills / (d.kills + d.losses)) * 100)}% kills vs losses` : "no recent fights";
  dims.push(
    dimension(
      "lethality",
      lethality,
      `${kdText}, ${compact(d.iskDestroyed)} ISK destroyed (recency weighted)${deep && d.kills > 0 ? `, final blow on ${Math.round(fb * 100)}%` : ""}`,
      d.kills > 0.05 ? recentEvidence : "none",
    ),
  );

  // Style
  const g = d.gang;
  const gangTotal = g.solo + g.small + g.fleet + g.blob;
  const styleRaw = gangTotal ? (100 * (g.solo + 0.8 * g.small + 0.45 * g.fleet + 0.2 * g.blob)) / gangTotal : 0;
  const style = styleRaw * Math.min(1, gangTotal / 2);
  const dominant = gangTotal
    ? (
        [
          ["solo", g.solo],
          ["small gang (2–9)", g.small],
          ["fleets (10–24)", g.fleet],
          ["blobs (25+)", g.blob],
        ] as const
      ).reduce((a, b) => (b[1] > a[1] ? b : a))
    : null;
  dims.push(
    dimension(
      "style",
      style,
      dominant ? `Mostly ${dominant[0]} (${Math.round((dominant[1] / gangTotal) * 100)}%)` : "No recent kills to judge",
      gangTotal > 0.05 ? recentEvidence : "none",
      gangTotal > 0.05,
    ),
  );

  // Specialties
  const tags = computeTags(profile, ctx);
  const specialty = tags.reduce((s, t) => s + TAG_SEVERITY[t.key] * (t.evidence === "recent" ? 1 : HISTORIC_TAG_FACTOR), 0);
  const scoredTags = tags.filter((t) => TAG_SEVERITY[t.key] > 0);
  dims.push(
    dimension(
      "specialty",
      specialty,
      scoredTags.length ? scoredTags.map((t) => (t.evidence === "recent" ? t.label : `${t.label} (historic)`)).join(", ") : "No special roles seen",
      scoredTags.some((t) => t.evidence === "recent") ? "recent" : scoredTags.length ? "lifetime" : "none",
    ),
  );

  // Nearby
  if (ctx.system) {
    let x = 0;
    let here = 0;
    let region = 0;
    for (const s of profile.systems) {
      const info = ctx.systemsInfo.get(s.systemId);
      if (s.systemId === ctx.system.systemId) {
        x += s.weight;
        here += s.count30d;
      } else if (info?.constellationId && info.constellationId === ctx.system.constellationId) {
        x += 0.6 * s.weight;
        region += s.count30d;
      } else if (info?.regionId && info.regionId === ctx.system.regionId) {
        x += 0.3 * s.weight;
        region += s.count30d;
      }
    }
    const why = here || region ? `${plural(here, "killmail")} in this system and ${region} nearby in 30 days` : x > 0 ? "Seen in this area before" : "No activity in this area";
    dims.push(dimension("relevance", saturate(x, 3), why, x > 0 ? (deep ? "recent" : "lifetime") : "none"));
  } else {
    dims.push(dimension("relevance", 0, "No current system given", "none", false));
  }

  // History with us
  const h = ctx.history;
  if (ctx.historyAvailable && h && h.killsOnUs + h.lossesToUs > 0) {
    const score = Math.max(h.killsOnUs > 0 ? 15 : 0, saturate(h.weight, 2));
    const why = `On ${h.killsOnUs} of our losses, lost ${h.lossesToUs} to us${h.lastAt ? `; last ${ago(h.lastAt, ctx.now)}` : ""}`;
    dims.push(dimension("history", score, why, "recent"));
  } else {
    dims.push(
      dimension("history", 0, ctx.historyAvailable ? "Never fought us (on our killboard)" : "No home corporation set", "none", false),
    );
  }

  // Active now
  const hours = d.hours;
  const hourTotal = hours.reduce((a, b) => a + b, 0);
  const nowHour = ctx.now.getUTCHours();
  const aroundNow = [23, 0, 1].reduce((s, o) => s + hours[(nowHour + o) % 24], 0);
  const share = hourTotal ? aroundNow / hourTotal : 0;
  const peak = hourRange(profile.timezone.peakHours);
  dims.push(
    dimension(
      "timezone",
      100 * Math.min(1, share / 0.5),
      hourTotal
        ? `${Math.round(share * 100)}% of activity within an hour of now${peak ? `; peak ${peak} EVE` : ""}${profile.timezone.label ? ` (${profile.timezone.label})` : ""}`
        : "Not enough activity to tell",
      hourTotal ? recentEvidence : "none",
      hourTotal > 0.05,
    ),
  );
  if (hourTotal > 0.5 && share >= 0.25 && d.kills > 0.5) {
    tags.push({ key: "activenow", label: "Active now", evidence: "recent", why: `${Math.round(share * 100)}% of their activity is around this hour` });
  }

  // Character
  const c = profile.character;
  let character = 0;
  const notes: string[] = [];
  if (c.ageDays !== null && c.ageDays < 30) {
    character += 35;
    notes.push(`${plural(c.ageDays, "day")} old`);
  } else if (c.ageDays !== null && c.ageDays < 180) {
    character += 15;
    notes.push(`${Math.round(c.ageDays / 30)} months old`);
  }
  if (c.corpHops365) {
    character += Math.min(30, 6 * c.corpHops365);
    notes.push(`${plural(c.corpHops365, "corporation change")} this year`);
  }
  if (c.npcCorp) {
    character += 15;
    notes.push("NPC corporation");
  }
  if (c.securityStatus !== null && c.securityStatus < -5) {
    character += 20;
    notes.push(`security status ${c.securityStatus.toFixed(1)}`);
  }
  dims.push(dimension("character", character, notes.length ? notes.join(", ") : "Nothing unusual", notes.length ? "recent" : "none"));

  // Composite
  const available = dims.filter((x) => x.available);
  const weightSum = available.reduce((s, x) => s + x.weight, 0);
  const average = weightSum ? available.reduce((s, x) => s + x.weight * x.score, 0) / weightSum : 0;
  const recencyGate = 0.35 + 0.65 * Math.min(1, activity / 50);
  const composite = Math.round(clamp(average * recencyGate));
  return {
    composite,
    tier: tierOf(composite),
    recencyGate: Math.round(recencyGate * 1000) / 1000,
    dimensions: dims,
    tags,
    excluded,
    quick: !deep,
  };
}

