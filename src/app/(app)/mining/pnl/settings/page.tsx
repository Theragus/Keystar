import { Activity, KeyRound, Plus, Trash2, Wallet } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { StatusBadge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Portrait, TypeIcon } from "@/components/ui/eve-image";
import { Glass, Panel } from "@/components/ui/glass";
import { env } from "@/core/env";
import { reauthorizeHref } from "@/core/modules/registry";
import { compact, relativeTime, shortDate, unitPrice } from "@/lib/format";
import { SubmitButton, SwitchButton } from "@/modules/mining/pnl/components/form-controls";
import { PnlTabs } from "@/modules/mining/pnl/components/pnl-tabs";
import { pnlQueryString } from "@/modules/mining/pnl/filters";
import { pnlPageContext } from "@/modules/mining/pnl/page-context";
import { getMinedTypes, getPriceRules, getSaleHints, getWalletStatus, HINT_DAYS, hintRange } from "@/modules/mining/pnl/queries";
import { WALLET_SCOPE } from "@/modules/wallet/module";
import {
  addPriceRule,
  applyPriceHint,
  deletePriceRule,
  deleteWalletData,
  setAutoInclude,
  setIncomeRate,
} from "../actions";

export const metadata = { title: "Mining P&L · Settings" };

const inputClass = "glass-inset h-9 w-full rounded-lg px-3 text-sm text-ink [color-scheme:dark]";
const RETURN_TO = "/mining/pnl/settings";
const MINING_SCOPE = "esi-industry.read_character_mining.v1";

function isoDay(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default async function PnlSettingsPage({ searchParams }: PageProps<"/mining/pnl/settings">) {
  const ctx = await pnlPageContext(await searchParams);
  const { filters, scope, user } = ctx;
  const demo = env().KEYSTAR_DEMO_MODE;
  const hints = hintRange(ctx.today);
  const allOwn = { ...scope, characterIds: user.characterIds };
  const [wallet, rules, saleHints, mined] = await Promise.all([
    getWalletStatus(user.id),
    getPriceRules(user.id),
    getSaleHints(allOwn, hints),
    getMinedTypes(user.characterIds, hints.from),
  ]);
  const ruleTypes = new Map([...mined.map((t) => [t.id, t.name] as const), ...rules.map((r) => [r.typeId, r.typeName ?? `Type ${r.typeId}`] as const)]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Industry"
        title="Mining P&L · Settings"
        description="Wallet import per character, how ore income is valued, and what you really sell for."
        actions={<PnlTabs current="settings" query={pnlQueryString(filters, { status: "mining", page: 1 })} />}
      />

      <Panel
        title="Wallet import"
        subtitle="Optional and per character. Keystar then reads that character's market purchases and sales; only you see them."
      >
        <div className="space-y-3">
          {wallet.map((w) => {
            const enable = reauthorizeHref(w.grantedScopes, { add: [WALLET_SCOPE], returnTo: RETURN_TO });
            const stop = reauthorizeHref(w.grantedScopes, { remove: [WALLET_SCOPE], returnTo: RETURN_TO });
            const tracksMining = w.grantedScopes.includes(MINING_SCOPE);
            return (
              <Glass key={w.characterId} className="flex flex-wrap items-center gap-4 rounded-2xl px-4 py-3">
                <Portrait id={w.characterId} size={44} />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-ink">{w.name}</span>
                    {w.tokenStatus === "invalid" ? (
                      <StatusBadge status="error" label="Token revoked" />
                    ) : w.granted ? (
                      <StatusBadge status={w.lastStatus === "error" ? "warning" : "ok"} label="Wallet import on" />
                    ) : (
                      <StatusBadge status="pending" label="Wallet import off" />
                    )}
                  </div>
                  <p className="text-xs text-ink-3">
                    {w.granted
                      ? w.transactions > 0
                        ? `${w.transactions} transactions since ${shortDate(isoDay(w.firstTransactionAt!))} · synced ${relativeTime(w.lastSuccessAt)}`
                        : w.lastSuccessAt
                          ? `No market transactions in the last 30 days · synced ${relativeTime(w.lastSuccessAt)}`
                          : "First import within a few minutes"
                      : w.transactions > 0
                        ? `${w.transactions} imported transactions kept`
                        : "Nothing imported"}
                    {w.granted && w.lastStatus === "error" && w.lastError ? ` · ${w.lastError}` : ""}
                  </p>
                  <p className="flex items-center gap-1 text-xs text-ink-3">
                    <Activity className="size-3.5" aria-hidden />
                    {w.activitySince
                      ? `Mining activity measured since ${shortDate(isoDay(w.activitySince))}`
                      : tracksMining
                        ? "Mining activity is measured from the next ledger sync"
                        : "No mining ledger access: activity can't be measured"}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  {w.granted && (
                    <form action={setAutoInclude.bind(null, w.characterId, !w.autoInclude)}>
                      <SwitchButton on={w.autoInclude} label="Count tagged purchases automatically" />
                    </form>
                  )}
                  {demo ? (
                    <Button size="sm" disabled title="Not available in demo mode">
                      <KeyRound className="size-3.5" aria-hidden /> {w.granted ? "Stop wallet import" : "Enable wallet import"}
                    </Button>
                  ) : w.granted ? (
                    <ButtonLink href={stop} size="sm" variant="ghost">
                      Stop wallet import
                    </ButtonLink>
                  ) : (
                    <ButtonLink href={enable} size="sm" variant="primary">
                      <Wallet className="size-3.5" aria-hidden /> Enable wallet import
                    </ButtonLink>
                  )}
                  {!w.granted && w.transactions > 0 && (
                    <form action={deleteWalletData.bind(null, w.characterId)}>
                      <SubmitButton variant="danger" title="Delete this character's imported wallet transactions">
                        <Trash2 className="size-3.5" aria-hidden /> Delete history
                      </SubmitButton>
                    </form>
                  )}
                </div>
              </Glass>
            );
          })}
        </div>
        <ul className="mt-4 list-disc space-y-1 pl-4 text-xs text-ink-3">
          <li>
            Enabling sends you to the EVE login with your current scopes plus wallet read access. <b>Pick the same
            character there</b>; EVE replaces a character&apos;s scopes on every login.
          </li>
          <li>
            &ldquo;Count tagged purchases automatically&rdquo; is off by default: purchases tagged as mining costs are only
            suggested until you include them. Switch it on for characters that buy for mining only; you can still exclude
            single purchases.
          </li>
          <li>Stopping removes the scope on the EVE login again. Imported history is kept until you delete it.</li>
        </ul>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-12">
        <Panel className="xl:col-span-4" title="Income valuation" subtitle={`Base: ${ctx.valuationLabel}`}>
          <form action={setIncomeRate} className="space-y-3">
            <label className="block space-y-1 text-xs text-ink-3">
              Share of the valuation you actually get
              <span className="flex items-center gap-2">
                <input name="rate" defaultValue={String(scope.ratePct)} inputMode="decimal" required className={inputClass} />
                <span className="text-sm text-ink-2">%</span>
              </span>
            </label>
            <p className="text-xs text-ink-3">
              E.g. 90 if you sell to a buyback at 90% of Jita buy. Ores with a price rule use that price instead.
            </p>
            <SubmitButton variant="primary">Save</SubmitButton>
          </form>
        </Panel>

        <Panel className="xl:col-span-8" title="Ore prices" subtitle="What you get per unit of a specific ore (overrides the %)">
          {rules.length > 0 && (
            <div className="mb-4 overflow-x-auto">
              <table className="ks-table">
                <thead>
                  <tr>
                    <th>Ore</th>
                    <th className="num">ISK / unit</th>
                    <th>From</th>
                    <th>To</th>
                    <th className="num" aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {rules.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <span className="flex items-center gap-2">
                          <TypeIcon id={r.typeId} size={22} />
                          {r.typeName ?? `Type ${r.typeId}`}
                        </span>
                      </td>
                      <td className="num font-semibold">{unitPrice(r.unitPrice).replace(" ISK", "")}</td>
                      <td className="text-ink-2">{r.validFrom ? shortDate(r.validFrom) : "always"}</td>
                      <td className="text-ink-2">{r.validTo ? shortDate(r.validTo) : "—"}</td>
                      <td className="num">
                        <form action={deletePriceRule.bind(null, r.id)}>
                          <SubmitButton variant="ghost" title="Delete this rule">
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
          {ruleTypes.size === 0 ? (
            <p className="text-sm text-ink-3">Ore you mined in the last {HINT_DAYS} days can be priced here.</p>
          ) : (
            <form action={addPriceRule} className="grid items-end gap-3 sm:grid-cols-5">
              <label className="space-y-1 text-xs text-ink-3 sm:col-span-2">
                Ore
                <select name="typeId" required className={inputClass}>
                  {[...ruleTypes].sort((a, b) => a[1].localeCompare(b[1])).map(([id, name]) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-xs text-ink-3">
                ISK / unit
                <input name="unitPrice" required inputMode="decimal" placeholder="e.g. 18.5" className={inputClass} />
              </label>
              <label className="space-y-1 text-xs text-ink-3">
                From (optional)
                <input type="date" name="validFrom" className={inputClass} />
              </label>
              <label className="space-y-1 text-xs text-ink-3">
                To (optional)
                <input type="date" name="validTo" className={inputClass} />
              </label>
              <div className="sm:col-span-5">
                <SubmitButton variant="primary">
                  <Plus className="size-3.5" aria-hidden /> Add price
                </SubmitButton>
              </div>
            </form>
          )}

          <div className="mt-5 border-t border-white/8 pt-4">
            <div className="eve-label mb-2 text-2xs text-ink-3">From your wallet sells · last {HINT_DAYS} days</div>
            {saleHints.length === 0 ? (
              <p className="text-xs text-ink-3">
                No market sales of the ore you mined (raw or compressed) in imported wallets. Sales via contracts or a
                buyback don&apos;t show up here; use the % above for those.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="ks-table">
                  <thead>
                    <tr>
                      <th>Ore</th>
                      <th className="num">Sold (raw units)</th>
                      <th className="num">You got / unit</th>
                      <th className="num">Valuation / unit</th>
                      <th className="num" aria-label="Actions" />
                    </tr>
                  </thead>
                  <tbody>
                    {saleHints.map((h) => (
                      <tr key={h.typeId}>
                        <td>
                          <span className="flex items-center gap-2">
                            <TypeIcon id={h.typeId} size={22} />
                            {h.typeName}
                          </span>
                        </td>
                        <td className="num text-ink-2">
                          {compact(h.rawUnits)} <span className="text-ink-3">({h.sales === 1 ? "1 sale" : `${h.sales} sales`})</span>
                        </td>
                        <td className="num font-semibold">{unitPrice(h.rawUnitPrice).replace(" ISK", "")}</td>
                        <td className="num text-ink-2">
                          {h.baseUnitPrice ? (
                            <>
                              {unitPrice(h.baseUnitPrice).replace(" ISK", "")}{" "}
                              <span className="text-ink-3">({((h.rawUnitPrice / h.baseUnitPrice) * 100).toFixed(0)}%)</span>
                            </>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="num">
                          <form action={applyPriceHint.bind(null, h.typeId, Math.round(h.rawUnitPrice * 100) / 100)}>
                            <SubmitButton title="Use this as the ore's price (no date limits)">Use</SubmitButton>
                          </form>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}
