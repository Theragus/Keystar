import { describe, expect, it } from "vitest";
import { groupOreTypes } from "@/modules/mining/ore-groups";
import type { TypeRow } from "@/modules/mining/queries";

const row = (typeId: number, name: string, quantity: number, value: number, extra: Partial<TypeRow> = {}): TypeRow => ({
  typeId,
  name,
  groupName: "Scordite",
  oreClass: "ore",
  quantity,
  volume: quantity * 0.15,
  value,
  unitPrice: quantity ? value / quantity : 0,
  ...extra,
});

describe("groupOreTypes", () => {
  it("combines grades into one row per ore family", () => {
    const grouped = groupOreTypes([
      row(46687, "Scordite II-Grade", 100, 2000),
      row(1228, "Scordite", 300, 3000),
      row(46703, "Scordite III-Grade", 100, 3000),
      row(1230, "Veldspar", 50, 500, { groupName: "Veldspar" }),
    ]);
    expect(grouped).toHaveLength(2);
    const scordite = grouped.find((r) => r.name === "Scordite")!;
    expect(scordite).toMatchObject({ typeId: 1228, quantity: 500, value: 8000, unitPrice: 16 });
    expect(scordite.typeIds.sort()).toEqual([1228, 46687, 46703]);
    expect(scordite.volume).toBeCloseTo(75);
  });

  it("keeps a lone type's own name and price", () => {
    const [only] = groupOreTypes([row(17470, "Thick Blue Ice", 10, 1000, { oreClass: "ice", groupName: "Ice" })]);
    expect(only).toMatchObject({ name: "Thick Blue Ice", typeIds: [17470], unitPrice: 100 });
  });

  it("groups ice and moon ore variants, but not across classes", () => {
    const grouped = groupOreTypes([
      row(16264, "Blue Ice", 10, 100, { oreClass: "ice" }),
      row(17975, "Thick Blue Ice IV-Grade", 10, 300, { oreClass: "ice" }),
      row(45490, "Zeolites", 10, 100, { oreClass: "moon_r4" }),
      row(46280, "Glistening Zeolites", 10, 200, { oreClass: "moon_r4" }),
    ]);
    expect(grouped.map((r) => [r.name, r.typeIds.length])).toEqual([
      ["Blue Ice", 2],
      ["Zeolites", 2],
    ]);
  });

  it("shows no unit price for a family without prices", () => {
    const [g] = groupOreTypes([row(1, "Mercoxit", 5, 0), row(2, "Mercoxit II-Grade", 5, 0)]);
    expect(g.unitPrice).toBe(0);
  });
});
