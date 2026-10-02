import { requirePermission, type CurrentUser } from "@/core/auth/dal";
import { VALUATION_SOURCES } from "@/core/eve/prices";
import { getSettings } from "@/core/settings";
import type { RangePreset } from "@/components/ui/date-range";
import { DATE_PRESETS, isoDate, parseMiningFilters, type MiningFilters } from "./filters";
import { MINING_PERMISSIONS } from "./module";
import type { MiningScope, Valuation } from "./queries";

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
  const sourceLabel = VALUATION_SOURCES.find((s) => s.value === valuation.source)?.label ?? valuation.source;
  return {
    user,
    filters: parseMiningFilters(searchParams, today),
    scope: { corp: user.can(MINING_PERMISSIONS.viewCorp), ownCharacterIds: user.characterIds },
    valuation,
    valuationLabel: `${sourceLabel} · ${valuation.mode === "historical" ? "price on the day mined" : "current prices"}`,
    presets: DATE_PRESETS.map((p) => ({ id: p.id, label: p.label, ...p.range(today) })),
    homeCorporationId: settings["corp.homeCorporationId"],
    today,
  };
}
