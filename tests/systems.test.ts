import { describe, expect, it } from "vitest";
import { isListedSystem, isWormholeSystem, matchSystems, wormholeClass, type SystemOption } from "@/core/eve/systems";

const SYSTEMS: SystemOption[] = [
  [30002537, "Amamake", 0.4, "Heimatar"],
  [30000142, "Jita", 0.9, "The Forge"],
  [31000005, "Thera", -1, "G-R00031"],
  [31002238, "J121006", -1, "K-R00033"],
  [31001554, "J123456", -1, "E-R00026"],
  [30004608, "Ohmahailen", 0.2, "Metropolis"],
  [30003504, "Niarja", 0, null],
];

describe("system id ranges", () => {
  it("lists known space and wormholes, not Abyssal pockets", () => {
    expect(isListedSystem(30000142)).toBe(true);
    expect(isListedSystem(31000005)).toBe(true);
    expect(isListedSystem(32000001)).toBe(false);
    expect(isListedSystem(29999999)).toBe(false);
  });

  it("tells wormholes from known space", () => {
    expect(isWormholeSystem(31002238)).toBe(true);
    expect(isWormholeSystem(30002537)).toBe(false);
    expect(isWormholeSystem(32000001)).toBe(false);
  });
});

describe("wormholeClass", () => {
  it("reads the class from the region's first letter", () => {
    expect(wormholeClass("A-R00001")).toBe("c1");
    expect(wormholeClass("F-R00030")).toBe("c6");
    expect(wormholeClass("G-R00031")).toBe("thera");
    expect(wormholeClass("H-R00032")).toBe("c13");
    expect(wormholeClass("K-R00033")).toBe("drifter");
  });

  it("knows nothing for known-space or missing regions", () => {
    expect(wormholeClass("The Forge")).toBeNull();
    expect(wormholeClass("Z-R00099")).toBeNull();
    expect(wormholeClass(null)).toBeNull();
  });
});

describe("matchSystems", () => {
  const names = (query: string, limit?: number) => matchSystems(SYSTEMS, query, limit).map((s) => s[1]);

  it("ranks names that start with the query before names that contain it", () => {
    expect(names("a")).toEqual(["Amamake", "Jita", "Thera", "Ohmahailen", "Niarja"]);
  });

  it("ignores case and surrounding spaces", () => {
    expect(names("  JITA ")).toEqual(["Jita"]);
  });

  it("narrows wormholes as more characters are typed", () => {
    expect(names("j1")).toEqual(["J121006", "J123456"]);
    expect(names("j1234")).toEqual(["J123456"]);
  });

  it("caps the number of suggestions", () => {
    expect(names("a", 2)).toEqual(["Amamake", "Jita"]);
  });

  it("returns nothing for an unknown name", () => {
    expect(names("zzz")).toEqual([]);
  });
});
