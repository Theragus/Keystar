import type { RangePreset } from "@/components/ui/date-range";
import { requirePermission, type CurrentUser } from "@/core/auth/dal";
import { getSettings } from "@/core/settings";
import { DATE_PRESETS, isoDate } from "../filters";
import { MINING_PERMISSIONS } from "../module";
import { miningValuation } from "../page-context";
import { parsePnlFilters, type PnlFilters } from "./filters";
import { getPnlSettings } from "./queries";
import { pnlScope, type PnlScope } from "./scope";

export interface PnlPageContext {
  user: CurrentUser;
  filters: PnlFilters;
  scope: PnlScope;
  valuationLabel: string;
  presets: RangePreset[];
  today: string;
}

/** Shared setup for the P&L pages: auth, own-character scope, filters and valuation. */
export async function pnlPageContext(searchParams: Record<string, string | string[] | undefined>): Promise<PnlPageContext> {
  const user = await requirePermission(MINING_PERMISSIONS.pnl);
  const today = isoDate(new Date());
  const [settings, pnl] = await Promise.all([getSettings(), getPnlSettings(user.id)]);
  const { valuation, valuationLabel } = miningValuation(settings);
  const filters = parsePnlFilters(searchParams, today);
  return {
    user,
    filters,
    scope: pnlScope(user, filters, valuation, pnl.ratePct),
    valuationLabel,
    presets: DATE_PRESETS.map((p) => ({ id: p.id, label: p.label, ...p.range(today) })),
    today,
  };
}
