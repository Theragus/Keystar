import { beforeAll, describe, expect, it } from "vitest";
import type { FittingRuntime } from "@/modules/fitting/engine/engine";
import { fitStats, STAT_ATTRIBUTES } from "@/modules/fitting/engine/stats";
import { allSkills } from "@/modules/fitting/sde/catalog";
import { loadTestRuntime, RIFTER_EFT } from "./fitting-fixture";

let rt: FittingRuntime;
beforeAll(async () => {
  rt = await loadTestRuntime();
});

describe("fitting engine", () => {
  it("loads the SDE the engine was built for", () => {
    expect(rt.sde.majorVersion).toBe(rt.manifest.sdeMajor);
    expect(rt.sde.buildNumber).toBe(rt.manifest.sdeBuild);
  });

  it("knows every attribute the stats panel reads", () => {
    const missing = STAT_ATTRIBUTES.filter((name) => !rt.sde.attributeIdByName.has(name));
    expect(missing).toEqual([]);
  });

  it("calculates a Rifter with all skills at V", () => {
    const fit = { ...rt.engine.load_eft(RIFTER_EFT), character: { skills: allSkills(rt.sde) } };
    const calc = rt.calculate(fit, { validate: true });
    expect(calc.violations).toEqual([]);
    const stats = fitStats(fit, calc, rt.sde);
    expect(stats.slots).toEqual({ high: 3, medium: 3, low: 4, rig: 3, subsystem: 0, service: 0 });
    expect(stats.resources.cpu.total).toBe(162.5); // CPU Management V
    expect(stats.resources.cpu.used).toBeGreaterThan(0);
    expect(stats.resources.cpu.used).toBeLessThanOrEqual(stats.resources.cpu.total);
    expect(stats.resources.turrets).toEqual({ used: 3, total: 3 });
    expect(stats.resources.launchers).toEqual({ used: 0, total: 2 });
    expect(stats.offence.volley).toBeCloseTo(stats.offence.volley, 5);
    expect(stats.offence.volley).toBeGreaterThan(100);
    expect(stats.defence.ehp).toBeGreaterThan(stats.defence.shield.hp + stats.defence.armor.hp + stats.defence.hull.hp);
    expect(stats.defence.armor.resists.em).toBeGreaterThan(stats.defence.armor.resists.explosive); // Minmatar armor
    expect(stats.offence.dps).toBeGreaterThan(100);
        expect(stats.capacitor.capacity).toBeGreaterThan(0);
    expect(stats.capacitor.stablePercent === null || stats.capacitor.stablePercent > 0).toBe(true);
    expect(stats.navigation.alignTime).toBeGreaterThan(1);
    expect(stats.navigation.alignTime).toBeLessThan(5);
    expect(stats.navigation.maxVelocity).toBeGreaterThan(800); // afterburner on
    expect(stats.targeting.sensorType).toBe("ladar");
    expect(stats.targeting.maxLockedTargets).toBeGreaterThan(0);
  });

  it("reports violations without skills", () => {
    const fit = rt.engine.load_eft(RIFTER_EFT);
    const calc = rt.calculate(fit, { validate: true });
    expect(calc.violations?.some((v) => v.rule.type === "skill")).toBe(true);
    const stats = fitStats(fit, calc, rt.sde);
    expect(stats.resources.cpu.total).toBe(130);
  });
});
