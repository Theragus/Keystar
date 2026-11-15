import { describe, expect, it } from "vitest";
import { BLUEPRINT_CATEGORY_ID, blueprintIcon, isBlueprintCategory, typeIcon, typeIconOf } from "@/core/eve/images";

describe("type images", () => {
  it("asks for a type's icon", () => {
    expect(typeIcon(17478)).toBe("https://images.evetech.net/types/17478/icon?size=32");
    expect(typeIcon(17478, 64)).toBe("https://images.evetech.net/types/17478/icon?size=64");
  });

  it("asks blueprints for the bp or bpc variation, never icon (the image server answers 400)", () => {
    expect(blueprintIcon(17479)).toBe("https://images.evetech.net/types/17479/bp?size=32");
    expect(blueprintIcon(17479, "bpc", 64)).toBe("https://images.evetech.net/types/17479/bpc?size=64");
  });

  it("picks the blueprint image only when told the type is a blueprint", () => {
    expect(typeIconOf(17478, null)).toBe(typeIcon(17478));
    expect(typeIconOf(17478, undefined, 64)).toBe(typeIcon(17478, 64));
    expect(typeIconOf(2455, "bp")).toBe(blueprintIcon(2455, "bp"));
    expect(typeIconOf(2455, "bpc", 64)).toBe(blueprintIcon(2455, "bpc", 64));
  });

  it("knows the blueprint category (blueprints and reaction formulas)", () => {
    expect(BLUEPRINT_CATEGORY_ID).toBe(9);
    expect(isBlueprintCategory(9)).toBe(true);
    expect(isBlueprintCategory(6)).toBe(false);
    expect(isBlueprintCategory(null)).toBe(false);
    expect(isBlueprintCategory(undefined)).toBe(false);
  });
});
