import { ChevronLeft, ChevronRight, Download, LayoutDashboard } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Portrait, TypeIcon } from "@/components/ui/eve-image";
import { Glass } from "@/components/ui/glass";
import { PendingFrame, PendingProvider } from "@/components/ui/pending";
import { SecurityStatus } from "@/components/ui/security";
import { ORE_CLASS_META } from "@/core/eve/ore";
import { integer, isk, unitPrice, volume } from "@/lib/format";
import { cn } from "@/lib/utils";
import { oreClassColor } from "@/modules/mining/class-colors";
import { MiningFilterBar } from "@/modules/mining/components/filter-bar";
import { miningQueryString } from "@/modules/mining/filters";
import { MINING_PERMISSIONS } from "@/modules/mining/module";
import { miningPageContext } from "@/modules/mining/page-context";
import { getFilterOptions, getLedgerRows } from "@/modules/mining/queries";

export const metadata = { title: "Mining ledger" };

const PAGE_SIZE = 50;

export default async function LedgerPage({ searchParams }: PageProps<"/mining/ledger">) {
  const ctx = await miningPageContext(await searchParams);
  const { filters, scope, valuation, user } = ctx;
  const [{ rows, total }, options] = await Promise.all([
    getLedgerRows(filters, scope, valuation, { limit: PAGE_SIZE, offset: (filters.page - 1) * PAGE_SIZE }),
    getFilterOptions(scope),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageLink = (page: number) => `?${miningQueryString(filters, { page })}`;

  return (
    <PendingProvider>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Industry"
          title="Mining Ledger"
          description="Every ledger entry: ESI reports one row per character, day, ore and system (or refinery)."
          actions={
            <>
              <ButtonLink href={`/mining?${miningQueryString(filters, { page: 1 })}`} size="sm">
                <LayoutDashboard className="size-4" aria-hidden /> Overview
              </ButtonLink>
              {user.can(MINING_PERMISSIONS.export) && (
                <a
                  href={`/mining/export?${miningQueryString(filters, { page: 1 })}`}
                  className="glass-chip inline-flex h-8 items-center gap-2 rounded-lg px-3.5 text-xs font-medium hover:bg-white/10"
                >
                  <Download className="size-4" aria-hidden /> Export CSV
                </a>
              )}
            </>
          }
        />
        <MiningFilterBar filters={filters} options={options} presets={ctx.presets} showMetric={false} />

        <PendingFrame>
          <Glass className="overflow-hidden">
            <div className="flex items-center justify-between px-5 pt-4 pb-2 text-xs text-ink-3">
              <span>
                <span className="font-semibold text-ink">{integer(total)}</span> entries · {ctx.valuationLabel}
              </span>
              <span>
                Page {filters.page} of {pages}
              </span>
            </div>
            <div className="overflow-x-auto px-2 pb-2">
              <table className="ks-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Character</th>
                    <th>Ore</th>
                    <th>Location</th>
                    <th>Source</th>
                    <th className="num">Units</th>
                    <th className="num">Volume</th>
                    <th className="num">Unit price</th>
                    <th className="num">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={9} className="py-10 text-center text-ink-3">
                        No ledger entries match these filters.
                      </td>
                    </tr>
                  )}
                  {rows.map((r, i) => (
                    <tr key={`${r.date}-${r.characterId}-${r.typeId}-${r.systemId}-${r.source}-${i}`}>
                      <td className="text-ink-2 tabular-nums">{r.date}</td>
                      <td>
                        <div className="flex items-center gap-2.5">
                          <Portrait id={r.characterId} size={26} />
                          <div className="min-w-0 leading-tight">
                            <div className="truncate font-medium">{r.characterName}</div>
                            {r.ownerName && r.ownerName !== r.characterName && (
                              <div className="truncate text-[0.7rem] text-ink-3">{r.ownerName}</div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="flex items-center gap-2.5">
                          <TypeIcon id={r.typeId} size={24} />
                          <div className="leading-tight">
                            <div className="font-medium">{r.typeName}</div>
                            <div className="flex items-center gap-1 text-[0.7rem] text-ink-3">
                              <span className="size-1.5 rounded-full" style={{ background: oreClassColor(r.oreClass) }} aria-hidden />
                              {ORE_CLASS_META[r.oreClass].short}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
                          <SecurityStatus value={r.security} />
                          <div className="leading-tight">
                            <div>{r.systemName ?? "Unknown"}</div>
                            {r.observerName && <div className="text-[0.7rem] text-ink-3">{r.observerName}</div>}
                          </div>
                        </div>
                      </td>
                      <td>
                        <Badge tone={r.source === "observer" ? "accent" : "neutral"}>
                          {r.source === "observer" ? "Refinery" : "Personal"}
                        </Badge>
                      </td>
                      <td className="num">{integer(r.quantity)}</td>
                      <td className="num">{volume(r.volume, { compact: false })}</td>
                      <td className="num text-ink-2">{r.unitPrice ? unitPrice(r.unitPrice) : "—"}</td>
                      <td className="num font-semibold">{isk(r.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {pages > 1 && (
              <nav className="flex items-center justify-end gap-2 border-t border-white/6 px-5 py-3" aria-label="Pagination">
                <Link
                  href={pageLink(Math.max(1, filters.page - 1))}
                  aria-disabled={filters.page <= 1}
                  className={cn(
                    "glass-chip inline-flex h-8 items-center gap-1 rounded-lg px-3 text-xs",
                    filters.page <= 1 && "pointer-events-none opacity-40",
                  )}
                >
                  <ChevronLeft className="size-4" aria-hidden /> Previous
                </Link>
                <Link
                  href={pageLink(Math.min(pages, filters.page + 1))}
                  aria-disabled={filters.page >= pages}
                  className={cn(
                    "glass-chip inline-flex h-8 items-center gap-1 rounded-lg px-3 text-xs",
                    filters.page >= pages && "pointer-events-none opacity-40",
                  )}
                >
                  Next <ChevronRight className="size-4" aria-hidden />
                </Link>
              </nav>
            )}
          </Glass>
        </PendingFrame>
      </div>
    </PendingProvider>
  );
}
