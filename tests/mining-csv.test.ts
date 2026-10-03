import { describe, expect, it } from "vitest";
import { csvNumber, csvText } from "@/modules/mining/csv";

describe("csvNumber", () => {
  it("leaves negative numbers unchanged", () => {
    expect(csvNumber(-0.45, 2)).toBe("-0.45");
    expect(csvNumber(-1, 2)).toBe("-1.00");
    expect(csvNumber(-5)).toBe("-5");
  });

  it("handles null", () => {
    expect(csvNumber(null, 2)).toBe("");
  });
});

describe("csvText", () => {
  it("neutralises formulas", () => {
    expect(csvText('=HYPERLINK("http://evil","x")')).toBe(`"'=HYPERLINK(""http://evil"",""x"")"`);
    expect(csvText("-1+1")).toBe(`"'-1+1"`);
    expect(csvText("@SUM(A1)")).toBe(`"'@SUM(A1)"`);
    expect(csvText("+cmd")).toBe(`"'+cmd"`);
  });

  it("neutralises names that look like negative numbers", () => {
    expect(csvText("-1")).toBe(`"'-1"`);
  });

  it("quotes and handles null", () => {
    expect(csvText("a,b")).toBe('"a,b"');
    expect(csvText(null)).toBe("");
  });
});
