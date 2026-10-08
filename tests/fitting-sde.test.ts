import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  allSkills,
  chargeFits,
  compatibleCharges,
  fitsHull,
  kindOf,
  marketGroupPath,
  marketGroupTypes,
  MARKET_ROOTS,
  requiredSkills,
  searchTypes,
  skillsAllow,
  takesCharges,
} from "@/modules/fitting/sde/catalog";
import { readSde, type Sde } from "@/modules/fitting/sde/reader";

const require = createRequire(import.meta.url);
/** The real data file the engine ships with: the reader must keep up with it. */
export const SDE_PATH = path.join(path.dirname(require.resolve("@eveshipfit/sde/package.json")), "dist", "sde.dat");

const RIFTER = 587;
const AUTOCANNON_200MM_II = 2889;
const FUSION_S = 183;
const DAMAGE_CONTROL_II = 2048;
const SMALL_TRIMARK_I = 30987;
const MEDIUM_TRIMARK_I = 31055;
const COVERT_OPS_CLOAK_II = 11578;
const HOBGOBLIN_II = 2456;
const GUNNERY = 3300;

let sde: Sde;
beforeAll(() => {
  sde = readSde(new Uint8Array(readFileSync(SDE_PATH)));
});

/** The ids above, checked against the file so a wrong constant fails loudly instead of testing the wrong type. */
const NAMES: Record<number, string> = {
  [RIFTER]: "Rifter",
  [AUTOCANNON_200MM_II]: "200mm AutoCannon II",
  [FUSION_S]: "Fusion S",
  [DAMAGE_CONTROL_II]: "Damage Control II",
  [SMALL_TRIMARK_I]: "Small Trimark Armor Pump I",
  [MEDIUM_TRIMARK_I]: "Medium Trimark Armor Pump I",
  [COVERT_OPS_CLOAK_II]: "Covert Ops Cloaking Device II",
  [HOBGOBLIN_II]: "Hobgoblin II",
  [GUNNERY]: "Gunnery",
};

describe("SDE reader", () => {
  it("uses the type ids the other tests assume", () => {
    for (const [id, name] of Object.entries(NAMES)) expect(sde.types.get(Number(id))?.name, name).toBe(name);
  });

  it("refuses other files", () => {
    expect(() => readSde(new Uint8Array(64))).toThrow(/SDE/);
  });

  it("reads the header and the tables", () => {
    expect(sde.buildNumber).toBeGreaterThan(3_000_000);
    expect(sde.majorVersion).toBeGreaterThanOrEqual(12);
    expect(sde.releaseDate).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(sde.types.size).toBeGreaterThan(40_000);
    expect(sde.categories.get(6)?.name).toBe("Ship");
    expect(sde.metaGroups.get(2)).toBe("Tech II");
    expect(sde.units.get(107)?.displayName).toBe("MW");
  });

  it("reads a hull with its base attributes and effects", () => {
    const rifter = sde.types.get(RIFTER)!;
    expect(rifter).toMatchObject({ name: "Rifter", groupId: 25, categoryId: 6, published: true, metaGroupId: 1 });
    expect(rifter.mass).toBe(1_067_000);
    const attrs = sde.typeAttributes(RIFTER);
    const by = (name: string) => attrs.get(sde.attributeIdByName.get(name)!);
    expect([by("hiSlots"), by("medSlots"), by("lowSlots"), by("rigSlots")]).toEqual([3, 3, 4, 3]);
    expect(by("powerOutput")).toBe(41);
    // The patched SDE hangs its derived attributes (negative ids) on every hull.
    expect(sde.typeEffects(RIFTER).some((e) => e.effectId < 0)).toBe(true);
    expect(sde.attributes.get(sde.attributeIdByName.get("ehp")!)?.id).toBeLessThan(0);
  });

  it("reads unknown types as empty", () => {
    expect(sde.typeAttributes(-12345).size).toBe(0);
    expect(sde.typeEffects(-12345)).toEqual([]);
  });

  it("links market groups into a tree", () => {
    const equipment = sde.marketGroups.get(MARKET_ROOTS.equipment)!;
    expect(equipment.parentId).toBe(0);
    expect(equipment.childIds.length).toBeGreaterThan(5);
    expect(marketGroupPath(sde, sde.types.get(AUTOCANNON_200MM_II)!.marketGroupId)).toEqual([
      "Ship Equipment",
      "Turrets & Launchers",
      "Projectile Turrets",
      "Autocannons",
      "Small",
    ]);
    const hulls = marketGroupTypes(sde, MARKET_ROOTS.ships);
    expect(hulls.some((t) => t.id === RIFTER)).toBe(true);
    expect(hulls.every((t) => t.published)).toBe(true);
  });
});

describe("fitting catalog", () => {
  it("classifies types by slot", () => {
    expect(kindOf(sde, RIFTER)).toBe("ship");
    expect(kindOf(sde, AUTOCANNON_200MM_II)).toBe("high");
    expect(kindOf(sde, 448)).toBe("medium"); // Warp Scrambler II
    expect(kindOf(sde, DAMAGE_CONTROL_II)).toBe("low");
    expect(kindOf(sde, SMALL_TRIMARK_I)).toBe("rig");
    expect(kindOf(sde, 45591)).toBe("subsystem"); // Legion Core - Augmented Antimatter Reactor
    expect(kindOf(sde, FUSION_S)).toBe("charge");
    expect(kindOf(sde, HOBGOBLIN_II)).toBe("drone");
    expect(kindOf(sde, GUNNERY)).toBe("skill");
    expect(kindOf(sde, 34)).toBe("other"); // Tritanium
  });

  it("matches charges to modules by group, size and capacity", () => {
    expect(takesCharges(sde, AUTOCANNON_200MM_II)).toBe(true);
    expect(takesCharges(sde, DAMAGE_CONTROL_II)).toBe(false);
    expect(chargeFits(sde, AUTOCANNON_200MM_II, FUSION_S)).toBe(true);
    const fusionM = [...sde.types.values()].find((t) => t.name === "Fusion M")!.id;
    expect(chargeFits(sde, AUTOCANNON_200MM_II, fusionM)).toBe(false);
    const charges = compatibleCharges(sde, AUTOCANNON_200MM_II);
    expect(charges.map((c) => c.name)).toContain("Republic Fleet EMP S");
    expect(charges.some((c) => c.name.endsWith(" M"))).toBe(false);
    expect(compatibleCharges(sde, DAMAGE_CONTROL_II)).toEqual([]);
  });

  it("knows which hulls accept a module", () => {
    expect(fitsHull(sde, DAMAGE_CONTROL_II, RIFTER)).toBe(true);
    expect(fitsHull(sde, SMALL_TRIMARK_I, RIFTER)).toBe(true);
    expect(fitsHull(sde, MEDIUM_TRIMARK_I, RIFTER)).toBe(false);
    expect(fitsHull(sde, COVERT_OPS_CLOAK_II, RIFTER)).toBe(false);
    expect(fitsHull(sde, COVERT_OPS_CLOAK_II, 11387)).toBe(false); // Hyena
    expect(fitsHull(sde, COVERT_OPS_CLOAK_II, 11182)).toBe(true); // Cheetah
  });

  it("reads skill requirements", () => {
    const req = requiredSkills(sde, AUTOCANNON_200MM_II);
    expect(req.get(3302)).toBe(5); // Small Projectile Turret V
    expect(skillsAllow(sde, AUTOCANNON_200MM_II, {})).toBe(false);
    expect(skillsAllow(sde, AUTOCANNON_200MM_II, allSkills(sde))).toBe(true);
    expect(Object.keys(allSkills(sde)).length).toBeGreaterThan(400);
    expect(allSkills(sde)[GUNNERY]).toBe(5);
  });

  it("searches published names, prefix matches first", () => {
    const hits = searchTypes(sde, "200mm auto", (t) => kindOf(sde, t.id) === "high");
    expect(hits[0].name.startsWith("200mm AutoCannon")).toBe(true);
    expect(hits.some((t) => t.name === "200mm AutoCannon II")).toBe(true);
    expect(searchTypes(sde, "  ")).toEqual([]);
    expect(searchTypes(sde, "rifter", undefined, 3).length).toBeLessThanOrEqual(3);
  });
});
