import { describe, expect, it } from "vitest";
import { isSidebarCollapsed } from "@/components/shell/sidebar-config";

describe("sidebar preference", () => {
  it("collapses only on an explicit cookie value", () => {
    expect(isSidebarCollapsed("collapsed")).toBe(true);
    expect(isSidebarCollapsed("expanded")).toBe(false);
    expect(isSidebarCollapsed(undefined)).toBe(false);
    expect(isSidebarCollapsed("COLLAPSED")).toBe(false);
  });
});
