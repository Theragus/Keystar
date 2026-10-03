import type { ValuationSource } from "@/core/db/schema/eve";
import type { OreClass } from "@/core/eve/ore";

/** EVE vocabulary shared by several modules. Item, system and pilot names stay as ESI returns them. */
export const eve = {
  oreClasses: {
    ore: { label: "Asteroid Ore", short: "Ore" },
    moon_r4: { label: "Moon Ore · R4 Ubiquitous", short: "R4" },
    moon_r8: { label: "Moon Ore · R8 Common", short: "R8" },
    moon_r16: { label: "Moon Ore · R16 Uncommon", short: "R16" },
    moon_r32: { label: "Moon Ore · R32 Rare", short: "R32" },
    moon_r64: { label: "Moon Ore · R64 Exceptional", short: "R64" },
    ice: { label: "Ice", short: "Ice" },
    gas: { label: "Gas", short: "Gas" },
    other: { label: "Other", short: "Other" },
  } satisfies Record<OreClass, { label: string; short: string }>,
  /** Price used to value ore (settings, setup, mining pages). */
  valuationSources: {
    jita_buy: "Jita 4-4 · highest buy",
    jita_sell: "Jita 4-4 · lowest sell",
    jita_split: "Jita 4-4 · buy/sell split",
    esi_average: "ESI average price",
  } satisfies Record<ValuationSource, string>,
};
