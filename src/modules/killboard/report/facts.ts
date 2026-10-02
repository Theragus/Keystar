import { compact } from "@/lib/format";
import { rangeLabel, ycYear, type DateRange } from "../filters";
import { efficiency, getNotable, getPilots, getShips, getTopSystems, getTotals, type Totals } from "../queries";
import type { ReportFacts, WeekTotalsFacts } from "./types";

const iskText = (v: number) => (v > 0 ? compact(v) : "0");

function pct(t: Totals): number | null {
  const e = efficiency(t.iskDestroyed, t.iskLost);
  return e === null ? null : Math.round(e * 1000) / 10;
}

function totalsFacts(t: Totals): WeekTotalsFacts {
  const e = pct(t);
  return {
    kills: t.kills,
    losses: t.losses,
    iskDestroyed: iskText(t.iskDestroyed),
    iskLost: iskText(t.iskLost),
    efficiency: e === null ? null : `${e.toFixed(1)}%`,
    soloKills: t.soloKills,
  };
}

/** Everything the situation report may say, computed from stored killmails. */
export async function buildReportFacts(
  corp: { id: number; name: string; ticker: string | null },
  week: DateRange,
  prevWeek: DateRange,
): Promise<ReportFacts> {
  // The report window is the "period" here, so period counts are this week's.
  const windows = { period: week, week, prevWeek };
  const [current, previous, pilots, ships, killSystems, lossSystems, biggestKill, biggestLoss] = await Promise.all([
    getTotals(corp.id, week),
    getTotals(corp.id, prevWeek),
    getPilots(corp.id, windows),
    getShips(corp.id, windows),
    getTopSystems(corp.id, windows, "kills", 3),
    getTopSystems(corp.id, windows, "losses", 3),
    getNotable(corp.id, week, "kills"),
    getNotable(corp.id, week, "losses"),
  ]);
  const [e, pe] = [pct(current), pct(previous)];

  return {
    corporation: { name: corp.name, ticker: corp.ticker },
    window: { ...week, label: rangeLabel(week), yc: ycYear(week.to) },
    previousWindow: { ...prevWeek, label: rangeLabel(prevWeek) },
    week: totalsFacts(current),
    previousWeek: totalsFacts(previous),
    change: {
      kills: current.kills - previous.kills,
      losses: current.losses - previous.losses,
      efficiencyPoints: e !== null && pe !== null ? Math.round((e - pe) * 10) / 10 : null,
    },
    topPilots: pilots
      .filter((p) => p.kills > 0 && p.name)
      .slice(0, 6)
      .map((p) => ({
        name: p.name!,
        kills: p.kills,
        previousKills: p.kills - p.killsDelta,
        finalBlows: p.finalBlows,
        soloKills: p.solo,
        iskDestroyed: iskText(p.destroyed),
        losses: p.losses,
      })),
    topShips: ships
      .filter((s) => s.kills > 0 && s.name)
      .sort((a, b) => b.kills - a.kills || b.killsDelta - a.killsDelta)
      .slice(0, 5)
      .map((s) => ({ name: s.name!, kills: s.kills, change: s.killsDelta })),
    lostShips: ships
      .filter((s) => s.losses > 0 && s.name)
      .sort((a, b) => b.lost - a.lost)
      .slice(0, 3)
      .map((s) => ({ name: s.name!, losses: s.losses, iskLost: iskText(s.lost) })),
    killSystems: killSystems.map((s) => ({ name: s.name ?? `System ${s.systemId}`, kills: s.count, change: s.week - s.prevWeek })),
    lossSystems: lossSystems.map((s) => ({ name: s.name ?? `System ${s.systemId}`, losses: s.count, change: s.week - s.prevWeek })),
    biggestKill: biggestKill
      ? {
          ship: biggestKill.shipName ?? "Unknown hull",
          victim: biggestKill.victimName,
          system: biggestKill.systemName ?? "unknown space",
          value: iskText(biggestKill.value),
          finalBlow: biggestKill.finalBlowName,
        }
      : null,
    biggestLoss: biggestLoss
      ? {
          ship: biggestLoss.shipName ?? "Unknown hull",
          victim: biggestLoss.victimName,
          system: biggestLoss.systemName ?? "unknown space",
          value: iskText(biggestLoss.value),
        }
      : null,
  };
}
