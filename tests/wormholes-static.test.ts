import { statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildStaticData, type AnoikInput, type SdeInput } from "@/scripts/wh-data";
import { WH } from "@/modules/wormholes/static-data";
import { classFromSecurity, createStaticIndex, sizeOf, type StaticFile } from "@/modules/wormholes/static";
import fixture from "./fixtures/wh-static.json";

const idx = createStaticIndex(fixture as unknown as StaticFile);

describe("wormhole static index", () => {
  it("looks systems up by id and by name, with or without the J", () => {
    expect(idx.system(31001677)?.name).toBe("J113551");
    expect(idx.byName("j113551")?.id).toBe(31001677);
    expect(idx.byName("113551")?.id).toBe(31001677);
    expect(idx.byName(" jita ")).toMatchObject({ id: 30000142, cls: "hs", sec: 0.9459, region: "The Forge" });
    expect(idx.byName("nowhere")).toBeNull();
  });

  it("ranks exact matches, then prefixes, then substrings", () => {
    expect(idx.search("J11355").map((s) => s.name)).toEqual(["J113551", "J113552"]);
    expect(idx.search("113551")[0].name).toBe("J113551");
    expect(idx.search("ek").map((s) => s.name)).toEqual(["Hek"]);
    expect(idx.search("")).toEqual([]);
    expect(idx.search("j", 1)).toHaveLength(1);
  });

  it("lists the wormhole types a class can spawn, statics first, never K162", () => {
    const codes = idx.typesFor("c4", ["N766", "C247"]).map((t) => t.code);
    expect(codes.slice(0, 2)).toEqual(["N766", "C247"]); // by destination class: C2, C3
    expect(codes).toContain("X877");
    expect(codes).toContain("E004"); // src null: wandering holes appear anywhere
    expect(codes).not.toContain("B274");
    expect(codes).not.toContain("K162");
    expect(idx.whType("b274")).toMatchObject({ code: "B274", dest: "hs", life: 24 });
    expect(idx.whType("nope")).toBeNull();
  });

  it("scales system effects to the class's effect strength", () => {
    expect(idx.effectFor("Red Giant", "c4")).toEqual([{ name: "Heat Damage", value: "+36%" }]);
    expect(idx.effectFor("Pulsar", "c13")).toEqual([{ name: "Shield Capacity", value: "+100%" }]);
    expect(idx.effectFor("Pulsar", "thera")).toEqual([]);
    expect(idx.effectFor(null, "c4")).toEqual([]);
  });

  it("derives ship size and k-space class", () => {
    expect([5e6, 62e6, 375e6, 1e9, 2e9].map(sizeOf)).toEqual(["S", "M", "L", "XL", "XL"]);
    expect(sizeOf(null)).toBeNull();
    expect(classFromSecurity(0.45)).toBe("hs");
    expect(classFromSecurity(0.44)).toBe("ls");
    expect(classFromSecurity(0.0001)).toBe("ls");
    expect(classFromSecurity(0)).toBe("ns");
    expect(classFromSecurity(-0.4)).toBe("ns");
  });
});

describe("bundled wormhole data", () => {
  it("covers New Eden and Anoikis", () => {
    expect(WH.counts.wspace).toBeGreaterThanOrEqual(2600);
    expect(WH.counts.kspace).toBeGreaterThanOrEqual(5000);
    expect(Object.keys(WH.types)).toHaveLength(90);
    expect(WH.byName("Jita")).toMatchObject({ cls: "hs", region: "The Forge" });
    expect(WH.byName("Thera")?.cls).toBe("thera");
    expect(WH.byName("J113551")).toMatchObject({ cls: "c4", effect: "Red Giant", statics: ["C247", "N766"] });
    expect(WH.byName("Ahtila")?.cls).toBe("pochven");
  });

  it("only references wormhole types it knows", () => {
    for (let id = 31000001; id <= 31002604; id++) {
      for (const code of WH.system(id)?.statics ?? []) expect(WH.whType(code), code).not.toBeNull();
    }
  });

  it("stays small", () => {
    const size = statSync(path.join(process.cwd(), "src/modules/wormholes/data/static.json")).size;
    expect(size).toBeLessThan(512 * 1024);
  });
});

describe("wh-data generator", () => {
  const sde: SdeInput = {
    build: 7,
    regions: [
      { _key: 10000002, name: { en: "The Forge" } },
      { _key: 10000004, name: { en: "UUA-F4" } },
      { _key: 10000070, name: { en: "Pochven" }, wormholeClassID: 25 },
      { _key: 11000021, name: { en: "D-R00021" }, wormholeClassID: 4 },
    ],
    constellations: [{ _key: 21000199, wormholeClassID: 4 }, { _key: 20000020 }],
    systems: [
      { _key: 30000142, name: { en: "Jita" }, securityStatus: 0.945913, regionID: 10000002, constellationID: 20000020 },
      { _key: 30000143, name: { en: "Low" }, securityStatus: 0.2, regionID: 10000002, constellationID: 20000020 },
      { _key: 30000144, name: { en: "Jove" }, securityStatus: -1, regionID: 10000004, constellationID: 20000020 },
      { _key: 30045328, name: { en: "Ahtila" }, securityStatus: -1, regionID: 10000070, constellationID: 20000020 },
      { _key: 31001677, name: { en: "J113551" }, securityStatus: -0.99, regionID: 11000021, constellationID: 21000199 },
      { _key: 31000005, name: { en: "Thera" }, securityStatus: -0.99, regionID: 11000021, constellationID: 21000199, wormholeClassID: 12 },
      { _key: 32000001, name: { en: "AD001" }, securityStatus: -1, regionID: 12000001, constellationID: 22000001 },
    ],
  };
  const anoik: AnoikInput = {
    version: 11,
    effects: { "Red Giant": { "Heat Damage": ["+15%", "+22%", "+29%", "+36%", "+43%", "+50%"] } },
    wormholes: {
      C247: { typeID: 30595, dest: "c3", src: ["c4"], static: true, lifetime: 16, total_mass: 2e9, max_mass_per_jump: 375e6, mass_regen: 0 },
      K162: { typeID: 30831, dest: null, src: null, static: null, lifetime: null, total_mass: null, max_mass_per_jump: null, mass_regen: null },
    },
    systems: {
      J113551: { solarSystemID: 31001677, wormholeClass: "c3", effectName: "Red Giant", statics: ["C247", "N766"] },
      Thera: { solarSystemID: 31000005, wormholeClass: "thera", effectName: null, statics: [] },
    },
  };

  it("joins both sources and filters what players can't reach", () => {
    const { data, warnings } = buildStaticData(anoik, sde, "2026-10-03T00:00:00.000Z");
    expect(data.meta).toEqual({ generatedAt: "2026-10-03T00:00:00.000Z", sdeBuild: 7, anoikVersion: 11 });
    expect(data.kspace).toEqual([
      [30000142, "Jita", 0.9459, 10000002, "hs"],
      [30000143, "Low", 0.2, 10000002, "ls"],
      [30045328, "Ahtila", -1, 10000070, "pochven"],
    ]);
    // Class inherited from the constellation; unknown statics dropped.
    expect(data.wspace).toEqual([
      [31000005, "Thera", "thera", 11000021, null, []],
      [31001677, "J113551", "c4", 11000021, "Red Giant", ["C247"]],
    ]);
    expect(data.types.K162).toMatchObject({ dest: null, src: null, static: false });
    expect(data.effects["Red Giant"]).toEqual([["Heat Damage", ["+15%", "+22%", "+29%", "+36%", "+43%", "+50%"]]]);
    expect(Object.keys(data.regions)).toEqual(["10000002", "10000070", "11000021"]);
    expect(warnings).toEqual(["J113551: class c4 in the SDE, c3 on anoik.is", "J113551: unknown static N766"]);
  });
});
