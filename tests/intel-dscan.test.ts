import { describe, expect, it } from "vitest";
import { countDscan, parseDscanLine } from "@/core/eve/dscan";
import { sanitizeDscan } from "@/modules/intel/ai/claude";
import { dscanFacts, type FactsPilot } from "@/modules/intel/ai/facts";
import { templateDscan } from "@/modules/intel/ai/template";
import { matchDscan, type DscanPilot } from "@/modules/intel/dscan";
import type { DisplayNames } from "@/modules/intel/names";
import type { HullUse, PilotProfile } from "@/modules/intel/types";

const now = new Date("2026-10-02T20:00:00Z");
const neutral = { cls: "neutral", value: null, source: null, via: null } as const;
const blue = { cls: "blue", value: 10, source: "corporation", via: "alliance" } as const;
const hours = (h: number) => new Date(now.getTime() - h * 3600_000).toISOString();

function profileWith(hulls: Partial<HullUse>[]): PilotProfile {
  return { hulls: hulls.map((h) => ({ shipTypeId: 0, groupId: null, weight: 1, count: 1, lastAt: null, ...h })) } as PilotProfile;
}

const SABRE = { typeId: 22456, name: "Sabre", count: 1, groupId: 541 };
const LOKI = { typeId: 29990, name: "Loki", count: 2, groupId: 963 };
const FLYCATCHER = { typeId: 22464, name: "Flycatcher", count: 1, groupId: 541 };

const pilots: DscanPilot[] = [
  { characterId: 1, name: "Sabre Pilot", standing: neutral, profile: profileWith([{ shipTypeId: 22456, groupId: 541, weight: 5, lastAt: hours(2) }]) },
  { characterId: 2, name: "Loki Pilot", standing: neutral, profile: profileWith([{ shipTypeId: 29990, groupId: 963, weight: 3, lastAt: hours(30 * 24) }]) },
  // Flies both, but the Sabre is taken by the stronger match.
  { characterId: 3, name: "Both", standing: neutral, profile: profileWith([{ shipTypeId: 22456, groupId: 541, weight: 2, lastAt: hours(5) }]) },
  { characterId: 4, name: "Blue Loki", standing: blue, profile: profileWith([{ shipTypeId: 29990, groupId: 963, weight: 9, lastAt: hours(1) }]) },
];

describe("d-scan parsing", () => {
  it("reads lines and counts per type", () => {
    expect(parseDscanLine("22456\tTackle 1\tSabre\t1,200 km")).toEqual({ typeId: 22456, name: "Tackle 1", typeName: "Sabre", distance: "1,200 km" });
    expect(parseDscanLine("Pilot Name")).toBeNull();
    const { entries, lines } = countDscan("22456\ta\tSabre\t1 km\n29990\tb\tLoki\t-\n29990\tc\tLoki\t5 AU\nnot a line");
    expect(lines).toBe(3);
    expect(entries).toEqual([
      { typeId: 29990, typeName: "Loki", count: 2 },
      { typeId: 22456, typeName: "Sabre", count: 1 },
    ]);
  });
});

describe("d-scan matching", () => {
  it("assigns each hull to the pilots with the strongest recent evidence", () => {
    const rows = matchDscan([SABRE, LOKI, FLYCATCHER], pilots, now);
    const byType = new Map(rows.map((r) => [r.typeId, r]));
    expect(byType.get(22456)!.assigned).toEqual([{ characterId: 1, confidence: "likely" }]);
    // Loki pilot flew it a month ago: possible; blues are never matched.
    expect(byType.get(29990)!.assigned).toEqual([{ characterId: 2, confidence: "possible" }]);
    expect(byType.get(29990)!.candidates.map((c) => c.characterId)).not.toContain(4);
    // Only a class match left for the Flycatcher (another interdictor): a guess.
    expect(byType.get(22464)!.assigned).toEqual([{ characterId: 3, confidence: "guess" }]);
  });
});

describe("d-scan read", () => {
  const names: DisplayNames = { types: new Map(), systems: new Map(), entities: new Map(), tickers: new Map() };
  const factsPilots: FactsPilot[] = pilots.map((p) => ({
    characterId: p.characterId,
    name: p.name,
    corporationTicker: null,
    corporationName: null,
    allianceName: null,
    standing: p.standing,
    history: null,
    profile: { ...p.profile!, recent: { lastSeen: null } } as PilotProfile,
    score: null,
  }));
  const facts = () => dscanFacts(matchDscan([SABRE, LOKI], pilots, now), factsPilots, names, now);

  it("keeps only candidates, the count on scan and one hull per pilot", () => {
    const read = sanitizeDscan(
      {
        assessment: "Sabre and Lokis: a hunter gang.",
        assignments: [
          { typeId: 22456, characterId: 1, confidence: "likely", reason: "Flew a Sabre 2 hours ago" },
          { typeId: 22456, characterId: 3, confidence: "possible", reason: "Second Sabre" }, // only one on scan
          { typeId: 29990, characterId: 1, confidence: "guess", reason: "Already placed" }, // not a Loki candidate
          { typeId: 29990, characterId: 2, confidence: "possible", reason: "Lokis" },
          { typeId: 29990, characterId: null, confidence: "guess", reason: "Unknown" },
          { typeId: 99999, characterId: 2, confidence: "likely", reason: "Not on scan" },
        ],
        notes: "",
      },
      facts(),
    );
    expect(read.assignments.map((a) => [a.typeId, a.characterId])).toEqual([
      [22456, 1],
      [29990, 2],
      [29990, null],
    ]);
  });

  it("falls back to the computed assignment", () => {
    const read = templateDscan(facts());
    expect(read.assessment).toContain("3 ships on scan");
    expect(read.assignments.map((a) => a.characterId)).toEqual([1, 2]);
    expect(read.notes).toContain("Loki");
  });
});
