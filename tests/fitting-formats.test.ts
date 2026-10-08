import { beforeAll, describe, expect, it } from "vitest";
import type { FittingRuntime } from "@/modules/fitting/engine/engine";
import { exportEft, importFit, sharePayload, shareUrl } from "@/modules/fitting/engine/formats";
import { loadTestRuntime, RIFTER_EFT } from "./fitting-fixture";

let rt: FittingRuntime;
beforeAll(async () => {
  rt = await loadTestRuntime();
});

describe("fit import and export", () => {
  it("round-trips EFT", () => {
    const fit = importFit(rt.engine, RIFTER_EFT);
    expect(fit.ship.type_id).toBe(587);
    expect(fit.name).toBe("Test Rifter");
    expect(fit.items.filter((i) => i.slot.type === "high")).toHaveLength(3);
    expect(exportEft(rt.engine, fit)).toContain("150mm Light AutoCannon II, Republic Fleet EMP S");
    expect(importFit(rt.engine, exportEft(rt.engine, fit)).items).toEqual(fit.items);
  });

  it("imports DNA and chat links", () => {
    const fit = importFit(rt.engine, "<url=fitting:587:2048;1:2889;3::>Rifter</url>");
    expect(fit.ship.type_id).toBe(587);
    expect(fit.items).toHaveLength(4);
  });

  it("round-trips share links", () => {
    const fit = importFit(rt.engine, RIFTER_EFT);
    const url = shareUrl(rt.engine, fit, "https://keystar.example");
    expect(url.startsWith("https://keystar.example/fitting#fit=")).toBe(true);
    const back = importFit(rt.engine, url);
    expect(back.ship.type_id).toBe(587);
    expect(back.items.map((i) => i.type_id).sort()).toEqual(fit.items.map((i) => i.type_id).sort());
    expect(importFit(rt.engine, sharePayload(rt.engine, fit)).ship.type_id).toBe(587);
  });

  it("maps ESI fittings both ways", () => {
    const fit = importFit(rt.engine, RIFTER_EFT);
    const esi = rt.engine.save_esi_fitting(fit);
    expect(esi.ship_type_id).toBe(587);
    expect(esi.items.some((i) => i.flag === "HiSlot0")).toBe(true);
    const back = rt.engine.load_esi_fitting(esi);
    expect(back.items.filter((i) => i.slot.type === "high")).toHaveLength(3);
  });

  it("explains bad input", () => {
    expect(() => importFit(rt.engine, "garbage")).toThrow(/unknown format/);
    expect(() => importFit(rt.engine, "[Rifter, x]\nNo Such Module I")).toThrow(/unknown type/);
  });
});
