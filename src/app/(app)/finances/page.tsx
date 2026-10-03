import { ArrowLeftRight, BookOpenText, Building2, Coins, Info, Landmark, ReceiptText, Scale, Wallet } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Glass, Panel } from "@/components/ui/glass";
import { PendingFrame, PendingProvider } from "@/components/ui/pending";
import { StatTile } from "@/components/ui/stat-tile";
import { getI18n } from "@/i18n/server";
import type { Formatter } from "@/lib/format";
import { SignedIsk } from "@/modules/mining/pnl/components/signed-isk";
import { ArchiveNotices } from "@/modules/wallet/corp/components/archive-notices";
import { WalletChart } from "@/modules/wallet/corp/components/wallet-chart";
import { WalletFilterBar } from "@/modules/wallet/corp/components/wallet-filter-bar";
import { corpWalletQueryString } from "@/modules/wallet/corp/filters";
import { corpWalletPageContext } from "@/modules/wallet/corp/page-context";
import { getDailyFlows } from "@/modules/wallet/corp/queries";
import { buildWalletReport } from "@/modules/wallet/corp/report";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t.wallet.corp.metaTitle.overview };
}

/** f.compact() with a typographic minus. */
function signed(f: Formatter, value: number) {
  return `${value < 0 ? "−" : ""}${f.compact(Math.abs(value))}`;
}

export default async function CorporationWalletPage({ searchParams }: PageProps<"/finances">) {
  const ctx = await corpWalletPageContext(await searchParams);
  const { t, f } = await getI18n();
  const w = t.wallet.corp;
  const m = w.overview;
  const { filters, corporationId } = ctx;
  const query = corpWalletQueryString(filters, { page: 1 });

  const header = (
    <PageHeader
      eyebrow={t.wallet.module.navSection}
      title={t.wallet.module.nav.corporationWallet}
      description={m.description}
      actions={
        corporationId && ctx.divisions.length > 0 ? (
          <ButtonLink href={`/finances/journal?${query}`} size="sm">
            <BookOpenText className="size-4" aria-hidden /> {m.journalLink}
          </ButtonLink>
        ) : undefined
      }
    />
  );

  if (!corporationId) {
    return (
      <div className="space-y-6">
        {header}
        <Glass>
          <EmptyState icon={Building2} title={w.noHomeCorp.title}>
            {w.noHomeCorp.body}
          </EmptyState>
        </Glass>
      </div>
    );
  }
  if (!ctx.divisions.length) {
    return (
      <div className="space-y-6">
        {header}
        <Glass>
          <EmptyState
            icon={Landmark}
            title={w.empty.title}
            action={
              <ButtonLink href="/characters" variant="primary">
                {w.empty.action}
              </ButtonLink>
            }
          >
            {w.empty.body((s) => (
              <strong className="text-ink">{s}</strong>
            ))}
          </EmptyState>
        </Glass>
      </div>
    );
  }

  const flows = await getDailyFlows(corporationId, filters);
  const report = buildWalletReport({ ...filters, selected: filters.divisions, flows, divisions: ctx.divisions });
  const { totals } = report;
  const names = new Map(ctx.divisionOptions.map((d) => [d.division, d.name]));
  const balanceTimes = report.divisions.map((d) => d.balanceAt).filter((d): d is Date => d !== null);
  const balanceAt = balanceTimes.length ? new Date(Math.min(...balanceTimes.map((d) => d.getTime()))) : null;

  return (
    <PendingProvider>
      <div className="space-y-6">
        {header}
        <WalletFilterBar filters={filters} presets={ctx.presets} divisions={ctx.divisionOptions} showBucket />
        <ArchiveNotices syncState={ctx.syncState} divisionOptions={ctx.divisionOptions} />

        <PendingFrame className="space-y-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 xl:grid-cols-12">
            <StatTile
              hero
              icon={Wallet}
              className="col-span-2 lg:col-span-4 xl:col-span-4"
              label={m.tiles.balance}
              value={totals.balance === null ? "—" : signed(f, totals.balance)}
              unit={totals.balance === null ? undefined : "ISK"}
              hint={balanceAt ? m.tiles.balanceHint(f.relativeTime(balanceAt)) : undefined}
            />
            <StatTile
              className="xl:col-span-2"
              icon={Coins}
              label={m.tiles.income}
              value={f.compact(totals.income)}
              unit="ISK"
            />
            <StatTile
              className="xl:col-span-2"
              icon={ReceiptText}
              label={m.tiles.expenses}
              value={f.compact(totals.expenses)}
              unit="ISK"
            />
            <StatTile
              className="xl:col-span-2"
              icon={Scale}
              label={m.tiles.net}
              value={signed(f, totals.net)}
              unit="ISK"
              hint={m.tiles.netHint(f.compact(totals.income), f.compact(totals.expenses))}
            />
            <StatTile
              className="xl:col-span-2"
              icon={ArrowLeftRight}
              label={m.tiles.transfers}
              value={f.compact(totals.transfers)}
              unit="ISK"
              hint={m.tiles.transfersHint}
            />
          </div>

          <Panel title={m.chartTitle[filters.bucket]} subtitle={m.chartSubtitle}>
            <WalletChart buckets={report.buckets} bucket={filters.bucket} />
          </Panel>

          <Panel title={m.divisions.title} subtitle={m.divisions.subtitle}>
            <div className="overflow-x-auto">
              <table className="ks-table">
                <thead>
                  <tr>
                    <th>{m.columns.division}</th>
                    <th className="num">{m.columns.balance}</th>
                    <th className="num">{m.columns.income}</th>
                    <th className="num">{m.columns.expenses}</th>
                    <th className="num">{m.columns.transfers}</th>
                    <th className="num">{m.columns.net}</th>
                  </tr>
                </thead>
                <tbody>
                  {report.divisions.map((d) => (
                    <tr key={d.division}>
                      <td className="whitespace-nowrap text-ink">{names.get(d.division)}</td>
                      <td className="num font-semibold">{d.balance === null ? "—" : f.isk(d.balance)}</td>
                      <td className="num text-ink-2">{d.income ? f.compact(d.income) : "—"}</td>
                      <td className="num text-ink-2">{d.expenses ? f.compact(d.expenses) : "—"}</td>
                      <td className="num text-ink-2">{d.transfersNet ? signed(f, d.transfersNet) : "—"}</td>
                      <td className="num">
                        <SignedIsk value={d.net} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel title={m.how.title}>
            <ul className="grid gap-3 text-xs text-ink-2 md:grid-cols-3">
              {[m.how.transfers, m.how.archive, m.how.times].map((text) => (
                <li key={text} className="flex items-start gap-1.5">
                  <Info className="mt-0.5 size-3.5 shrink-0 text-ink-3" aria-hidden />
                  <span>{text}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </PendingFrame>
      </div>
    </PendingProvider>
  );
}
