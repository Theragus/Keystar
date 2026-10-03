import type { RangePreset } from "@/components/ui/date-range";
import { requirePermission, type CurrentUser } from "@/core/auth/dal";
import { getSettings } from "@/core/settings";
import { getI18n } from "@/i18n/server";
import { DATE_PRESETS, isoDate } from "@/lib/dates";
import { WALLET_PERMISSIONS } from "../module";
import { divisionName, WALLET_DIVISIONS } from "./divisions";
import { parseCorpWalletFilters, type CorpWalletFilters } from "./filters";
import { getDivisions, getSyncState, type DivisionRow, type SyncStateRow } from "./queries";

export interface CorpWalletPageContext {
  user: CurrentUser;
  /** Null until an admin sets the home corporation. */
  corporationId: number | null;
  filters: CorpWalletFilters;
  presets: RangePreset[];
  divisions: DivisionRow[];
  syncState: SyncStateRow[];
  /** Division names in the viewer's language (custom names win), for all seven divisions. */
  divisionOptions: { division: number; name: string }[];
}

/** Shared setup for the finances pages: permission, home corporation, filters and division names. */
export async function corpWalletPageContext(
  searchParams: Record<string, string | string[] | undefined>,
): Promise<CorpWalletPageContext> {
  const user = await requirePermission(WALLET_PERMISSIONS.corpView);
  const today = isoDate(new Date());
  const [settings, { t }] = await Promise.all([getSettings(), getI18n()]);
  const corporationId = settings["corp.homeCorporationId"];
  const [divisions, syncState] = corporationId
    ? await Promise.all([getDivisions(corporationId), getSyncState(corporationId)])
    : [[], []];
  const names = new Map(divisions.map((d) => [d.division, d.name]));
  return {
    user,
    corporationId,
    filters: parseCorpWalletFilters(searchParams, today),
    presets: DATE_PRESETS.map((p) => ({ id: p.id, label: t.common.datePresets[p.id], ...p.range(today) })),
    divisions,
    syncState,
    divisionOptions: WALLET_DIVISIONS.map((division) => ({ division, name: divisionName(t, division, names.get(division)) })),
  };
}
