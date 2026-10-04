import { describe, expect, it } from "vitest";
import {
  attributeOp,
  calendarEventWindow,
  DEFAULT_END_GRACE_MS,
  opInterval,
  opStatus,
  type AttributionInput,
  type OpWindow,
} from "@/modules/mining/ops/attribution";
import { computePayout, splitWhole, type PayeeInput } from "@/modules/mining/ops/payout";

const at = (hhmm: string) => new Date(`2026-10-02T${hhmm}:00Z`);
const win = (characterId: number, from: string, to: string, quantity: number, solarSystemId = 1, typeId = 1230): OpWindow => ({
  characterId,
  start: at(from),
  end: at(to),
  solarSystemId,
  typeId,
  quantity,
});
const base = (extra: Partial<AttributionInput> = {}): AttributionInput => ({
  startsAt: at("19:00"),
  endsAt: at("21:00"),
  now: at("23:00"),
  graceMs: 0,
  solarSystemIds: [],
  participation: "anyone",
  windows: [],
  ...extra,
});
const ore = (pilots: ReturnType<typeof attributeOp>, characterId: number, typeId = 1230) =>
  pilots.find((p) => p.characterId === characterId)?.types.get(typeId) ?? 0;

describe("mining op attribution", () => {
  it("counts windows inside the op in full and prorates the ones across its start and end", () => {
    const pilots = attributeOp(
      base({
        windows: [
          win(1, "18:30", "18:45", 999), // before
          win(1, "18:50", "19:05", 300), // 5 of 15 minutes inside
          win(1, "19:30", "19:45", 1000), // inside
          win(1, "20:50", "21:05", 600), // 10 of 15 minutes inside
          win(1, "21:10", "21:25", 999), // after
        ],
      }),
    );
    expect(pilots).toHaveLength(1);
    expect(pilots[0].status).toBe("counted");
    expect(ore(pilots, 1)).toBeCloseTo(100 + 1000 + 400);
  });

  it("extends the end by the grace for ledger lag and never counts beyond now", () => {
    const windows = [win(1, "21:00", "21:15", 900)];
    expect(ore(attributeOp(base({ windows, graceMs: DEFAULT_END_GRACE_MS })), 1)).toBeCloseTo(900);
    expect(ore(attributeOp(base({ windows, graceMs: 0 })), 1)).toBe(0);
    const running = opInterval({ startsAt: at("19:00"), endsAt: null, now: at("20:00") });
    expect(running).toEqual({ start: at("19:00").getTime(), end: at("20:00").getTime() });
    expect(opInterval({ startsAt: at("19:00"), endsAt: at("21:00"), now: at("20:00") }).end).toBe(at("20:00").getTime());
  });

  it("filters by system; activity recorded before systems were kept only counts without a filter", () => {
    const windows = [win(1, "19:00", "19:15", 100, 1), win(1, "19:15", "19:30", 200, 2), win(2, "19:15", "19:30", 50, 0)];
    const filtered = attributeOp(base({ windows, solarSystemIds: [2] }));
    expect(filtered.map((p) => p.characterId)).toEqual([1]);
    expect(ore(filtered, 1)).toBe(200);
    expect(ore(attributeOp(base({ windows })), 2)).toBe(50);
  });

  it("fleet mode counts members for their time in fleet and lists solo miners as outside", () => {
    const pilots = attributeOp(
      base({
        participation: "fleet",
        windows: [win(1, "19:00", "19:30", 300), win(1, "20:00", "20:30", 300), win(2, "19:00", "20:00", 500)],
        fleetSpans: new Map([
          [1, [{ start: at("19:15"), end: at("20:15") }]],
          [3, [{ start: at("18:00"), end: null }]],
        ]),
      }),
    );
    expect(pilots.map((p) => [p.characterId, p.status])).toEqual([
      [1, "counted"],
      [2, "outside"],
      [3, "counted"],
    ]);
    // 15 of 30 minutes of each window were in fleet.
    expect(ore(pilots, 1)).toBeCloseTo(300);
    expect(ore(pilots, 2)).toBe(500);
    // Fleet members without ore still take part (a booster in an equal split).
    expect(pilots.find((p) => p.characterId === 3)!.types.size).toBe(0);
  });

  it("calendar mode counts accepted attendees", () => {
    const pilots = attributeOp(
      base({
        participation: "calendar",
        windows: [win(1, "19:00", "19:15", 100), win(2, "19:00", "19:15", 100)],
        accepted: new Set([1, 4]),
      }),
    );
    expect(pilots.map((p) => [p.characterId, p.status])).toEqual([
      [1, "counted"],
      [2, "outside"],
      [4, "counted"],
    ]);
  });

  it("applies overrides: excluded solo miners, self opt-outs and included pilots without ore", () => {
    const pilots = attributeOp(
      base({
        windows: [win(1, "19:00", "19:15", 100), win(2, "19:00", "19:15", 100), win(3, "19:00", "19:15", 100)],
        overrides: new Map([
          [2, { mode: "excluded", self: false }],
          [3, { mode: "excluded", self: true }],
          [5, { mode: "included", self: false }],
        ]),
      }),
    );
    expect(pilots.map((p) => [p.characterId, p.status, p.reason])).toEqual([
      [1, "counted", null],
      [2, "excluded", "override"],
      [3, "excluded", "self"],
      [5, "counted", "override"],
    ]);
    // Included pilots outside the fleet count with everything they mined in the op.
    const fleet = attributeOp(
      base({
        participation: "fleet",
        windows: [win(2, "19:00", "19:15", 100)],
        fleetSpans: new Map(),
        overrides: new Map([[2, { mode: "included", self: false }]]),
      }),
    );
    expect(fleet[0].status).toBe("counted");
    expect(ore(fleet, 2)).toBe(100);
  });

  it("derives the window of a calendar event and the op status", () => {
    expect(calendarEventWindow({ eventDate: at("19:00"), durationMinutes: 90 })).toEqual({
      startsAt: at("19:00"),
      endsAt: at("20:30"),
    });
    const op = { startsAt: at("19:00"), endsAt: at("21:00"), finalizedAt: null };
    expect(opStatus(op, at("18:00"))).toBe("planned");
    expect(opStatus(op, at("20:00"))).toBe("running");
    expect(opStatus({ ...op, endsAt: null }, at("23:00"))).toBe("running");
    expect(opStatus(op, at("21:00"))).toBe("ended");
    expect(opStatus({ ...op, finalizedAt: at("22:00") }, at("23:00"))).toBe("finalized");
  });
});

describe("mining op payout", () => {
  const payee = (id: number, value: number): PayeeInput => ({
    payeeCharacterId: id,
    userId: null,
    characterIds: [id],
    volume: value / 100,
    value,
  });

  it("splits whole ISK by largest remainder so the parts add up", () => {
    expect(splitWhole(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(splitWhole(10, [0, 0])).toEqual([0, 0]);
    expect(splitWhole(7, [2, 1, 0])).toEqual([5, 2, 0]);
  });

  it("applies the rate and the corporation's cut, then splits by contribution", () => {
    const payout = computePayout([payee(1, 3_000_000), payee(2, 1_000_000)], { ratePct: 90, corpCutPct: 10, splitMode: "contribution" });
    expect(payout.gross).toBe(4_000_000);
    expect(payout.pool).toBe(3_600_000);
    expect(payout.corpCut).toBe(360_000);
    expect(payout.distributed).toBe(3_240_000);
    expect(payout.shares.map((s) => s.share)).toEqual([2_430_000, 810_000]);
  });

  it("splits equally, including payees without ore", () => {
    const payout = computePayout([payee(1, 900), payee(2, 0), payee(3, 101)], { ratePct: 100, corpCutPct: 0, splitMode: "equal" });
    expect(payout.shares.map((s) => s.share)).toEqual([334, 334, 333]);
    expect(payout.distributed).toBe(1001);
  });

  it("clamps percentages and shares nothing without value", () => {
    const payout = computePayout([payee(1, 0)], { ratePct: 150, corpCutPct: -5, splitMode: "contribution" });
    expect(payout.distributed).toBe(0);
    expect(computePayout([payee(1, 1000)], { ratePct: 150, corpCutPct: -5, splitMode: "contribution" }).distributed).toBe(1000);
  });
});
