import { describe, expect, it } from "vitest";
import {
  bayItems,
  emptyFit,
  fitReducer,
  freeSlotIndex,
  nextState,
  overflowItems,
  rackItems,
  UNIFORM_DAMAGE,
} from "@/modules/fitting/engine/fit-state";
import { detectFormat, extractLinkPayload } from "@/modules/fitting/engine/formats";

const RIFTER = 587;
const AC = 2889;
const EMP_S = 21898;
const HOBGOBLIN = 2456;
const slotCounts = { high: 3, medium: 3, low: 4, rig: 3, subsystem: 0, service: 0 };

describe("fit reducer", () => {
  it("fills the lowest free slot and refuses a full rack", () => {
    let fit = emptyFit(RIFTER);
    for (let i = 0; i < 3; i++) fit = fitReducer(fit, { type: "addModule", typeId: AC, slot: "high", slotCounts, charge: EMP_S });
    expect(fit.items.map((i) => i.slot)).toEqual([
      { type: "high", index: 0 },
      { type: "high", index: 1 },
      { type: "high", index: 2 },
    ]);
    expect(fit.items[0].charge).toEqual({ type_id: EMP_S });
    expect(freeSlotIndex(fit, "high", 3)).toBeNull();
    expect(fitReducer(fit, { type: "addModule", typeId: AC, slot: "high", slotCounts })).toBe(fit);
    fit = fitReducer(fit, { type: "removeItem", index: 1 });
    expect(freeSlotIndex(fit, "high", 3)).toBe(1);
    expect(rackItems(fit, "high", 3).map((r) => (r && "index" in r.item.slot ? r.item.slot.index : null))).toEqual([0, null, 2]);
  });

  it("stacks drones and charges by type, and drops a zero quantity", () => {
    let fit = emptyFit(RIFTER);
    fit = fitReducer(fit, { type: "addToBay", typeId: HOBGOBLIN, bay: "drone_bay" });
    fit = fitReducer(fit, { type: "addToBay", typeId: HOBGOBLIN, bay: "drone_bay", quantity: 2 });
    fit = fitReducer(fit, { type: "addToBay", typeId: EMP_S, bay: "cargo", quantity: 400 });
    expect(bayItems(fit, "drone_bay")).toEqual([{ index: 0, item: expect.objectContaining({ quantity: 3, state: "active" }) }]);
    expect(bayItems(fit, "cargo")[0].item).toMatchObject({ quantity: 400, state: "offline" });
    fit = fitReducer(fit, { type: "setQuantity", index: 0, quantity: 0 });
    expect(bayItems(fit, "drone_bay")).toEqual([]);
  });

  it("changes state, charge, type, skills and damage profile", () => {
    let fit = fitReducer(emptyFit(RIFTER), { type: "addModule", typeId: AC, slot: "high", slotCounts });
    fit = fitReducer(fit, { type: "setState", index: 0, state: "overload" });
    fit = fitReducer(fit, { type: "setCharge", index: 0, chargeTypeId: EMP_S });
    expect(fit.items[0]).toMatchObject({ state: "overload", charge: { type_id: EMP_S } });
    fit = fitReducer(fit, { type: "setCharge", index: 0, chargeTypeId: null });
    expect(fit.items[0].charge).toBeUndefined();
    fit = fitReducer(fit, { type: "replaceItem", index: 0, typeId: 2873 });
    expect(fit.items[0].type_id).toBe(2873);
    fit = fitReducer(fit, { type: "setSkills", skills: { 3300: 5 } });
    expect(fit.character?.skills).toEqual({ 3300: 5 });
    const profile = { em: 1, thermal: 0, kinetic: 0, explosive: 0 };
    fit = fitReducer(fit, { type: "setDamageProfile", profile });
    expect(fit.environment?.damage_profile).toEqual(profile);
    expect(emptyFit(RIFTER).environment?.damage_profile).toEqual(UNIFORM_DAMAGE);
    expect(fitReducer(fit, { type: "setState", index: 9, state: "online" })).toBe(fit);
  });

  it("keeps modules that no longer fit after a hull swap as overflow", () => {
    let fit = emptyFit(RIFTER);
    for (let i = 0; i < 4; i++) fit = fitReducer(fit, { type: "addModule", typeId: 2048, slot: "low", slotCounts });
    fit = fitReducer(fit, { type: "setShip", typeId: 582 }); // Bantam
    expect(fit.ship.type_id).toBe(582);
    expect(overflowItems(fit, { ...slotCounts, low: 2 }).map((o) => o.index)).toEqual([2, 3]);
  });

  it("cycles module states within what the module allows", () => {
    expect(nextState("online", "overload")).toBe("active");
    expect(nextState("overload", "overload")).toBe("offline");
    expect(nextState("active", "online")).toBe("offline");
    expect(nextState("online", "online")).toBe("offline");
  });
});

describe("fit formats", () => {
  it("recognises pasted fits", () => {
    expect(detectFormat("[Rifter, x]\nDamage Control II")).toBe("eft");
    expect(detectFormat("fitting:587:2048;1:2889;3::")).toBe("dna");
    expect(detectFormat("<url=fitting:587:2048;1::>Rifter</url>")).toBe("dna");
    expect(detectFormat("587:2048;1:2889;3::")).toBe("dna");
    expect(detectFormat("%esf/1\nRifter")).toBe("esf");
    expect(detectFormat("https://keystar.example/fitting#fit=CjoIARDLBBoFUHJvYmUqBwjJ")).toBe("link");
    expect(detectFormat("CjoIARDLBBoFUHJvYmUqBwjJFiCKqwEqAwjVLioDCIAQ")).toBe("link");
    expect(detectFormat("hello world")).toBeNull();
    expect(detectFormat("")).toBeNull();
  });

  it("reads the share payload from a URL", () => {
    expect(extractLinkPayload("https://k.example/fitting#fit=abc_-123")).toBe("abc_-123");
    expect(extractLinkPayload("https://k.example/fitting?fit=abc")).toBe("abc");
    expect(extractLinkPayload("https://k.example/fitting")).toBeNull();
  });
});

describe("ESI fitting rows", async () => {
  const { fittingRows } = await import("@/modules/fitting/jobs");
  it("keeps what ESI returned, with an empty description and item list when missing", () => {
    const now = new Date("2026-10-08T10:00:00Z");
    const rows = fittingRows(
      7,
      [
        { fitting_id: 1, name: "A", ship_type_id: 587, items: [{ flag: "HiSlot0", quantity: 1, type_id: 2889 }] },
        { fitting_id: 2, name: "B", description: "d", ship_type_id: 626, items: undefined as never },
      ],
      now,
    );
    expect(rows).toEqual([
      { characterId: 7, fittingId: 1, name: "A", description: "", shipTypeId: 587, items: [{ flag: "HiSlot0", quantity: 1, type_id: 2889 }], updatedAt: now },
      { characterId: 7, fittingId: 2, name: "B", description: "d", shipTypeId: 626, items: [], updatedAt: now },
    ]);
  });
});
