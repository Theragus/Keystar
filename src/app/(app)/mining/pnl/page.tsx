import { Box, Clock, Coins, Info, Pickaxe, ReceiptText, Scale, Wallet } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Glass, Panel } from "@/components/ui/glass";
import { PendingFrame, PendingProvider } from "@/components/ui/pending";
import { StatTile } from "@/components/ui/stat-tile";
import { compact, shortDate, unitPrice } from "@/lib/format";
import { CHART_CLASS_COLOR } from "@/modules/mining/class-colors";
import { EXPENSE_CATEGORY_META } from "@/modules/mining/pnl/categories";
import { PnlChart } from "@/modules/mining/pnl/components/pnl-chart";
import { PnlFilterBar } from "@/modules/mining/pnl/components/pnl-filter-bar";
import { PnlTabs } from "@/modules/mining/pnl/components/pnl-tabs";
import { SignedIsk } from "@/modules/mining/pnl/components/signed-isk";
import { pnlQueryString } from "@/modules/mining/pnl/filters";
import { pnlPageContext } from "@/modules/mining/pnl/page-context";
import {
  getActivityStats,
  getExpenseRows,
  getIncomeRows,
  getManualDaily,
  getPriceRules,
  getWalletStatus,
} from "@/modules/mining/pnl/queries";
import { buildPnlReport } from "@/modules/mining/pnl/report";

export const metadata = { title: "Mining P&L" };

/** compact() with a typographic minus. */
function signed(value: number) {
  return `${value < 0 ? "−" : ""}${compact(Math.abs(value))}`;
}

function hours(h: number) {
  return h >= 10 ? `${Math.round(h)} h` : `${h.toFixed(1)} h`;
}

export default async function MiningPnlPage({ searchParams }: PageProps<"/mining/pnl">) {
  const ctx = await pnlPageContext(await searchParams);
  const { filters, scope, user } = ctx;
  const characters = user.characters.map((c) => ({ characterId: c.characterId, name: c.name }));

  const [income, expenses, manual, activity, rules, wallet] = await Promise.all([
    getIncomeRows(scope),
    getExpenseRows(scope),
    getManualDaily(scope, user.characterIds),
    getActivityStats(scope),
    getPriceRules(user.id),
    getWalletStatus(user.id),
  ]);
  const report = buildPnlReport({ ...filters, income, expenses, manual, activity, characters });
  const { totals } = report;
  const query = pnlQueryString(filters, { bucket: "day", page: 1 });
  const walletOn = wallet.filter((w) => w.granted).length;
  const hasData = income.length > 0 || expenses.length > 0 || manual.length > 0;
  const ratePct = scope.ratePct;
  const incomeHint = [
    ratePct !== 100 ? `${ratePct}% of valuation` : null,
    rules.length ? `${rules.length} price rule${rules.length > 1 ? "s" : ""}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <PendingProvider>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Industry"
          title="Mining P&L"
          description="Income and expenses of your own characters. Only you can see this sheet."
          actions={<PnlTabs current="overview" query={pnlQueryString(filters, { bucket: "day", status: "mining", page: 1 })} />}
        />

        <PnlFilterBar filters={filters} presets={ctx.presets} characters={characters} showBucket />

        {!hasData ? (
          <Glass>
            <EmptyState
              icon={Pickaxe}
              title="Nothing to show for this period"
              action={
                <ButtonLink href="/mining/pnl/settings" variant="primary">
                  P&amp;L settings
                </ButtonLink>
              }
            >
              Income comes from your characters&apos; mining ledgers (synced every 15 minutes). Expenses come from wallet
              purchases you include and from manual entries. Wallet import is optional and off until you enable it per
              character.
            </EmptyState>
          </Glass>
        ) : (
          <PendingFrame className="space-y-6">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 xl:grid-cols-12">
              <StatTile
                hero
                icon={Scale}
                className="col-span-2 lg:col-span-4 xl:col-span-4"
                label={`Net profit · ${shortDate(filters.from)} – ${shortDate(filters.to)}`}
                value={signed(totals.net)}
                unit="ISK"
                hint={`${compact(totals.income)} income − ${compact(totals.expenses)} expenses${
                  totals.income > 0 ? ` · ${signed(Math.round((totals.net / totals.income) * 100))}% margin` : ""
                }`}
              />
              <StatTile
                className="xl:col-span-2"
                icon={Coins}
                label="Income"
                value={compact(totals.income)}
                unit="ISK"
                hint={incomeHint || ctx.valuationLabel}
              />
              <StatTile
                className="xl:col-span-2"
                icon={ReceiptText}
                label="Expenses"
                value={compact(totals.expenses)}
                unit="ISK"
                hint={
                  report.purchases.suggested.count > 0 ? (
                    <Link
                      href={`/mining/pnl/expenses?${pnlQueryString(filters, { status: "suggested", bucket: "day", page: 1 })}`}
                      className="text-accent hover:underline"
                    >
                      {report.purchases.suggested.count} suggested ({compact(report.purchases.suggested.amount)})
                    </Link>
                  ) : totals.manual > 0 ? (
                    `${compact(totals.manual)} manual`
                  ) : undefined
                }
              />
              <StatTile
                className="xl:col-span-2"
                icon={Clock}
                label="ISK per hour"
                value={report.iskPerHour.gross === null ? "—" : compact(report.iskPerHour.gross)}
                unit={report.iskPerHour.gross === null ? undefined : "ISK"}
                hint={
                  report.iskPerHour.gross === null
                    ? "No measured activity yet"
                    : `net ${signed(report.iskPerHour.net ?? 0)} · ${hours(report.activity.wallClockHours)} active`
                }
              />
              <StatTile
                className="xl:col-span-2"
                icon={Box}
                label="Cost per m³"
                value={report.costPerM3 === null ? "—" : unitPrice(report.costPerM3).replace(" ISK", "")}
                unit={report.costPerM3 === null ? undefined : "ISK"}
                hint={`${compact(totals.volume)} m³ mined`}
              />
            </div>

            <div className="grid gap-4 xl:grid-cols-12">
              <Panel
                className="xl:col-span-8"
                title={`Income and expenses by ${filters.bucket}`}
                subtitle="EVE time (UTC); weeks start on Monday"
              >
                <PnlChart buckets={report.buckets} bucket={filters.bucket} />
              </Panel>
              <Panel
                className="xl:col-span-4"
                title="Expenses"
                subtitle="Counted purchases and manual entries"
                actions={
                  <ButtonLink href={`/mining/pnl/expenses?${query}`} size="sm">
                    Review
                  </ButtonLink>
                }
              >
                {report.byCategory.length === 0 ? (
                  <p className="py-6 text-center text-sm text-ink-3">No expenses counted in this period.</p>
                ) : (
                  <ul className="space-y-2.5 text-sm">
                    {report.byCategory.map((c) => (
                      <li key={c.category} className="flex items-center justify-between gap-3">
                        <span className="text-ink-2">{EXPENSE_CATEGORY_META[c.category].label}</span>
                        <span className="font-semibold tabular-nums">{compact(c.amount)}</span>
                      </li>
                    ))}
                    <li className="flex items-center justify-between gap-3 border-t border-white/8 pt-2.5 text-xs text-ink-3">
                      <span>Wallet purchases · manual entries</span>
                      <span className="tabular-nums">
                        {compact(totals.wallet)} · {compact(totals.manual)}
                      </span>
                    </li>
                  </ul>
                )}
                {walletOn === 0 && (
                  <p className="mt-4 flex items-start gap-1.5 border-t border-white/8 pt-3 text-xs text-ink-3">
                    <Wallet className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                    <span>
                      Wallet import is off for all your characters.{" "}
                      <Link href="/mining/pnl/settings" className="text-accent hover:underline">
                        Enable it
                      </Link>{" "}
                      to pick up crystals, fuel, burst charges, drones and hulls you buy.
                    </span>
                  </p>
                )}
              </Panel>
            </div>

            <div className="grid gap-4 xl:grid-cols-12">
              <Panel className="xl:col-span-7" title="By character" subtitle="Expenses of the character that paid">
                <div className="overflow-x-auto">
                  <table className="ks-table">
                    <thead>
                      <tr>
                        <th>Character</th>
                        <th className="num">Income</th>
                        <th className="num">m³</th>
                        <th className="num">Active</th>
                        <th className="num">ISK/h</th>
                        <th className="num">Expenses</th>
                        <th className="num">Net</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.characters.map((c) => (
                        <tr key={c.characterId ?? "account"}>
                          <td className={c.characterId === null ? "text-ink-3" : "text-ink"}>{c.name}</td>
                          <td className="num">{c.income ? compact(c.income) : "—"}</td>
                          <td className="num text-ink-2">{c.volume ? compact(c.volume) : "—"}</td>
                          <td className="num text-ink-2">{c.hours ? hours(c.hours) : "—"}</td>
                          <td className="num text-ink-2">{c.iskPerHour === null ? "—" : compact(c.iskPerHour)}</td>
                          <td className="num text-ink-2">{c.expenses ? compact(c.expenses) : "—"}</td>
                          <td className="num">
                            <SignedIsk value={c.net} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
              <Panel
                className="xl:col-span-5"
                title="By activity"
                subtitle={
                  report.allocation === "hours"
                    ? "Expenses split by active hours"
                    : report.allocation === "volume"
                      ? "Expenses split by m³ mined"
                      : "Ore, moon, ice and gas"
                }
              >
                {report.activities.length === 0 ? (
                  <p className="py-6 text-center text-sm text-ink-3">No mining in this period.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="ks-table">
                      <thead>
                        <tr>
                          <th>Activity</th>
                          <th className="num">Income</th>
                          <th className="num">ISK/h</th>
                          <th className="num">Expenses</th>
                          <th className="num">Net</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.activities.map((a) => (
                          <tr key={a.activity}>
                            <td>
                              <span className="flex items-center gap-2">
                                <span className="size-2.5 rounded-[3px]" style={{ background: CHART_CLASS_COLOR[a.activity] }} aria-hidden />
                                {a.label}
                              </span>
                            </td>
                            <td className="num">{a.income ? compact(a.income) : "—"}</td>
                            <td className="num text-ink-2">{a.iskPerHour === null ? "—" : compact(a.iskPerHour)}</td>
                            <td className="num text-ink-2">{a.expenses ? compact(a.expenses) : "—"}</td>
                            <td className="num">
                              <SignedIsk value={a.net} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Panel>
            </div>

            <Panel title="How this is calculated">
              <ul className="grid gap-3 text-xs text-ink-2 md:grid-cols-2">
                <li className="flex items-start gap-1.5">
                  <Info className="mt-0.5 size-3.5 shrink-0 text-ink-3" aria-hidden />
                  <span>
                    <b className="text-ink">Income</b> is the ore your characters mined, valued like the mining dashboard (
                    {ctx.valuationLabel}){ratePct !== 100 ? `, at ${ratePct}% of that value` : ""}. Ores with a price rule use
                    your price instead.{" "}
                    {totals.baseIncome !== totals.income && `At the plain dashboard value it would be ${compact(totals.baseIncome)}.`}
                  </span>
                </li>
                <li className="flex items-start gap-1.5">
                  <Info className="mt-0.5 size-3.5 shrink-0 text-ink-3" aria-hidden />
                  <span>
                    <b className="text-ink">Expenses</b> are wallet purchases you counted (or that are counted automatically
                    for characters where you switched that on) plus manual entries; spread entries are divided evenly over
                    their days.
                  </span>
                </li>
                <li className="flex items-start gap-1.5">
                  <Info className="mt-0.5 size-3.5 shrink-0 text-ink-3" aria-hidden />
                  <span>
                    <b className="text-ink">ISK per hour</b> comes from how much your ledgers grew between 15-minute syncs
                    (precision ±15 min per session). Characters mining at the same time count once (
                    {hours(report.activity.wallClockHours)} wall-clock, {hours(report.activity.characterHours)} character
                    hours). {report.activity.trackedSince
                      ? `Tracked since ${shortDate(report.activity.trackedSince.toISOString().slice(0, 10))}; covers ${(report.activity.measuredShare * 100).toFixed(0)}% of this period's income.`
                      : "Tracking starts with the next ledger sync; earlier mining has no activity data."}
                  </span>
                </li>
                <li className="flex items-start gap-1.5">
                  <Info className="mt-0.5 size-3.5 shrink-0 text-ink-3" aria-hidden />
                  <span>
                    <b className="text-ink">Cost per m³</b> is all expenses divided by the volume mined.
                    {totals.unpricedRows > 0 && ` ${totals.unpricedRows} ledger rows have no price yet and count as 0 ISK.`}
                  </span>
                </li>
              </ul>
            </Panel>
          </PendingFrame>
        )}
      </div>
    </PendingProvider>
  );
}
