import Link from "next/link";
import { Portrait, TypeIcon } from "@/components/ui/eve-image";
import { SecurityStatus } from "@/components/ui/security";
import { ORE_CLASS_META } from "@/core/eve/ore";
import { compact, formatMetric, integer, isk, percent, unitPrice, volume } from "@/lib/format";
import { CHART_CLASSES, MOON_RARITY, oreClassColor, toChartClasses } from "../class-colors";
import { miningQueryString, type MiningFilters } from "../filters";
import type { ClassValues, MemberRow, SystemRow, TypeRow } from "../queries";

type Metric = MiningFilters["metric"];

/** Thin stacked bar showing class composition; 2px gaps between segments. */
function CompositionBar({ values, max }: { values: ClassValues; max: number }) {
  const byClass = toChartClasses(values);
  const total = Object.values(byClass).reduce((a, b) => a + b, 0);
  const widthPct = max > 0 ? (total / max) * 100 : 0;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-white/4">
      <div className="flex h-full gap-[2px]" style={{ width: `${Math.max(widthPct, 0.5)}%` }}>
        {CHART_CLASSES.filter((c) => byClass[c.id] > 0).map((c) => (
          <div
            key={c.id}
            className="h-full first:rounded-l-full last:rounded-r-full"
            style={{ width: `${(byClass[c.id] / total) * 100}%`, background: c.color }}
            title={`${c.label}: ${compact(byClass[c.id])}`}
          />
        ))}
      </div>
    </div>
  );
}

export function MemberLeaderboard({
  rows,
  filters,
  canDrill,
}: {
  rows: MemberRow[];
  filters: MiningFilters;
  canDrill: boolean;
}) {
  const max = rows[0]?.[filters.metric] ?? 0;
  const total = rows.reduce((s, r) => s + r[filters.metric], 0);
  return (
    <ol className="space-y-1">
      {rows.slice(0, 15).map((r, i) => {
        const metricValue = r[filters.metric];
        const content = (
          <>
            <span className="w-5 text-right text-xs text-ink-3 tabular-nums">{i + 1}</span>
            <Portrait id={r.portraitId} size={32} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <div className="min-w-0 truncate text-sm">
                  <span className="font-medium text-ink">{r.name}</span>
                  {r.ownerName && r.ownerName !== r.name && <span className="text-ink-3"> · {r.ownerName}</span>}
                  {filters.groupBy === "user" && r.characters > 1 && (
                    <span className="text-ink-3"> · {r.characters} chars</span>
                  )}
                  {!r.userId && <span className="text-ink-3"> · not registered</span>}
                </div>
                <div className="shrink-0 text-sm font-semibold tabular-nums">{formatMetric(filters.metric, metricValue)}</div>
              </div>
              <div className="mt-1.5 flex items-center gap-3">
                <CompositionBar values={r.byClass} max={max} />
                <span className="w-12 shrink-0 text-right text-2xs text-ink-3 tabular-nums">
                  {total ? percent(metricValue / total, 1) : "—"}
                </span>
              </div>
            </div>
          </>
        );
        // Drill-down: clicking a character filters the whole dashboard to it.
        const drillIds = filters.groupBy === "character" ? [Number(r.key)] : null;
        return (
          <li key={r.key}>
            {canDrill && drillIds ? (
              <Link
                href={`?${miningQueryString(filters, { characters: drillIds, page: 1 })}`}
                scroll={false}
                className="flex items-center gap-3 rounded-2xl px-2 py-2 transition hover:bg-white/5"
              >
                {content}
              </Link>
            ) : (
              <div className="flex items-center gap-3 rounded-2xl px-2 py-2">{content}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

export function ClassComposition({ byClass, metric }: { byClass: ClassValues; metric: Metric }) {
  const chart = toChartClasses(byClass);
  const total = Object.values(chart).reduce((a, b) => a + b, 0);
  const moonTotal = chart.moon;
  return (
    <div className="space-y-5">
      <ul className="space-y-3">
        {CHART_CLASSES.filter((c) => chart[c.id] > 0).map((c) => (
          <li key={c.id}>
            <div className="flex items-baseline justify-between text-sm">
              <span className="flex items-center gap-2">
                <span className="size-2.5 rounded-[3px]" style={{ background: c.color }} aria-hidden />
                <span className="text-ink-2">{c.label}</span>
              </span>
              <span className="tabular-nums">
                <span className="font-semibold">{formatMetric(metric, chart[c.id])}</span>
                <span className="ml-2 text-xs text-ink-3">{percent(chart[c.id] / total)}</span>
              </span>
            </div>
            <div className="mt-1.5 h-1.5 rounded-full bg-white/5">
              <div className="h-full rounded-full" style={{ width: `${(chart[c.id] / total) * 100}%`, background: c.color }} />
            </div>
          </li>
        ))}
      </ul>
      {moonTotal > 0 && (
        <div>
          <div className="eve-label mb-2 text-2xs text-ink-3">Moon ore by rarity</div>
          <div className="flex h-2.5 gap-[2px] overflow-hidden rounded-full">
            {MOON_RARITY.filter((m) => (byClass[m.id] ?? 0) > 0).map((m) => (
              <div
                key={m.id}
                className="h-full first:rounded-l-full last:rounded-r-full"
                style={{ width: `${((byClass[m.id] ?? 0) / moonTotal) * 100}%`, background: m.color }}
                title={`${m.label}: ${formatMetric(metric, byClass[m.id] ?? 0)}`}
              />
            ))}
          </div>
          <ul className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
            {MOON_RARITY.filter((m) => (byClass[m.id] ?? 0) > 0).map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-ink-2">
                  <span className="size-2 rounded-[2px]" style={{ background: m.color }} aria-hidden />
                  {m.label}
                </span>
                <span className="text-ink tabular-nums">{percent((byClass[m.id] ?? 0) / moonTotal, 0)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function OreTable({ rows, filters, metric }: { rows: TypeRow[]; filters: MiningFilters; metric: Metric }) {
  const total = rows.reduce((s, r) => s + r[metric], 0);
  return (
    <div className="max-h-[700px] overflow-y-auto">
      <table className="ks-table">
        <thead className="sticky top-0 z-10 bg-space-800/90 backdrop-blur">
          <tr>
            <th>Ore</th>
            <th className="num">Units</th>
            <th className="num">Volume</th>
            <th className="num">Unit price</th>
            <th className="num">Value</th>
            <th className="num">Share</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.typeId}>
              <td>
                <Link
                  href={`?${miningQueryString(filters, { types: [r.typeId], page: 1 })}`}
                  scroll={false}
                  className="flex items-center gap-2.5 hover:text-accent"
                >
                  <TypeIcon id={r.typeId} size={26} />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{r.name}</span>
                    <span className="flex items-center gap-1.5 text-2xs text-ink-3">
                      <span className="size-1.5 rounded-full" style={{ background: oreClassColor(r.oreClass) }} aria-hidden />
                      {ORE_CLASS_META[r.oreClass].short}
                      {r.groupName && ` · ${r.groupName}`}
                    </span>
                  </span>
                </Link>
              </td>
              <td className="num">{integer(r.quantity)}</td>
              <td className="num">{volume(r.volume)}</td>
              <td className="num text-ink-2">{r.unitPrice ? unitPrice(r.unitPrice) : "—"}</td>
              <td className="num font-semibold">{isk(r.value)}</td>
              <td className="num text-ink-3">{total ? percent(r[metric] / total) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SystemTable({ rows, filters }: { rows: SystemRow[]; filters: MiningFilters }) {
  return (
    <table className="ks-table">
      <thead>
        <tr>
          <th>System</th>
          <th className="num">Miners</th>
          <th className="num">Units</th>
          <th className="num">Volume</th>
          <th className="num">Value</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.systemId ?? "unknown"}>
            <td>
              {r.systemId ? (
                <Link
                  href={`?${miningQueryString(filters, { systems: [r.systemId], page: 1 })}`}
                  scroll={false}
                  className="flex items-center gap-2.5 hover:text-accent"
                >
                  <SecurityStatus value={r.security} />
                  <span className="font-medium">{r.name}</span>
                </Link>
              ) : (
                <span className="text-ink-3">{r.name}</span>
              )}
            </td>
            <td className="num">{r.miners}</td>
            <td className="num">{integer(r.quantity)}</td>
            <td className="num">{volume(r.volume)}</td>
            <td className="num font-semibold">{isk(r.value)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
