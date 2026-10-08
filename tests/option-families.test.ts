import { describe, expect, it } from "vitest";
import { familiesOf, groupEntries, partlyPicked, selectedFamilyLabel, type FamilyOption } from "@/components/ui/option-families";

const scordite = { key: "ore:Scordite", label: "Scordite" };
const opt = (value: number, label: string, family?: FamilyOption["family"], group = "Asteroid ore") => ({ value, label, group, family });

const options = [
  opt(1, "Scordite", scordite),
  opt(2, "Scordite II-Grade", scordite),
  opt(3, "Scordite III-Grade", scordite),
  opt(4, "Veldspar", { key: "ore:Veldspar", label: "Veldspar" }),
  opt(5, "Zeolites", undefined, "Moon ore"),
];
const families = familiesOf(options);
const shape = (listed: typeof options) =>
  groupEntries(listed, families).map(([g, entries]) => [g, entries.map((e) => (e.kind === "family" ? `${e.label}×${e.options.length}` : e.option.label))]);

describe("option families", () => {
  it("keeps only families with more than one member", () => {
    expect([...families.keys()]).toEqual(["ore:Scordite"]);
  });

  it("folds a fully listed family into one row", () => {
    expect(shape(options)).toEqual([
      ["Asteroid ore", ["Scordite×3", "Veldspar"]],
      ["Moon ore", ["Zeolites"]],
    ]);
  });

  it("lists a partly matched family under the options' own names", () => {
    expect(shape(options.filter((o) => o.label.includes("II-Grade")))).toEqual([
      ["Asteroid ore", ["Scordite II-Grade", "Scordite III-Grade"]],
    ]);
  });

  it("finds partly picked families", () => {
    expect([...partlyPicked(families, [2])]).toEqual(["ore:Scordite"]);
    expect(partlyPicked(families, [1, 2, 3]).size).toBe(0);
    expect(partlyPicked(families, [4]).size).toBe(0);
  });

  it("names the selection only when it is exactly one whole family", () => {
    expect(selectedFamilyLabel(families, [3, 1, 2])).toBe("Scordite");
    expect(selectedFamilyLabel(families, [1, 2])).toBeUndefined();
    expect(selectedFamilyLabel(families, [1, 2, 3, 4])).toBeUndefined();
  });
});
