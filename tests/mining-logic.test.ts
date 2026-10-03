import { describe, expect, it } from "vitest";
import { bestJitaPrices, JITA_44_STATION_ID, resolveUnitValue } from "@/core/eve/prices";
import { classifyOre, oreClassSqlCase } from "@/core/eve/ore";
import { compact } from "@/lib/format";
import { chartClassOf, toChartClasses } from "@/modules/mining/class-colors";
import {
  DATE_PRESETS,
  daysBetween,
  isValidIsoDate,
  ledgerGrouping,
  miningQueryString,
  parseMiningFilters,
} from "@/modules/mining/filters";
import { groupLedger } from "@/modules/mining/ledger-groups";
import { miningScope, type LedgerRow } from "@/modules/mining/queries";

describe("mining filters", () => {
  const today = "2026-10-02";

  it("defaults to the last 30 days, combined source, ISK", () => {
    const f = parseMiningFilters({}, today);
    expect(f).toMatchObject({
      from: "2026-09-03",
      to: today,
      source: "all",
      metric: "value",
      groupBy: "user",
      view: "corp",
      page: 1,
    });
    expect(daysBetween(f.from, f.to)).toBe(30);
  });

  it("parses lists, swaps reversed ranges and drops junk", () => {
    const f = parseMiningFilters(
      {
        from: "2026-09-30",
        to: "2026-09-01",
        chars: "1,2,x,2",
        classes: "moon_r4,bogus",
        source: "observer",
        view: "everyone",
        page: "-3",
      },
      today,
    );
    expect(f.from).toBe("2026-09-01");
    expect(f.to).toBe("2026-09-30");
    expect(f.characters).toEqual([1, 2]);
    expect(f.classes).toEqual(["moon_r4"]);
    expect(f.source).toBe("observer");
    expect(f.view).toBe("corp");
    expect(f.page).toBe(1);
  });

  it("rejects impossible dates and fractional pages", () => {
    const f = parseMiningFilters({ from: "2026-02-30", to: "2026-99-99", page: "2.5" }, today);
    expect(f.from).toBe("2026-09-03");
    expect(f.to).toBe(today);
    expect(f.page).toBe(2);
    expect(isValidIsoDate("2024-02-29")).toBe(true);
    expect(isValidIsoDate("2026-02-29")).toBe(false);
  });

  it("round-trips through the query string", () => {
    const f = parseMiningFilters(
      { chars: "5", types: "1230", systems: "30000180", metric: "volume", by: "character", view: "own" },
      today,
    );
    const again = parseMiningFilters(Object.fromEntries(new URLSearchParams(miningQueryString(f))), today);
    expect(again).toEqual(f);
  });

  it("narrows corporation access to the viewer's characters in the own view", () => {
    const viewer = { can: (perm: string) => perm === "mining.view.corp", characterIds: [1, 4] };
    expect(miningScope(viewer, 100)).toEqual({ corp: true, ownCharacterIds: [1, 4], homeCorporationId: 100 });
    expect(miningScope(viewer, 100, "own").corp).toBe(false);
    expect(miningScope(viewer, null, "corp").corp).toBe(false);
    const member = { can: () => false, characterIds: [2] };
    expect(miningScope(member, 100, "corp").corp).toBe(false);
  });

  it("computes presets in EVE (UTC) days", () => {
    const lm = DATE_PRESETS.find((p) => p.id === "lm")!.range(today);
    expect(lm).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(DATE_PRESETS.find((p) => p.id === "ytd")!.range(today).from).toBe("2026-01-01");
  });
});

describe("ore classification", () => {
  it("classifies by group and category", () => {
    expect(classifyOre(462, 25)).toBe("ore"); // Veldspar
    expect(classifyOre(1884, 25)).toBe("moon_r4");
    expect(classifyOre(1923, 25)).toBe("moon_r64");
    expect(classifyOre(465, 25)).toBe("ice");
    expect(classifyOre(711, 2)).toBe("gas");
    expect(classifyOre(18, 4)).toBe("other");
    expect(classifyOre(null, null)).toBe("other");
  });

  it("keeps the SQL CASE in sync with the TypeScript rules", () => {
    const sql = oreClassSqlCase("g", "c");
    for (const id of [1884, 1920, 1921, 1922, 1923]) expect(sql).toContain(`WHEN g = ${id}`);
    expect(sql).toContain("IN (465,903)");
    expect(sql).toContain("c = 25");
  });

  it("folds ore classes into chart classes", () => {
    expect(chartClassOf("moon_r32")).toBe("moon");
    expect(toChartClasses({ moon_r4: 1, moon_r8: 2, ice: 3, other: 4 })).toEqual({ moon: 3, ore: 0, ice: 3, gas: 0, other: 4 });
  });
});

describe("pricing", () => {
  it("takes the best buy and sell at Jita 4-4 only", () => {
    const orders = [
      { is_buy_order: true, location_id: JITA_44_STATION_ID, price: 9 },
      { is_buy_order: true, location_id: JITA_44_STATION_ID, price: 10 },
      { is_buy_order: true, location_id: 123, price: 50 },
      { is_buy_order: false, location_id: JITA_44_STATION_ID, price: 12 },
      { is_buy_order: false, location_id: JITA_44_STATION_ID, price: 11 },
      { is_buy_order: false, location_id: 123, price: 1 },
    ];
    expect(bestJitaPrices(orders)).toEqual({ buy: 10, sell: 11 });
    expect(bestJitaPrices([])).toEqual({ buy: null, sell: null });
  });

  const raw = { typeId: 1, portionSize: 100, compressedTypeId: 2, compressedPortionSize: 100 };

  it("prefers the direct price", () => {
    const prices = new Map([[1, { jita_buy: 10, jita_sell: 12, esi_average: 11 }]]);
    expect(resolveUnitValue(raw, "jita_buy", prices)).toEqual({ unitPrice: 10, basis: "direct" });
    expect(resolveUnitValue(raw, "jita_split", prices)).toEqual({ unitPrice: 11, basis: "direct" });
  });

  it("falls back to the compressed variant using the portion ratio", () => {
    const prices = new Map([[2, { jita_buy: 900 }]]);
    expect(resolveUnitValue(raw, "jita_buy", prices)).toEqual({ unitPrice: 900, basis: "compressed" });
    const legacy = { ...raw, compressedPortionSize: 1 };
    expect(resolveUnitValue(legacy, "jita_buy", prices)).toEqual({ unitPrice: 9, basis: "compressed" });
  });

  it("falls back to ESI average, then adjusted, then nothing", () => {
    expect(resolveUnitValue(raw, "jita_buy", new Map([[1, { esi_average: 7 }]]))?.basis).toBe("esi_average");
    expect(resolveUnitValue(raw, "jita_buy", new Map([[1, { esi_adjusted: 6 }]]))?.basis).toBe("esi_adjusted");
    expect(resolveUnitValue(raw, "jita_buy", new Map())).toBeNull();
  });
});

describe("formatting", () => {
  it("compacts large numbers", () => {
    expect(compact(4_481_234_567)).toBe("4.48B");
    expect(compact(32_400_000)).toBe("32.4M");
    expect(compact(149_000_000)).toBe("149M");
    expect(compact(999)).toBe("999");
  });
});

describe("ledger groups", () => {
  const row = (date: string, characterId: number, value: number, groupKey: string | null = null): LedgerRow => ({
    date,
    source: "personal",
    characterId,
    characterName: `C${characterId}`,
    ownerName: null,
    mainCharacterId: null,
    groupKey,
    typeId: 1230,
    typeName: "Veldspar",
    oreClass: "ore",
    systemId: 30000142,
    systemName: "Jita",
    security: 0.9,
    observerName: null,
    quantity: value,
    volume: value / 10,
    unitPrice: 1,
    value,
  });
  const totals = (date: string, entries: number, value: number) => ({
    date,
    entries,
    characters: 1,
    quantity: value,
    volume: value / 10,
    value,
  });

  it("groups contiguous days in order and keeps whole-day totals for a day split across pages", () => {
    const rows = [row("2026-10-02", 1, 30), row("2026-10-02", 2, 20), row("2026-10-01", 1, 10)];
    const days = groupLedger(rows, { days: [totals("2026-10-02", 2, 50), totals("2026-10-01", 5, 90)], groups: [] }, false);
    expect(days.map((d) => [d.date, d.rows.length, d.groups])).toEqual([
      ["2026-10-02", 2, null],
      ["2026-10-01", 1, null],
    ]);
    expect(days[1].totals.entries).toBe(5);
    expect(days[1].totals.value).toBe(90);
  });

  it("splits each day into its groups with whole-group totals", () => {
    const rows = [row("2026-10-02", 1, 30, "a"), row("2026-10-02", 2, 20, "a"), row("2026-10-02", 3, 5, "b")];
    const [day] = groupLedger(
      rows,
      { days: [totals("2026-10-02", 4, 60)], groups: [{ ...totals("2026-10-02", 3, 55), key: "a" }] },
      true,
    );
    expect(day.groups?.map((g) => [g.key, g.rows.length, g.totals.entries])).toEqual([
      ["a", 2, 3],
      // No totals for "b" (e.g. synced in between): falls back to its rows on the page.
      ["b", 1, 1],
    ]);
  });

  it("falls back to the page's rows when a day's totals are missing or stale", () => {
    const [day] = groupLedger([row("2026-10-02", 1, 30), row("2026-10-02", 1, 20)], { days: [], groups: [] }, false);
    expect(day.totals).toEqual({ date: "2026-10-02", entries: 2, characters: 1, quantity: 50, volume: 5, value: 50 });
  });

  it("resolves the second level from the URL and the scope", () => {
    const parse = (q: string) => parseMiningFilters(Object.fromEntries(new URLSearchParams(q)));
    // Defaults: pilots for the corporation, systems for one's own characters.
    expect(ledgerGrouping(parse(""), true)).toBe("pilot");
    expect(ledgerGrouping(parse(""), false)).toBe("system");
    expect(ledgerGrouping(parse("by=character"), true)).toBe("character");
    // Without corporation scope every row is one pilot's, so members means characters.
    expect(ledgerGrouping(parse("group=member"), false)).toBe("character");
    expect(ledgerGrouping(parse("group=none"), true)).toBe("none");
    expect(ledgerGrouping(parse("group=bogus"), true)).toBe("pilot");
    const f = parse("group=system");
    expect(miningQueryString(f)).toContain("group=system");
    expect(miningQueryString({ ...f, ledgerGroup: null })).not.toContain("group=");
  });
});
