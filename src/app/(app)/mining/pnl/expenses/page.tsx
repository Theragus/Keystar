import { CheckCheck, ChevronLeft, ChevronRight, Plus, RotateCcw, Trash2, Wallet, X } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { TypeIcon } from "@/components/ui/eve-image";
import { Panel } from "@/components/ui/glass";
import { PendingFrame, PendingProvider } from "@/components/ui/pending";
import { compact, integer, shortDate, unitPrice } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_META,
  EXPENSE_STATUS_META,
  type ExpenseStatus,
} from "@/modules/mining/pnl/categories";
import { AutoSubmitSelect, SubmitButton } from "@/modules/mining/pnl/components/form-controls";
import { PnlFilterBar } from "@/modules/mining/pnl/components/pnl-filter-bar";
import { PnlTabs } from "@/modules/mining/pnl/components/pnl-tabs";
import { pnlQueryString, STATUS_FILTERS } from "@/modules/mining/pnl/filters";
import { pnlPageContext } from "@/modules/mining/pnl/page-context";
import { getExpenseRows, getManualEntries, getPurchases, getWalletStatus } from "@/modules/mining/pnl/queries";
import { SPREAD_OPTIONS } from "@/modules/mining/pnl/spread";
import {
  addManualEntry,
  deleteManualEntry,
  includeAllSuggested,
  setPurchaseCategory,
  setPurchaseIncluded,
} from "../actions";

export const metadata = { title: "Mining P&L · Expenses" };

const PAGE_SIZE = 50;
const inputClass = "glass-inset h-9 w-full rounded-lg px-3 text-sm text-ink [color-scheme:dark]";

const statusTone: Record<ExpenseStatus, "good" | "accent" | "neutral"> = {
  counted: "good",
  suggested: "accent",
  excluded: "neutral",
  untagged: "neutral",
};

export default async function PnlExpensesPage({ searchParams }: PageProps<"/mining/pnl/expenses">) {
  const ctx = await pnlPageContext(await searchParams);
  const { filters, scope, user } = ctx;
  const characters = user.characters.map((c) => ({ characterId: c.characterId, name: c.name }));
  const [summary, purchases, entries, wallet] = await Promise.all([
    getExpenseRows(scope),
    getPurchases(scope, { status: filters.status, limit: PAGE_SIZE, offset: (filters.page - 1) * PAGE_SIZE }),
    getManualEntries(user.id, filters.from, filters.to),
    getWalletStatus(user.id),
  ]);

  const byStatus = (status: ExpenseStatus) =>
    summary.filter((r) => r.status === status).reduce((t, r) => ({ amount: t.amount + r.amount, count: t.count + r.count }), { amount: 0, count: 0 });
  const counts = Object.fromEntries((["counted", "suggested", "excluded", "untagged"] as const).map((s) => [s, byStatus(s)])) as Record<
    ExpenseStatus,
    { amount: number; count: number }
  >;
  const tabCount = (value: string) =>
    value === "mining" ? counts.counted.count + counts.suggested.count + counts.excluded.count : counts[value as ExpenseStatus].count;
  const pages = Math.max(1, Math.ceil(purchases.total / PAGE_SIZE));
  const walletOn = wallet.some((w) => w.granted || w.transactions > 0);
  const query = pnlQueryString(filters, { page: 1 });
  const today = ctx.today;

  return (
    <PendingProvider>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Industry"
          title="Mining P&L · Expenses"
          description="Decide which wallet purchases were mining costs, and add costs ESI can't see."
          actions={<PnlTabs current="expenses" query={pnlQueryString(filters, { status: "mining", page: 1 })} />}
        />

        <PnlFilterBar filters={filters} presets={ctx.presets} characters={characters} />

        <PendingFrame className="space-y-6">
          <Panel
            title="Wallet purchases"
            subtitle="Auto-tagged by item group: crystals, Heavy Water, burst charges, mining drones, mining hulls and fittings"
            actions={
              counts.suggested.count > 0 && (
                <form action={includeAllSuggested}>
                  <input type="hidden" name="from" value={filters.from} />
                  <input type="hidden" name="to" value={filters.to} />
                  <input type="hidden" name="chars" value={filters.characters.join(",")} />
                  <SubmitButton variant="primary" title="Count every suggested purchase in this period">
                    <CheckCheck className="size-3.5" aria-hidden /> Include all {counts.suggested.count} suggested
                  </SubmitButton>
                </form>
              )
            }
          >
            {!walletOn ? (
              <div className="flex flex-col items-start gap-3 py-2 text-sm text-ink-2">
                <p className="flex items-start gap-2">
                  <Wallet className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
                  Wallet import is off for all your characters. Turn it on per character to have mining purchases suggested
                  here; nothing counts until you include it (or switch on automatic counting for that character).
                </p>
                <ButtonLink href="/mining/pnl/settings" size="sm" variant="primary">
                  Enable wallet import
                </ButtonLink>
              </div>
            ) : (
              <>
                <nav aria-label="Purchase status" className="mb-4 flex flex-wrap gap-2">
                  {STATUS_FILTERS.map((s) => {
                    const active = filters.status === s.value;
                    const amount =
                      s.value === "mining"
                        ? counts.counted.amount + counts.suggested.amount + counts.excluded.amount
                        : counts[s.value].amount;
                    return (
                      <Link
                        key={s.value}
                        href={`?${pnlQueryString(filters, { status: s.value, page: 1 })}`}
                        aria-current={active ? "page" : undefined}
                        title={s.value === "mining" ? undefined : EXPENSE_STATUS_META[s.value].hint}
                        className={cn(
                          "inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs transition",
                          active ? "glass-chip text-ink" : "text-ink-3 hover:bg-white/5 hover:text-ink",
                        )}
                      >
                        {s.label}
                        <span className="tabular-nums text-ink-3">
                          {tabCount(s.value)} · {compact(amount)}
                        </span>
                      </Link>
                    );
                  })}
                </nav>

                {purchases.rows.length === 0 ? (
                  <p className="py-8 text-center text-sm text-ink-3">No purchases here for this period.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="ks-table">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Item</th>
                          <th className="num">Qty</th>
                          <th className="num">Total</th>
                          <th>Category</th>
                          <th>Status</th>
                          <th className="num">Count it?</th>
                        </tr>
                      </thead>
                      <tbody>
                        {purchases.rows.map((p) => (
                          <tr key={`${p.characterId}:${p.transactionId}`} className={cn(p.status === "excluded" && "opacity-60")}>
                            <td className="whitespace-nowrap text-ink-2 tabular-nums">{shortDate(p.date.slice(0, 10))}</td>
                            <td>
                              <span className="flex items-center gap-2">
                                <TypeIcon id={p.typeId} size={24} />
                                <span className="min-w-0">
                                  <span className="block max-w-[18rem] truncate text-ink">{p.typeName ?? `Type ${p.typeId}`}</span>
                                  <span className="block max-w-[18rem] truncate text-2xs text-ink-3">
                                    {[p.groupName, p.characterName].filter(Boolean).join(" · ")}
                                  </span>
                                </span>
                              </span>
                            </td>
                            <td className="num">{integer(p.quantity)}</td>
                            <td className="num">
                              <span className="block font-semibold">{compact(p.amount)}</span>
                              <span className="block text-2xs text-ink-3">@ {unitPrice(p.unitPrice).replace(" ISK", "")}</span>
                            </td>
                            <td>
                              <form action={setPurchaseCategory.bind(null, p.characterId, p.transactionId)}>
                                <AutoSubmitSelect
                                  name="category"
                                  label="Category"
                                  className="max-w-[11rem]"
                                  defaultValue={p.category === p.autoCategory ? "" : (p.category ?? "")}
                                >
                                  <option value="">
                                    {p.autoCategory ? `${EXPENSE_CATEGORY_META[p.autoCategory].label} (auto)` : "Not a mining cost"}
                                  </option>
                                  {EXPENSE_CATEGORIES.filter((c) => c !== p.autoCategory).map((c) => (
                                    <option key={c} value={c}>
                                      {EXPENSE_CATEGORY_META[c].label}
                                    </option>
                                  ))}
                                </AutoSubmitSelect>
                              </form>
                            </td>
                            <td>
                              <Badge tone={statusTone[p.status]}>{EXPENSE_STATUS_META[p.status].label}</Badge>
                            </td>
                            <td className="num">
                              <span className="inline-flex items-center gap-1">
                                {p.status !== "counted" && (
                                  <form action={setPurchaseIncluded.bind(null, p.characterId, p.transactionId, true)}>
                                    <SubmitButton title="Count this purchase as a mining cost">
                                      <Plus className="size-3.5" aria-hidden /> Include
                                    </SubmitButton>
                                  </form>
                                )}
                                {(p.status === "counted" || p.status === "suggested") && (
                                  <form action={setPurchaseIncluded.bind(null, p.characterId, p.transactionId, false)}>
                                    <SubmitButton variant="ghost" title="Exclude: not a mining cost" className="px-2">
                                      <X className="size-3.5" aria-hidden />
                                      <span className="sr-only">Exclude</span>
                                    </SubmitButton>
                                  </form>
                                )}
                                {p.overrideIncluded !== null && (
                                  <form action={setPurchaseIncluded.bind(null, p.characterId, p.transactionId, null)}>
                                    <SubmitButton variant="ghost" title="Back to automatic" className="px-2">
                                      <RotateCcw className="size-3.5" aria-hidden />
                                      <span className="sr-only">Back to automatic</span>
                                    </SubmitButton>
                                  </form>
                                )}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {pages > 1 && (
                  <div className="mt-4 flex items-center justify-between text-xs text-ink-3">
                    <span>
                      Page {filters.page} of {pages} · {purchases.total} purchases
                    </span>
                    <span className="flex gap-2">
                      {filters.page > 1 && (
                        <ButtonLink href={`?${pnlQueryString(filters, { page: filters.page - 1 })}`} size="sm">
                          <ChevronLeft className="size-3.5" aria-hidden /> Newer
                        </ButtonLink>
                      )}
                      {filters.page < pages && (
                        <ButtonLink href={`?${pnlQueryString(filters, { page: filters.page + 1 })}`} size="sm">
                          Older <ChevronRight className="size-3.5" aria-hidden />
                        </ButtonLink>
                      )}
                    </span>
                  </div>
                )}
              </>
            )}
          </Panel>

          <div className="grid gap-4 xl:grid-cols-12">
            <Panel className="xl:col-span-5" title="Add a cost" subtitle="PLEX / Omega for alts, contracts, anything ESI can't see">
              <form action={addManualEntry} className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-xs text-ink-3">
                  Date
                  <input type="date" name="date" required defaultValue={today} max="2100-01-01" className={inputClass} />
                </label>
                <label className="space-y-1 text-xs text-ink-3">
                  Amount (ISK)
                  <input name="amount" required inputMode="decimal" placeholder="e.g. 2.1b or 450,000,000" className={inputClass} />
                </label>
                <label className="space-y-1 text-xs text-ink-3">
                  Category
                  <select name="category" defaultValue="subscription" className={inputClass}>
                    {EXPENSE_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {EXPENSE_CATEGORY_META[c].label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1 text-xs text-ink-3">
                  Spread over
                  <select name="spreadDays" defaultValue="1" className={inputClass}>
                    {SPREAD_OPTIONS.map((o) => (
                      <option key={o.days} value={o.days}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1 text-xs text-ink-3">
                  Character
                  <select name="characterId" defaultValue="" className={inputClass}>
                    <option value="">Account-wide</option>
                    {characters.map((c) => (
                      <option key={c.characterId} value={c.characterId}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1 text-xs text-ink-3">
                  Note
                  <input name="description" maxLength={200} placeholder="e.g. 12 months Omega" className={inputClass} />
                </label>
                <div className="sm:col-span-2">
                  <SubmitButton variant="primary" size="md">
                    <Plus className="size-4" aria-hidden /> Add cost
                  </SubmitButton>
                </div>
              </form>
            </Panel>

            <Panel className="xl:col-span-7" title="Manual costs" subtitle="Entries overlapping the selected period">
              {entries.length === 0 ? (
                <p className="py-8 text-center text-sm text-ink-3">No manual costs in this period.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="ks-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Category</th>
                        <th>Character</th>
                        <th>Note</th>
                        <th className="num">Amount</th>
                        <th className="num" aria-label="Actions" />
                      </tr>
                    </thead>
                    <tbody>
                      {entries.map((e) => (
                        <tr key={e.id}>
                          <td className="whitespace-nowrap text-ink-2 tabular-nums">
                            {shortDate(e.date)}
                            {e.spreadDays > 1 && <span className="ml-1 text-2xs text-ink-3">+{e.spreadDays - 1}d</span>}
                          </td>
                          <td>{EXPENSE_CATEGORY_META[e.category].label}</td>
                          <td className="text-ink-2">{e.characterName ?? "Account-wide"}</td>
                          <td className="max-w-[16rem] truncate text-ink-2">{e.description || "—"}</td>
                          <td className="num font-semibold">{compact(e.amount)}</td>
                          <td className="num">
                            <form action={deleteManualEntry.bind(null, e.id)}>
                              <SubmitButton variant="ghost" title="Delete this cost">
                                <Trash2 className="size-3.5" aria-hidden />
                              </SubmitButton>
                            </form>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="mt-3 text-2xs text-ink-3">
                Spread costs count a share per day, so a year of Omega shows up evenly instead of on one day.{" "}
                <Link href={`/mining/pnl?${query}`} className="text-accent hover:underline">
                  Back to the overview
                </Link>
              </p>
            </Panel>
          </div>
        </PendingFrame>
      </div>
    </PendingProvider>
  );
}
