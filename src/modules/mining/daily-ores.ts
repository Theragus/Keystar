import type { Messages } from "@/i18n/messages";
import { chartClassOf, ORE_SERIES_COLORS, ORE_SERIES_OTHER_COLOR, type ChartClass } from "./class-colors";
import { oreFamily } from "./ore-groups";
import type { DailyTypeRow } from "./queries";

/** Ores shown on their own per class; the rest fold into one "other" series. */
export const ORE_SERIES_LIMIT = 6;

export interface OreSeries {
  /** Recharts data key: `s0`, `s1`, … in rank order. */
  key: string;
  name: string;
  /** The family's representative type, for its icon. */
  typeId: number;
}

/** The per-ore view of one class: its largest ore families, then the rest folded into `other`. */
export interface OreDrill {
  series: OreSeries[];
  /** How many families `other` combines; 0 when there is no other series. */
  otherCount: number;
  rows: { date: string; total: number; values: Record<string, number> }[];
}

/**
 * Splits each chart class into its ore families per day, ranked by the period total.
 * `days` is the chart's full day list, so days without mining stay on the axis.
 */
export function dailyOreDrill(
  rows: DailyTypeRow[],
  days: string[],
  limit = ORE_SERIES_LIMIT,
): Partial<Record<ChartClass, OreDrill>> {
  const families = new Map<
    string,
    {
      cls: ChartClass;
      name: string;
      typeId: number;
      rank: number;
      total: number;
    }
  >();
  for (const r of rows) {
    if (r.amount <= 0) continue;
    const fam = oreFamily(r.name, r.oreClass);
    const entry = families.get(fam.key);
    if (!entry)
      families.set(fam.key, {
        cls: chartClassOf(r.oreClass),
        name: fam.name,
        typeId: r.typeId,
        rank: fam.rank,
        total: r.amount,
      });
    else {
      entry.total += r.amount;
      // The icon is the lowest grade's, i.e. the plain ore.
      if (fam.rank < entry.rank) Object.assign(entry, { rank: fam.rank, typeId: r.typeId });
    }
  }

  const byClass = new Map<ChartClass, { key: string; name: string; typeId: number; total: number }[]>();
  for (const [key, f] of families) byClass.set(f.cls, [...(byClass.get(f.cls) ?? []), { key, ...f }]);

  const out: Partial<Record<ChartClass, OreDrill>> = {};
  const seriesOf = new Map<string, string>();
  for (const [cls, list] of byClass) {
    list.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
    // A folded series of one family is no simpler than showing it.
    const shown = list.length === limit + 1 ? list.length : limit;
    const series = list.slice(0, shown).map((f, i) => ({ key: `s${i}`, name: f.name, typeId: f.typeId }));
    list.forEach((f, i) => seriesOf.set(f.key, i < shown ? `s${i}` : "other"));
    const keys = [...series.map((s) => s.key), ...(list.length > shown ? ["other"] : [])];
    out[cls] = {
      series,
      otherCount: Math.max(0, list.length - shown),
      rows: days.map((date) => ({
        date,
        total: 0,
        values: Object.fromEntries(keys.map((k) => [k, 0])),
      })),
    };
  }

  const dayIndex = new Map(days.map((d, i) => [d, i]));
  for (const r of rows) {
    const i = dayIndex.get(r.date);
    if (i === undefined || r.amount <= 0) continue;
    const day = out[chartClassOf(r.oreClass)]!.rows[i];
    day.values[seriesOf.get(oreFamily(r.name, r.oreClass).key)!] += r.amount;
    day.total += r.amount;
  }
  return out;
}

/** Chart series of a per-ore view: its ores in rank order, then the folded rest. */
export function oreSeries(drill: OreDrill, t: Messages): { id: string; color: string; label: string }[] {
  return [
    ...drill.series.map((s, i) => ({
      id: s.key,
      color: ORE_SERIES_COLORS[i],
      label: s.name,
    })),
    ...(drill.otherCount
      ? [
          {
            id: "other",
            color: ORE_SERIES_OTHER_COLOR,
            label: t.mining.chart.otherOres(drill.otherCount),
          },
        ]
      : []),
  ];
}

/** Period totals of each series of a per-ore view. */
export function oreTotals(drill: OreDrill): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of drill.rows) for (const [k, v] of Object.entries(r.values)) out[k] = (out[k] ?? 0) + v;
  return out;
}
