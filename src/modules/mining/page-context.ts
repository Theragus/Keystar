import { requirePermission, type CurrentUser } from "@/core/auth/dal";
import { getSettings, type Settings } from "@/core/settings";
import type { Messages } from "@/i18n/messages";
import { getI18n } from "@/i18n/server";
import type { RangePreset } from "@/components/ui/date-range";
import { DATE_PRESETS, isoDate, parseMiningFilters, type MiningFilters } from "./filters";
import { MINING_PERMISSIONS } from "./module";
import { miningScope, type MiningScope, type Valuation } from "./queries";

/** "Jita 4-4 · highest buy · current prices" in the viewer's language. */
export function valuationLabel(t: Messages, valuation: Valuation): string {
  return `${t.eve.valuationSources[valuation.source]} · ${t.mining.valuation.modes[valuation.mode]}`;
}

export interface MiningPageContext {
  user: CurrentUser;
  filters: MiningFilters;
  scope: MiningScope;
  valuation: Valuation;
  valuationLabel: string;
  presets: RangePreset[];
  homeCorporationId: number | null;
  today: string;
}

/** The corporation's mining valuation (admin settings), shared by the dashboards and the P&L. */
export function miningValuation(settings: Settings): Valuation {
  return { source: settings["mining.valuationSource"], mode: settings["mining.valuationMode"] };
}

/** Shared setup for every mining page: auth, scope, filters and valuation. */
export async function miningPageContext(
  searchParams: Record<string, string | string[] | undefined>,
): Promise<MiningPageContext> {
  const user = await requirePermission(MINING_PERMISSIONS.viewOwn, MINING_PERMISSIONS.viewCorp);
  const today = isoDate(new Date());
  const settings = await getSettings();
  const valuation = miningValuation(settings);
  const { t } = await getI18n();
  const filters = parseMiningFilters(searchParams, today);
  return {
    user,
    filters,
    scope: miningScope(user, settings["corp.homeCorporationId"], filters.view),
    valuation,
    valuationLabel: valuationLabel(t, valuation),
    presets: DATE_PRESETS.map((p) => ({ id: p.id, label: t.common.datePresets[p.id], ...p.range(today) })),
    homeCorporationId: settings["corp.homeCorporationId"],
    today,
  };
}
