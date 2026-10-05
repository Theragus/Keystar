import { ChevronLeft, ChevronRight, LayoutDashboard } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { CorpLogo, Portrait } from "@/components/ui/eve-image";
import { Glass } from "@/components/ui/glass";
import { PendingFrame, PendingProvider } from "@/components/ui/pending";
import { getI18n } from "@/i18n/server";
import { cn } from "@/lib/utils";
import { SignedIsk } from "@/modules/mining/pnl/components/signed-isk";
import { ArchiveNotices } from "@/modules/wallet/corp/components/archive-notices";
import { WalletFilterBar } from "@/modules/wallet/corp/components/wallet-filter-bar";
import { corpWalletQueryString } from "@/modules/wallet/corp/filters";
import { corpWalletPageContext } from "@/modules/wallet/corp/page-context";
import { getJournal } from "@/modules/wallet/corp/queries";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t.wallet.corp.metaTitle.journal };
}

const PAGE_SIZE = 50;

function Party({ id, name, category, fallback }: { id: number | null; name: string | null; category: string | null; fallback: string }) {
  if (!id) return <span className="text-ink-3">{fallback}</span>;
  return (
    <div className="flex items-center gap-2">
      {category === "character" ? (
        <Portrait id={id} size={22} />
      ) : category === "corporation" ? (
        <CorpLogo id={id} size={22} />
      ) : null}
      <span className="truncate">{name ?? id}</span>
    </div>
  );
}

export default async function WalletJournalPage({ searchParams }: PageProps<"/finances/journal">) {
  const ctx = await corpWalletPageContext(await searchParams);
  const { t, f } = await getI18n();
  const w = t.wallet.corp;
  const j = w.journal;
  const { filters, corporationId } = ctx;
  const { rows, total } = corporationId
    ? await getJournal(corporationId, filters, { limit: PAGE_SIZE, offset: (filters.page - 1) * PAGE_SIZE })
    : { rows: [], total: 0 };
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageLink = (page: number) => `?${corpWalletQueryString(filters, { page })}`;
  const names = new Map(ctx.divisionOptions.map((d) => [d.division, d.name]));

  return (
    <PendingProvider>
      <div className="space-y-6">
        <PageHeader
          eyebrow={t.wallet.module.navSection}
          title={t.wallet.module.nav.journal}
          description={j.description}
          actions={
            <ButtonLink href={`/finances?${corpWalletQueryString(filters, { page: 1, categories: [], flow: "all" })}`} size="sm">
              <LayoutDashboard className="size-4" aria-hidden /> {j.overview}
            </ButtonLink>
          }
        />
        <WalletFilterBar filters={filters} presets={ctx.presets} divisions={ctx.divisionOptions} showJournalFilters />
        <ArchiveNotices syncState={ctx.syncState} divisionOptions={ctx.divisionOptions} />

        <PendingFrame>
          <Glass className="overflow-hidden">
            <div className="flex items-center justify-between px-5 pt-4 pb-2 text-xs text-ink-3">
              <span>{j.entries(total, <span className="font-semibold text-ink">{f.integer(total)}</span>)}</span>
              <span>{j.pageOf(filters.page, pages)}</span>
            </div>
            <div className="overflow-x-auto px-2 pb-2">
              <table className="ks-table">
                <thead>
                  <tr>
                    <th>{j.columns.date}</th>
                    <th>{j.columns.division}</th>
                    <th>{j.columns.type}</th>
                    <th>{j.columns.from}</th>
                    <th>{j.columns.to}</th>
                    <th className="num">{j.columns.amount}</th>
                    <th className="num">{j.columns.balance}</th>
                    <th>{j.columns.details}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-10 text-center text-ink-3">
                        {j.empty}
                      </td>
                    </tr>
                  )}
                  {rows.map((r) => (
                    <tr key={`${r.division}-${r.id}`}>
                      <td className="whitespace-nowrap text-ink-2 tabular-nums">{f.dateTime(r.date)}</td>
                      <td className="whitespace-nowrap text-ink-2">{names.get(r.division) ?? r.division}</td>
                      <td>
                        <div className="leading-tight">
                          <div className="flex items-center gap-1.5 font-medium">
                            {w.categories[r.category]}
                            {r.transfer && <Badge tone="accent">{j.transfer}</Badge>}
                          </div>
                          <div className="font-mono text-2xs text-ink-3">{r.refType}</div>
                        </div>
                      </td>
                      <td className="max-w-48">
                        <Party id={r.firstPartyId} name={r.firstPartyName} category={r.firstPartyCategory} fallback={j.unknownParty} />
                      </td>
                      <td className="max-w-48">
                        <Party id={r.secondPartyId} name={r.secondPartyName} category={r.secondPartyCategory} fallback={j.unknownParty} />
                      </td>
                      <td className="num">{r.amount === null ? "—" : <SignedIsk value={r.amount} />}</td>
                      <td className="num text-ink-2">{r.balance === null ? "—" : f.isk(r.balance)}</td>
                      <td className="max-w-md text-xs text-ink-2">
                        <div className="line-clamp-2" title={r.description}>
                          {r.reason || r.description}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {pages > 1 && (
              <nav className="flex items-center justify-end gap-2 border-t border-surface-contrast/6 px-5 py-3" aria-label={j.pagination}>
                <Link
                  href={pageLink(Math.max(1, filters.page - 1))}
                  aria-disabled={filters.page <= 1}
                  className={cn(
                    "glass-chip inline-flex h-8 items-center gap-1 rounded-lg px-3 text-xs",
                    filters.page <= 1 && "pointer-events-none opacity-40",
                  )}
                >
                  <ChevronLeft className="size-4" aria-hidden /> {j.previous}
                </Link>
                <Link
                  href={pageLink(Math.min(pages, filters.page + 1))}
                  aria-disabled={filters.page >= pages}
                  className={cn(
                    "glass-chip inline-flex h-8 items-center gap-1 rounded-lg px-3 text-xs",
                    filters.page >= pages && "pointer-events-none opacity-40",
                  )}
                >
                  {j.next} <ChevronRight className="size-4" aria-hidden />
                </Link>
              </nav>
            )}
          </Glass>
        </PendingFrame>
      </div>
    </PendingProvider>
  );
}
