import type { eve as en } from "../en/eve";

export const eve: typeof en = {
  oreClasses: {
    ore: { label: "Asteroidenerz", short: "Erz" },
    moon_r4: { label: "Monderz · R4 Allgegenwärtig", short: "R4" },
    moon_r8: { label: "Monderz · R8 Häufig", short: "R8" },
    moon_r16: { label: "Monderz · R16 Ungewöhnlich", short: "R16" },
    moon_r32: { label: "Monderz · R32 Selten", short: "R32" },
    moon_r64: { label: "Monderz · R64 Außergewöhnlich", short: "R64" },
    ice: { label: "Eis", short: "Eis" },
    gas: { label: "Gas", short: "Gas" },
    other: { label: "Sonstiges", short: "Sonst." },
  },
  valuationSources: {
    jita_buy: "Jita 4-4 · höchstes Kaufgebot",
    jita_sell: "Jita 4-4 · niedrigstes Verkaufsangebot",
    jita_split: "Jita 4-4 · Kauf/Verkauf-Split",
    esi_average: "ESI-Durchschnittspreis",
  },
};
