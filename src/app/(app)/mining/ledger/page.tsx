import { ChevronLeft, ChevronRight, Download, LayoutDashboard } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Glass } from "@/components/ui/glass";
import { PendingFrame, PendingProvider } from "@/components/ui/pending";
import { getI18n } from "@/i18n/server";
import { cn } from "@/lib/utils";
import { MiningFilterBar } from "@/modules/mining/components/filter-bar";
import {
  LedgerCollapseAll,
  LedgerCollapseProvider,
  LedgerGroupControls,
  LedgerTable,
} from "@/modules/mining/components/ledger-table";
import { ledgerGrouping, miningQueryString } from "@/modules/mining/filters";
import { groupLedger } from "@/modules/mining/ledger-groups";
import { MINING_PERMISSIONS } from "@/modules/mining/module";
import { miningPageContext } from "@/modules/mining/page-context";
import {
  canViewCorpMining,
  getFilterOptions,
  getLedgerRows,
  getLedgerTotals,
} from "@/modules/mining/queries";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t.mining.ledger.metaTitle };
}

const PAGE_SIZE = 50;

export default async function LedgerPage({ searchParams }: PageProps<"/mining/ledger">) {
  const ctx = await miningPageContext(await searchParams);
  const { t, f } = await getI18n();
  const l = t.mining.ledger;
  const { filters, scope, valuation, user } = ctx;
  const offset = (filters.page - 1) * PAGE_SIZE;
  const grouping = ledgerGrouping(filters, scope.corp);
  // The day totals also give the row count, so the rows query can skip its own COUNT.
  const [{ rows }, totals, options] = await Promise.all([
    getLedgerRows(filters, scope, valuation, { limit: PAGE_SIZE, offset, count: false, grouping }),
    getLedgerTotals(filters, scope, valuation, grouping),
    getFilterOptions(scope),
  ]);
  const total = totals.days.reduce((sum, d) => sum + d.entries, 0);
  const days = groupLedger(rows, totals, grouping !== "none");
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageLink = (page: number) => `?${miningQueryString(filters, { page })}`;

  return (
    <PendingProvider>
      <div className="space-y-6">
        <PageHeader
          eyebrow={t.mining.module.navSection}
          title={t.mining.module.nav.ledger}
          description={l.description}
          actions={
            <>
              <ButtonLink href={`/mining?${miningQueryString(filters, { page: 1 })}`} size="sm">
                <LayoutDashboard className="size-4" aria-hidden /> {l.overview}
              </ButtonLink>
              {user.can(MINING_PERMISSIONS.export) && (
                <a
                  href={`/mining/export?${miningQueryString(filters, { page: 1 })}`}
                  className="glass-chip inline-flex h-8 items-center gap-2 rounded-lg px-3.5 text-xs font-medium hover:bg-white/10"
                >
                  <Download className="size-4" aria-hidden /> {t.mining.exportCsv}
                </a>
              )}
            </>
          }
        />
        <MiningFilterBar
          filters={filters}
          options={options}
          presets={ctx.presets}
          showMetric={false}
          showView={canViewCorpMining(user, ctx.homeCorporationId)}
        />

        <PendingFrame>
          <LedgerCollapseProvider>
            <Glass className="overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4 pb-2 text-xs text-ink-3">
                <span>
                  {l.entries(total, <span className="font-semibold text-ink">{f.integer(total)}</span>)} ·{" "}
                  {ctx.valuationLabel}
                </span>
                <div className="flex flex-wrap items-center gap-3">
                  <LedgerGroupControls filters={filters} grouping={grouping} corpScope={scope.corp} />
                  {days.length > 0 && <LedgerCollapseAll dates={days.map((d) => d.date)} />}
                  <span>{l.pageOf(filters.page, pages)}</span>
                </div>
              </div>
              <div className="overflow-x-auto px-2 pb-2">
                <LedgerTable days={days} grouping={grouping} />
              </div>
              {pages > 1 && (
                <nav className="flex items-center justify-end gap-2 border-t border-white/6 px-5 py-3" aria-label={l.pagination}>
                  <Link
                    href={pageLink(Math.max(1, filters.page - 1))}
                    aria-disabled={filters.page <= 1}
                    className={cn(
                      "glass-chip inline-flex h-8 items-center gap-1 rounded-lg px-3 text-xs",
                      filters.page <= 1 && "pointer-events-none opacity-40",
                    )}
                  >
                    <ChevronLeft className="size-4" aria-hidden /> {l.previous}
                  </Link>
                  <Link
                    href={pageLink(Math.min(pages, filters.page + 1))}
                    aria-disabled={filters.page >= pages}
                    className={cn(
                      "glass-chip inline-flex h-8 items-center gap-1 rounded-lg px-3 text-xs",
                      filters.page >= pages && "pointer-events-none opacity-40",
                    )}
                  >
                    {l.next} <ChevronRight className="size-4" aria-hidden />
                  </Link>
                </nav>
              )}
            </Glass>
          </LedgerCollapseProvider>
        </PendingFrame>
      </div>
    </PendingProvider>
  );
}
