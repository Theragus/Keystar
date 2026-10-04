import { describe, expect, it } from "vitest";
import { bucketEnd, bucketStart, startOfIsoWeek } from "@/lib/dates";
import {
  classifyPurchase,
  EXPENSE_CATEGORIES,
  expenseStatus,
  purchaseCategorySqlCase,
  type ExpenseCategory,
} from "@/modules/mining/pnl/categories";
import { parsePnlFilters, pnlQueryString } from "@/modules/mining/pnl/filters";
import type { ActivityStats, ExpenseRow, IncomeRow } from "@/modules/mining/pnl/queries";
import { allocateByShare, buildPnlReport } from "@/modules/mining/pnl/report";
import { pnlScope } from "@/modules/mining/pnl/scope";

describe("purchase auto-tagging", () => {
  it("tags mining consumables and hulls by group, generic-group hulls by type", () => {
    expect(classifyPurchase(18066, 482)).toBe("crystals");
    expect(classifyPurchase(11111, 663)).toBe("crystals");
    expect(classifyPurchase(16272, 423)).toBe("fuel");
    expect(classifyPurchase(16273, 423)).toBeNull(); // other ice products stay out
    expect(classifyPurchase(42830, 1771)).toBe("bursts"); // Mining Laser Optimization Charge
    expect(classifyPurchase(10246, 101)).toBe("drones");
    expect(classifyPurchase(62622, 4174)).toBe("ships"); // Medium Asteroid Ore Compressor I
    expect(classifyPurchase(22544, 543)).toBe("ships");
    expect(classifyPurchase(32880, 25)).toBe("ships"); // Venture, in the generic Frigate group
    expect(classifyPurchase(89240, 420)).toBe("ships"); // Pioneer, a Destroyer
    expect(classifyPurchase(587, 25)).toBeNull(); // Rifter
    expect(classifyPurchase(2488, 100)).toBeNull(); // combat drones
    // Mining items in groups shared with combat gear go by type.
    expect(classifyPurchase(58950, 515)).toBe("ships"); // Large Industrial Core II
    expect(classifyPurchase(28583, 515)).toBe("ships"); // Capital Industrial Core I
    expect(classifyPurchase(20280, 515)).toBeNull(); // Siege Module I
    expect(classifyPurchase(43551, 1770)).toBe("ships"); // Mining Foreman Burst II
    expect(classifyPurchase(42529, 1770)).toBeNull(); // Shield Command Burst I
    expect(classifyPurchase(32047, 778)).toBe("ships"); // Medium Drone Mining Augmentor II
    expect(classifyPurchase(44992, 1875)).toBeNull(); // PLEX: tag it yourself
    expect(classifyPurchase(34, null)).toBeNull();
  });

  it("has an SQL twin covering every rule", () => {
    const sqlCase = purchaseCategorySqlCase("w.type_id", "t.group_id");
    for (const [typeId, groupId] of [
      [18066, 482],
      [16272, 423],
      [42830, 1771],
      [10246, 101],
      [62590, 515],
      [22544, 543],
      [32880, 25],
      [89647, 420],
    ] as const) {
      const category = classifyPurchase(typeId, groupId)!;
      const byType = sqlCase.includes(`WHEN w.type_id = ${typeId} THEN '${category}'`);
      const byGroup = sqlCase.includes(`WHEN t.group_id = ${groupId} THEN '${category}'`);
      expect(byType || byGroup).toBe(true);
    }
    // Type rules come first, as in classifyPurchase.
    expect(sqlCase.indexOf("w.type_id = 16272")).toBeLessThan(sqlCase.indexOf("t.group_id"));
    expect(sqlCase.endsWith("ELSE NULL END")).toBe(true);
  });

  it("decides the status: suggested by default, counted when switched on, your choice wins", () => {
    const s = (
      autoCategory: ExpenseCategory | null,
      overrideCategory: ExpenseCategory | null,
      overrideIncluded: boolean | null,
      autoInclude: boolean,
    ) => expenseStatus({ autoCategory, overrideCategory, overrideIncluded, autoInclude });
    expect(s("crystals", null, null, false)).toEqual({ category: "crystals", included: false, status: "suggested" });
    expect(s("crystals", null, null, true)).toEqual({ category: "crystals", included: true, status: "counted" });
    expect(s("crystals", null, false, true).status).toBe("excluded");
    expect(s("crystals", null, true, false).status).toBe("counted");
    expect(s(null, null, null, true)).toEqual({ category: null, included: false, status: "untagged" });
    expect(s(null, "other", true, false)).toEqual({ category: "other", included: true, status: "counted" });
    expect(s("crystals", "ships", null, false)).toEqual({ category: "ships", included: false, status: "suggested" });
    expect(EXPENSE_CATEGORIES).toContain("subscription");
  });
});

describe("date buckets", () => {
  it("starts ISO weeks on Monday", () => {
    expect(startOfIsoWeek("2026-10-04")).toBe("2026-09-28"); // Sunday
    expect(startOfIsoWeek("2026-09-28")).toBe("2026-09-28"); // Monday
    expect(startOfIsoWeek("2026-01-01")).toBe("2025-12-29"); // across the year
  });

  it("buckets by day, week and month", () => {
    expect(bucketStart("2026-10-02", "day")).toBe("2026-10-02");
    expect(bucketStart("2026-10-02", "month")).toBe("2026-10-01");
    expect(bucketEnd("2026-09-28", "week")).toBe("2026-10-04");
    expect(bucketEnd("2026-02-01", "month")).toBe("2026-02-28");
    expect(bucketEnd("2024-02-01", "month")).toBe("2024-02-29");
    expect(bucketEnd("2026-12-01", "month")).toBe("2026-12-31");
  });
});

describe("P&L filters and scope", () => {
  it("defaults to 30 days by day and round-trips", () => {
    const f = parsePnlFilters({}, "2026-10-02");
    expect(f).toMatchObject({ from: "2026-09-03", to: "2026-10-02", bucket: "day", status: "mining", page: 1 });
    const g = parsePnlFilters({ chars: "2,3", bucket: "week", status: "suggested", page: "2" }, "2026-10-02");
    expect(parsePnlFilters(Object.fromEntries(new URLSearchParams(pnlQueryString(g))), "2026-10-02")).toEqual(g);
    expect(parsePnlFilters({ bucket: "year", status: "bogus" }, "2026-10-02")).toMatchObject({ bucket: "day", status: "mining" });
  });

  it("never reaches beyond the account's own characters", () => {
    const val = { source: "jita_buy" as const, mode: "current" as const };
    const user = { id: "u", characterIds: [2, 3] };
    expect(pnlScope(user, { from: "a", to: "b", characters: [] }, val, 100)).toMatchObject({
      characterIds: [2, 3],
      narrowed: false,
      ledgerScope: { corp: false, ownCharacterIds: [2, 3] },
    });
    expect(pnlScope(user, { from: "a", to: "b", characters: [3, 9] }, val, 100)).toMatchObject({ characterIds: [3], narrowed: true });
    expect(pnlScope(user, { from: "a", to: "b", characters: [9] }, val, 100)).toMatchObject({ characterIds: [2, 3], narrowed: false });
  });
});

describe("P&L report", () => {
  const income = (date: string, characterId: number, oreClass: IncomeRow["oreClass"], value: number, volume: number): IncomeRow => ({
    date,
    characterId,
    oreClass,
    value,
    baseValue: value,
    volume,
    quantity: volume,
    unpricedRows: 0,
  });
  const expense = (date: string, characterId: number, amount: number, status: ExpenseRow["status"] = "counted"): ExpenseRow => ({
    date,
    characterId,
    category: "crystals",
    status,
    amount,
    count: 1,
  });
  const noActivity: ActivityStats = { total: { hours: 0, value: 0 }, byCharacter: new Map(), byActivity: new Map(), trackedSince: null };
  const base = {
    from: "2026-09-27",
    to: "2026-10-06",
    bucket: "week" as const,
    manual: [],
    characters: [
      { characterId: 1, name: "Main" },
      { characterId: 2, name: "Alt" },
    ],
  };

  it("buckets income and expenses and flags partial weeks", () => {
    const r = buildPnlReport({
      ...base,
      income: [income("2026-09-27", 1, "ore", 100, 10), income("2026-10-01", 2, "moon_r4", 300, 20)],
      expenses: [expense("2026-09-29", 1, 50), expense("2026-09-29", 2, 999, "suggested")],
      activity: noActivity,
    });
    expect(r.buckets.map((b) => [b.start, b.partial])).toEqual([
      ["2026-09-21", true],
      ["2026-09-28", false],
      ["2026-10-05", true],
    ]);
    expect(r.buckets[0].income).toBe(100);
    expect(r.buckets[1]).toMatchObject({ income: 300, expenses: 50, net: 250 });
    expect(r.buckets[1].incomeByClass.moon).toBe(300);
    expect(r.totals).toMatchObject({ income: 400, expenses: 50, net: 350, volume: 30 });
    expect(r.purchases.suggested).toEqual({ amount: 999, count: 1 });
    expect(r.costPerM3).toBeCloseTo(50 / 30);
    expect(r.characters.map((c) => [c.name, c.net])).toEqual([
      ["Alt", 300],
      ["Main", 50],
    ]);
    // No activity measured: ISK/h unknown, expenses split by m³.
    expect(r.iskPerHour).toEqual({ gross: null, net: null });
    expect(r.allocation).toBe("volume");
    expect(r.activities.find((a) => a.activity === "moon")?.expenses).toBeCloseTo(50 * (20 / 30));
  });

  it("uses measured hours for ISK/h and the activity split when they cover the income", () => {
    const r = buildPnlReport({
      ...base,
      income: [income("2026-10-01", 1, "ore", 1000, 10), income("2026-10-01", 2, "ice", 1000, 30)],
      expenses: [expense("2026-10-01", 1, 400)],
      manual: [{ date: "2026-10-02", characterId: null, category: "subscription", amount: 100 }],
      activity: {
        total: { hours: 2, value: 2000 },
        byCharacter: new Map([
          [1, { hours: 1, value: 1000 }],
          [2, { hours: 2, value: 1000 }],
        ]),
        byActivity: new Map([
          ["ore", { hours: 1, value: 1000 }],
          ["ice", { hours: 3, value: 1000 }],
        ]),
        trackedSince: new Date("2026-09-01T00:00:00Z"),
      },
    });
    expect(r.allocation).toBe("hours");
    expect(r.activities.map((a) => [a.activity, a.expenses])).toEqual([
      ["ore", 125],
      ["ice", 375],
    ]);
    expect(r.iskPerHour.gross).toBe(1000);
    expect(r.iskPerHour.net).toBe((2000 - 500) / 2);
    expect(r.activity).toMatchObject({ wallClockHours: 2, characterHours: 3, measuredShare: 1 });
    expect(r.characters.at(-1)).toMatchObject({ characterId: null, expenses: 100, net: -100 });
    expect(r.characters.find((c) => c.characterId === 2)?.iskPerHour).toBe(500);
    expect(r.byCategory).toEqual([
      { category: "crystals", amount: 400 },
      { category: "subscription", amount: 100 },
    ]);
  });

  it("returns nulls rather than dividing by zero", () => {
    const r = buildPnlReport({ ...base, income: [], expenses: [], activity: noActivity });
    expect(r.costPerM3).toBeNull();
    expect(r.allocation).toBeNull();
    expect(r.activities).toEqual([]);
    expect(allocateByShare(100, new Map([["a", 0]]))).toEqual(new Map([["a", 0]]));
  });
});
