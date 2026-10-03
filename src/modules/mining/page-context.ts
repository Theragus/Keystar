import { requirePermission, type CurrentUser } from "@/core/auth/dal";
import { getSettings } from "@/core/settings";
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

/** Shared setup for every mining page: auth, scope, filters and valuation. */
export async function miningPageContext(
  searchParams: Record<string, string | string[] | undefined>,
): Promise<MiningPageContext> {
  const user = await requirePermission(MINING_PERMISSIONS.viewOwn, MINING_PERMISSIONS.viewCorp);
  const today = isoDate(new Date());
  const settings = await getSettings();
  const valuation: Valuation = {
    source: settings["mining.valuationSource"],
    mode: settings["mining.valuationMode"],
  };
  const { t } = await getI18n();
  return {
    user,
    filters: parseMiningFilters(searchParams, today),
    scope: miningScope(user, settings["corp.homeCorporationId"]),
    valuation,
    valuationLabel: valuationLabel(t, valuation),
    presets: DATE_PRESETS.map((p) => ({ id: p.id, label: t.common.datePresets[p.id], ...p.range(today) })),
    homeCorporationId: settings["corp.homeCorporationId"],
    today,
  };
}
