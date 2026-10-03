import { describe, expect, it } from "vitest";
import { compareSortValues } from "@/components/ui/sortable-table";

const sortBy = (values: (number | null)[], dir: "asc" | "desc") => [...values].sort((a, b) => compareSortValues(a, b, dir));

describe("compareSortValues", () => {
  it("sorts numbers in either direction with missing values last", () => {
    expect(sortBy([3, null, 1, 2], "desc")).toEqual([3, 2, 1, null]);
    expect(sortBy([3, null, 1, 2], "asc")).toEqual([1, 2, 3, null]);
  });

  it("reports ties as 0", () => {
    expect(compareSortValues(5, 5, "desc")).toBe(0);
    expect(compareSortValues(null, undefined, "asc")).toBe(0);
  });

  it("compares strings by locale", () => {
    expect(compareSortValues("Veldspar", "Scordite", "asc")).toBeGreaterThan(0);
    expect(compareSortValues("Veldspar", "Scordite", "desc")).toBeLessThan(0);
  });
});
