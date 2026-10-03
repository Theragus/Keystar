import type { BriefingFacts, DossierFacts, DscanFacts } from "./facts";
import type { Briefing, Dossier, DscanRead, ThreatLevel } from "./types";

/**
 * Plain briefings written from the same facts when Claude is not configured,
 * not allowed or unavailable. Deterministic and factual, recent activity first.
 */

const list = (items: string[]) => (items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function threatLevelOf(facts: BriefingFacts): ThreatLevel {
  const t = facts.group.tiers;
  const recentLoss = facts.historyWithUs.engagements.some((e) => e.weLost > e.weKilled && e.ago !== null && !/days/.test(e.ago));
  if (t.extreme >= 2 || (t.extreme >= 1 && (facts.group.roles.cyno > 0 || facts.group.roles.capital > 0)) || (t.extreme + t.high >= 3 && recentLoss)) return "critical";
  if (t.extreme >= 1 || t.high >= 2) return "high";
  if (t.high >= 1 || t.moderate >= 2) return "elevated";
  if (t.moderate >= 1) return "low";
  return "minimal";
}

const ADVICE: Record<ThreatLevel, string> = {
  minimal: "Nobody here has been dangerous lately; operate normally and keep an eye on local.",
  low: "Little recent activity; stay aligned and watch d-scan.",
  elevated: "Some active PvP pilots are here; travel aligned, avoid lingering on gates and keep a scout out.",
  high: "Active, dangerous pilots are here; avoid solo travel and expect tackle on gates.",
  critical: "An active, dangerous group is here; dock up or form a fleet before undocking.",
};

export function templateBriefing(facts: BriefingFacts): Briefing {
  const level = threatLevelOf(facts);
  const active = facts.pilots.filter((p) => (p.last7Days?.kills ?? 0) > 0);
  const top = facts.pilots.filter((p) => p.threat && (p.threat.tier === "high" || p.threat.tier === "extreme")).slice(0, 5);
  const where = facts.scan.system ? ` in **${facts.scan.system}**` : "";

  const recent = active.length
    ? `${plural(active.length, "pilot")} got kills in the last week; most recently ${list(
        active.slice(0, 3).map((p) => {
          const k = p.latestKillmails[0];
          return k ? `{@${p.name}} (${k.type === "kill" ? "a kill" : "a loss"} in **${k.ship ?? "a ship"}**, ${k.ago} ago)` : `{@${p.name}}`;
        }),
      )}.`
    : `None of the ${plural(facts.scan.nonFriendly, "non-friendly pilot")}${where} got a kill in the last week.`;

  const paragraphs: string[] = [];
  if (top.length) {
    paragraphs.push(
      `Most dangerous right now: ${list(top.map((p) => `{@${p.name}} (${p.threat!.tier}${p.threat!.tags.length ? `, ${p.threat!.tags.slice(0, 3).join(", ")}` : ""})`))}.`,
    );
  }
  const comp = facts.group.likelyComposition.slice(0, 4);
  const roles = Object.entries(facts.group.roles)
    .filter(([, n]) => n > 0)
    .map(([role, n]) => `${n} ${role}`);
  if (comp.length || roles.length) {
    paragraphs.push(
      `${comp.length ? `Likely flying ${list(comp.map((c) => `${c.pilots} ${c.class.toLowerCase()}`))}` : "No recent hulls on record"}${roles.length ? `; roles seen: ${list(roles)}` : ""}.${facts.group.flyTogether.length ? ` ${list(facts.group.flyTogether.slice(0, 2).map((g) => g.map((n) => `{@${n}}`).join(", ")))} fly together.` : ""}`,
    );
  }
  const fight = facts.historyWithUs.engagements[0];
  if (fight) {
    paragraphs.push(
      `We last fought ${list(fight.theirPilotsFromThisList.slice(0, 4).map((n) => `{@${n}}`))} ${fight.ago} ago in **${fight.system}**: they brought ${list(fight.theyBrought.slice(0, 5))}; we killed ${fight.weKilled} ({+${fight.iskKilled} ISK}) and lost ${fight.weLost} ({-${fight.iskLost} ISK}).`,
    );
  }
  return {
    headline: `${facts.scan.nonFriendly} non-friendly pilot${facts.scan.nonFriendly === 1 ? "" : "s"}${facts.scan.system ? ` in ${facts.scan.system}` : ""}: threat ${level}`,
    threatLevel: level,
    recent,
    paragraphs,
    keyPilots: top.map((p) => ({ characterId: p.id, note: p.threat!.dimensions[0]?.why ?? `${p.threat!.tier} threat` })),
    advice: ADVICE[level],
  };
}

export function templateDossier(facts: DossierFacts): Dossier {
  const p = facts.pilot;
  const k = p.latestKillmails[0];
  const tier = p.threat?.tier ?? "unknown";
  const recentActivity = k
    ? `Latest: ${k.type === "kill" ? "a kill" : "a loss"} in **${k.ship ?? "a ship"}** ${k.ago} ago in **${k.system ?? "?"}**. ${p.last7Days?.kills ?? 0} kills in the last 7 days${p.last30Days ? `, ${p.last30Days.kills} in 30` : ""}.`
    : `No recent killmails${p.lifetime?.lastActiveMonth ? `; last active ${p.lifetime.lastActiveMonth}` : ""}.`;
  const style = p.threat?.dimensions.find((d) => d.dimension === "Fighting style")?.why;
  return {
    summary: `{@${p.name}} is a ${tier} threat${p.threat ? ` (${p.threat.score})` : ""}${p.threat?.tags.length ? `: ${p.threat.tags.join(", ")}` : ""}.`,
    recentActivity,
    playstyle: [style, p.ships.length ? `Flies ${list(p.ships.slice(0, 3).map((s) => s.ship ?? "?"))}` : null, p.timezone ? `mostly ${p.timezone} time zone` : null]
      .filter(Boolean)
      .join("; "),
    watchFor: (p.threat?.tags ?? []).slice(0, 4),
    historyWithUs: p.historyWithUs
      ? `On ${p.historyWithUs.onOurLosses} of our losses and died to us ${p.historyWithUs.diedToUs} times; last ${p.historyWithUs.last} ago.`
      : null,
    confidence: p.last30Days && (p.last30Days.kills + p.last30Days.losses) >= 10 ? "high" : k ? "medium" : "low",
  };
}

export function templateDscan(facts: DscanFacts): DscanRead {
  const ships = facts.dscan.reduce((n, r) => n + r.onScan, 0);
  const classes = new Map<string, number>();
  for (const r of facts.dscan) classes.set(r.class, (classes.get(r.class) ?? 0) + r.onScan);
  const comp = [...classes.entries()].sort((a, b) => b[1] - a[1]).map(([c, n]) => `${n} ${c.toLowerCase()}`);
  const assignments = facts.dscan.flatMap((r) =>
    r.computedAssignment.map((a) => {
      const c = r.candidates.find((x) => x.id === a.id);
      return {
        typeId: r.typeId,
        characterId: a.id,
        confidence: a.confidence,
        reason: c?.flewThisExactHull ? `Flew this hull${c.lastFlown ? ` ${c.lastFlown} ago` : " before"}` : `Flies ${r.class.toLowerCase()} hulls`,
      };
    }),
  );
  const unplaced = facts.dscan.filter((r) => r.computedAssignment.length < r.onScan).map((r) => r.ship);
  return {
    assessment: `${plural(ships, "ship")} on scan: ${list(comp.slice(0, 5))}. ${assignments.length ? `${plural(assignments.length, "pilot")} from local match a hull they flew recently.` : "No pilot in local has flown these hulls recently."}`,
    assignments,
    notes: unplaced.length ? `Nobody in local is known to fly ${list([...new Set(unplaced)].slice(0, 5))}; they may be off the list or in new hulls.` : "",
  };
}
