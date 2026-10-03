import { requirePermission, type CurrentUser } from "@/core/auth/dal";
import { VALUATION_SOURCES } from "@/core/eve/prices";
import { getSettings, type Settings } from "@/core/settings";
import type { RangePreset } from "@/components/ui/date-range";
import { DATE_PRESETS, isoDate, parseMiningFilters, type MiningFilters } from "./filters";
import { MINING_PERMISSIONS } from "./module";
import { miningScope, type MiningScope, type Valuation } from "./queries";

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

/** The corporation's mining valuation (admin settings) and how to describe it. */
export function miningValuation(settings: Settings): { valuation: Valuation; valuationLabel: string } {
  const valuation: Valuation = {
    source: settings["mining.valuationSource"],
    mode: settings["mining.valuationMode"],
  };
  const sourceLabel = VALUATION_SOURCES.find((s) => s.value === valuation.source)?.label ?? valuation.source;
  return {
    valuation,
    valuationLabel: `${sourceLabel} · ${valuation.mode === "historical" ? "price on the day mined" : "current prices"}`,
  };
}

/** Shared setup for every mining page: auth, scope, filters and valuation. */
export async function miningPageContext(
  searchParams: Record<string, string | string[] | undefined>,
): Promise<MiningPageContext> {
  const user = await requirePermission(MINING_PERMISSIONS.viewOwn, MINING_PERMISSIONS.viewCorp);
  const today = isoDate(new Date());
  const settings = await getSettings();
  const { valuation, valuationLabel } = miningValuation(settings);
  return {
    user,
    filters: parseMiningFilters(searchParams, today),
    scope: miningScope(user, settings["corp.homeCorporationId"]),
    valuation,
    valuationLabel,
    presets: DATE_PRESETS.map((p) => ({ id: p.id, label: p.label, ...p.range(today) })),
    homeCorporationId: settings["corp.homeCorporationId"],
    today,
  };
}
