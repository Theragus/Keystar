import Link from "next/link";
import { TypeIcon } from "@/components/ui/eve-image";
import { getI18n } from "@/i18n/server";
import { CHART_CLASSES, chartClassOf, MOON_RARITY, oreClassColor } from "../class-colors";
import { miningQueryString, type MiningFilters } from "../filters";
import { oreMix } from "../ore-groups";
import type { TypeRow } from "../queries";

/** Ranked bars per ore family, coloured by class; each row filters the page to that ore. */
export async function OreMix({ rows, filters, emptyText }: { rows: TypeRow[]; filters: MiningFilters; emptyText: string }) {
  const { t, f } = await getI18n();
  const m = t.mining.breakdowns;
  const metric = filters.metric;
  const { top, rest, total } = oreMix(rows, metric);
  // Unpriced ore has no value, so the list can be empty even when rows exist.
  if (!top.length) return <p className="py-8 text-center text-sm text-ink-3">{emptyText}</p>;
  const max = Math.max(top[0]?.[metric] ?? 0, rest.amount);
  const classes = new Set(top.map((r) => r.oreClass));
  // Moon ore is shown by rarity, so the legend lists the rarities instead of one "Moon" entry.
  const legend = [
    ...CHART_CLASSES.filter((c) => c.id !== "moon" && [...classes].some((k) => chartClassOf(k) === c.id)).map((c) => ({
      id: c.id,
      color: c.color,
      label: t.mining.chartClasses[c.id],
    })),
    ...MOON_RARITY.filter((r) => classes.has(r.id)).map((r) => ({ id: r.id, color: r.color, label: t.mining.moonRarity[r.id] })),
  ];

  const bar = (amount: number, color: string) => (
    <div className="mt-1.5 h-1.5 rounded-full bg-surface-contrast/5">
      <div className="h-full rounded-full" style={{ width: `${Math.max((amount / max) * 100, 0.5)}%`, background: color }} />
    </div>
  );
  const figures = (amount: number) => (
    <span className="shrink-0 tabular-nums">
      <span className="font-semibold">{f.formatMetric(metric, amount)}</span>
      <span className="ml-2 inline-block w-12 text-right text-xs text-ink-3">{f.percent(amount / total, 1)}</span>
    </span>
  );

  return (
    <div className="space-y-4">
      <ul className="gap-x-8 space-y-1 xl:columns-2 [&>li]:break-inside-avoid">
        {top.map((r) => (
          <li key={r.key}>
            <Link
              href={`?${miningQueryString(filters, { types: r.typeIds, page: 1 })}`}
              scroll={false}
              title={m.filterByOre(r.name)}
              className="flex items-center gap-3 rounded-xl px-2 py-1.5 transition hover:bg-surface-contrast/5"
            >
              <TypeIcon id={r.typeId} size={26} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate font-medium text-ink">{r.name}</span>
                  {figures(r[metric])}
                </div>
                {bar(r[metric], oreClassColor(r.oreClass))}
              </div>
            </Link>
          </li>
        ))}
        {rest.count > 0 && (
          <li>
            <Link
              href={`?${miningQueryString(filters, { types: rest.typeIds, page: 1 })}`}
              scroll={false}
              className="flex items-center gap-3 rounded-xl px-2 py-1.5 transition hover:bg-surface-contrast/5"
            >
              <span className="size-[26px] shrink-0 rounded-md bg-surface-contrast/5" aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate text-ink-2">{m.otherOres(rest.count)}</span>
                  {figures(rest.amount)}
                </div>
                {bar(rest.amount, "var(--series-other)")}
              </div>
            </Link>
          </li>
        )}
      </ul>
      {legend.length > 1 && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1.5 border-t border-surface-contrast/8 pt-3 text-xs text-ink-2">
          {legend.map((l) => (
            <li key={l.id} className="flex items-center gap-1.5">
              <span className="size-2 rounded-[2px]" style={{ background: l.color }} aria-hidden />
              {l.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
