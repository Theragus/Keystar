import { AlertTriangle, Box, CalendarDays, Coins, Download, Info, Layers3, Pickaxe, TableProperties, Users } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Glass, Panel } from "@/components/ui/glass";
import { PendingFrame, PendingProvider } from "@/components/ui/pending";
import { Delta, StatTile } from "@/components/ui/stat-tile";
import type { OreClass } from "@/core/eve/ore";
import { compact, delta, relativeTime, shortDate } from "@/lib/format";
import { toChartClasses } from "@/modules/mining/class-colors";
import { ClassComposition, MemberLeaderboard, OreTable, SystemTable } from "@/modules/mining/components/breakdowns";
import { DailyChart } from "@/modules/mining/components/daily-chart";
import { MiningFilterBar } from "@/modules/mining/components/filter-bar";
import { GroupByToggle } from "@/modules/mining/components/group-toggle";
import { daysBetween, miningQueryString } from "@/modules/mining/filters";
import { MINING_PERMISSIONS } from "@/modules/mining/module";
import { miningPageContext } from "@/modules/mining/page-context";
import {
  getCoverage,
  getDailySeries,
  getFilterOptions,
  getMemberBreakdown,
  getMiningSummary,
  getSystemBreakdown,
  getTypeBreakdown,
} from "@/modules/mining/queries";

export const metadata = { title: "Mining" };

export default async function MiningPage({ searchParams }: PageProps<"/mining">) {
  const ctx = await miningPageContext(await searchParams);
  const { filters, scope, valuation, user } = ctx;

  const [summary, daily, members, types, systems, options, coverage] = await Promise.all([
    getMiningSummary(filters, scope, valuation),
    getDailySeries(filters, scope, valuation),
    getMemberBreakdown(filters, scope, valuation),
    getTypeBreakdown(filters, scope, valuation),
    getSystemBreakdown(filters, scope, valuation),
    getFilterOptions(scope),
    getCoverage(scope, ctx.homeCorporationId),
  ]);

  const { current, previous } = summary;
  const span = daysBetween(filters.from, filters.to);
  const period = `prior ${span}d`;
  const metricLabel = filters.metric === "value" ? "ISK" : filters.metric === "volume" ? "m³" : "units";
  const byClass: Partial<Record<OreClass, number>> = {};
  for (const t of types) byClass[t.oreClass] = (byClass[t.oreClass] ?? 0) + t[filters.metric];
  const hasAnyData = options.characters.length > 0;

  return (
    <PendingProvider>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Industry"
          title="Mining Overview"
          description={
            scope.corp
              ? "Ore, ice, gas and moon mining across every registered member and corporation refinery."
              : "Mining of your own characters. Ask a director for corporation-wide access."
          }
          actions={
            <>
              <ButtonLink href={`/mining/ledger?${miningQueryString(filters)}`} size="sm">
                <TableProperties className="size-4" aria-hidden /> Ledger
              </ButtonLink>
              {user.can(MINING_PERMISSIONS.export) && (
                <a
                  href={`/mining/export?${miningQueryString(filters)}`}
                  className="glass-chip inline-flex h-8 items-center gap-2 rounded-lg px-3.5 text-xs font-medium hover:bg-white/10"
                >
                  <Download className="size-4" aria-hidden /> Export CSV
                </a>
              )}
            </>
          }
        />

        <MiningFilterBar filters={filters} options={options} presets={ctx.presets} />

        {!hasAnyData ? (
          <Glass>
            <EmptyState
              icon={Pickaxe}
              title="No mining data yet"
              action={<ButtonLink href="/characters" variant="primary">Manage characters</ButtonLink>}
            >
              Link your characters with the mining ledger scope. The worker syncs personal ledgers every 15 minutes and
              refinery observers hourly; ESI keeps the last 30 days, Keystar keeps everything from then on.
            </EmptyState>
          </Glass>
        ) : (
          <PendingFrame className="space-y-6">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 xl:grid-cols-12">
              <StatTile
                hero
                icon={Coins}
                className="col-span-2 lg:col-span-4 xl:col-span-4"
                label={`Value mined · ${shortDate(filters.from)} – ${shortDate(filters.to)}`}
                value={compact(current.value)}
                unit="ISK"
                delta={<Delta value={delta(current.value, previous.value)} period={period} />}
                trend={daily.map((d) => d.value)}
              />
              <StatTile
                className="xl:col-span-2"
                icon={Box}
                label="Volume"
                value={compact(current.volume)}
                unit="m³"
                delta={<Delta value={delta(current.volume, previous.volume)} period={period} />}
              />
              <StatTile
                className="xl:col-span-2"
                icon={Layers3}
                label="Units"
                value={compact(current.quantity)}
                delta={<Delta value={delta(current.quantity, previous.quantity)} period={period} />}
              />
              <StatTile
                className="xl:col-span-2"
                icon={Users}
                label="Active pilots"
                value={String(current.miners)}
                delta={<Delta value={delta(current.miners, previous.miners)} period={period} />}
                hint={`${current.characters} characters`}
              />
              <StatTile
                className="xl:col-span-2"
                icon={CalendarDays}
                label="Value per active day"
                value={compact(current.activeDays ? current.value / current.activeDays : 0)}
                unit="ISK"
                hint={`${current.activeDays} of ${span} days active`}
              />
            </div>

            <div className="grid gap-4 xl:grid-cols-12">
              <Panel
                className="xl:col-span-8"
                title={`Daily ${metricLabel} by resource`}
                subtitle={filters.metric === "value" ? ctx.valuationLabel : "EVE time (UTC) days"}
              >
                <DailyChart
                  metric={filters.metric}
                  rows={daily.map((d) => ({ date: d.date, total: d.total, values: toChartClasses(d.byClass) }))}
                />
              </Panel>
              <Panel className="xl:col-span-4" title="Resource mix" subtitle={`Share of ${metricLabel}`}>
                <ClassComposition byClass={byClass} metric={filters.metric} />
              </Panel>
            </div>

            <div className="grid gap-4 xl:grid-cols-12">
              <Panel
                className="xl:col-span-5"
                title="Top miners"
                subtitle={filters.groupBy === "user" ? "Alts grouped under their main" : "Click a character to focus on it"}
                actions={<GroupByToggle filters={filters} />}
              >
                {members.length ? (
                  <MemberLeaderboard rows={members} filters={filters} canDrill />
                ) : (
                  <p className="py-8 text-center text-sm text-ink-3">Nobody mined in this period.</p>
                )}
              </Panel>
              <Panel className="xl:col-span-7" title="Ore breakdown" subtitle={ctx.valuationLabel}>
                {types.length ? (
                  <OreTable rows={types} filters={filters} metric={filters.metric} />
                ) : (
                  <p className="py-8 text-center text-sm text-ink-3">No ore in this period.</p>
                )}
              </Panel>
            </div>

            <div className="grid gap-4 xl:grid-cols-12">
              <Panel className="xl:col-span-7" title="Systems" subtitle="Where the mining happened">
                <SystemTable rows={systems} filters={filters} />
              </Panel>
              <Panel className="xl:col-span-5" title="Data coverage" subtitle="How complete these numbers are">
                <ul className="space-y-3 text-sm">
                  <li className="flex justify-between gap-4">
                    <span className="text-ink-2">Characters with mining ledger access</span>
                    <span className="font-semibold tabular-nums">{coverage.trackedCharacters}</span>
                  </li>
                  {coverage.missingScope > 0 && (
                    <li className="flex items-start justify-between gap-4">
                      <span className="flex items-center gap-1.5 text-ink-2">
                        <AlertTriangle className="size-3.5 text-warning" aria-hidden /> Characters missing the mining scope
                      </span>
                      <Link href="/characters" className="font-semibold text-warning tabular-nums hover:underline">
                        {coverage.missingScope}
                      </Link>
                    </li>
                  )}
                  {coverage.invalidTokens > 0 && (
                    <li className="flex items-start justify-between gap-4">
                      <span className="flex items-center gap-1.5 text-ink-2">
                        <AlertTriangle className="size-3.5 text-critical-text" aria-hidden /> Revoked or expired tokens
                      </span>
                      <span className="font-semibold text-critical-text tabular-nums">{coverage.invalidTokens}</span>
                    </li>
                  )}
                  {coverage.unregisteredMembers !== null && (
                    <li className="flex justify-between gap-4">
                      <span className="text-ink-2">Corp members not registered</span>
                      <Link href="/admin/members" className="font-semibold tabular-nums hover:text-accent">
                        {coverage.unregisteredMembers}
                      </Link>
                    </li>
                  )}
                  <li className="flex justify-between gap-4">
                    <span className="text-ink-2">Last personal ledger sync</span>
                    <span className="tabular-nums">{relativeTime(coverage.lastLedgerSync)}</span>
                  </li>
                  {scope.corp && (
                    <li className="flex justify-between gap-4">
                      <span className="text-ink-2">Last refinery observer sync</span>
                      <span className="tabular-nums">
                        {coverage.lastObserverSync ? relativeTime(coverage.lastObserverSync) : "not configured"}
                      </span>
                    </li>
                  )}
                  {current.unpricedRows > 0 && (
                    <li className="flex items-start gap-1.5 text-xs text-warning">
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                      {current.unpricedRows} ledger rows have no price yet and count as 0 ISK.
                    </li>
                  )}
                  <li className="flex items-start gap-1.5 border-t border-white/8 pt-3 text-xs text-ink-3">
                    <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                    ESI ledgers are daily totals per ore and system. &ldquo;Combined&rdquo; counts refinery entries only when
                    they are not already in a member&apos;s personal ledger. ISK values use {ctx.valuationLabel}.
                  </li>
                </ul>
              </Panel>
            </div>
          </PendingFrame>
        )}
      </div>
    </PendingProvider>
  );
}
