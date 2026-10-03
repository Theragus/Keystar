import { describe, expect, it } from "vitest";
import {
  BRIDGE_MS,
  MAX_OBSERVATION_GAP_MS,
  observationTime,
  planActivity,
  type ActivityCoverage,
  type LedgerQuantity,
} from "@/modules/mining/activity";

const at = (iso: string) => new Date(iso);
const row = (date: string, typeId: number, quantity: number, solarSystemId = 30000142): LedgerQuantity => ({
  date,
  solarSystemId,
  typeId,
  quantity,
});
const coverage = (last: string, growth: string | null = null): ActivityCoverage => ({
  since: at("2026-10-01T00:00:00Z"),
  lastObservedAt: at(last),
  lastGrowthAt: growth ? at(growth) : null,
});

describe("mining activity from ledger growth", () => {
  it("starts coverage on the first observation without recording the backlog", () => {
    const plan = planActivity({
      before: [],
      after: [row("2026-10-02", 1230, 5000)],
      coverage: null,
      observedAt: at("2026-10-02T10:00:00Z"),
    })!;
    expect(plan.window).toBeNull();
    expect(plan.deltas).toEqual([]);
    expect(plan.coverage).toEqual({
      since: at("2026-10-02T10:00:00Z"),
      lastObservedAt: at("2026-10-02T10:00:00Z"),
      lastGrowthAt: null,
    });
  });

  it("records growth between observations, summed across systems, new rows in full", () => {
    const plan = planActivity({
      before: [row("2026-10-02", 1230, 1000, 1), row("2026-10-02", 1230, 500, 2)],
      after: [row("2026-10-02", 1230, 1600, 1), row("2026-10-02", 1230, 900, 2), row("2026-10-02", 17470, 300)],
      coverage: coverage("2026-10-02T10:00:00Z"),
      observedAt: at("2026-10-02T10:15:00Z"),
    })!;
    expect(plan.window).toEqual({ start: at("2026-10-02T10:00:00Z"), end: at("2026-10-02T10:15:00Z") });
    expect(plan.deltas).toEqual([
      { date: "2026-10-02", typeId: 1230, quantity: 1000 },
      { date: "2026-10-02", typeId: 17470, quantity: 300 },
    ]);
    expect(plan.coverage.lastGrowthAt).toEqual(at("2026-10-02T10:15:00Z"));
  });

  it("ignores decreases and unchanged rows", () => {
    const plan = planActivity({
      before: [row("2026-10-02", 1230, 1000)],
      after: [row("2026-10-02", 1230, 900)],
      coverage: coverage("2026-10-02T10:00:00Z", "2026-10-02T09:45:00Z"),
      observedAt: at("2026-10-02T10:15:00Z"),
    })!;
    expect(plan.window).toBeNull();
    expect(plan.coverage.lastObservedAt).toEqual(at("2026-10-02T10:15:00Z"));
    expect(plan.coverage.lastGrowthAt).toEqual(at("2026-10-02T09:45:00Z"));
  });

  it("records nothing across a gap, but resumes observing", () => {
    const last = "2026-10-02T08:00:00Z";
    const observedAt = new Date(at(last).getTime() + MAX_OBSERVATION_GAP_MS + 60_000);
    const plan = planActivity({
      before: [row("2026-10-02", 1230, 1000)],
      after: [row("2026-10-02", 1230, 9000)],
      coverage: coverage(last, last),
      observedAt,
    })!;
    expect(plan.window).toBeNull();
    expect(plan.coverage).toMatchObject({ lastObservedAt: observedAt, lastGrowthAt: null });
  });

  it("bridges a quiet observation inside one session", () => {
    const plan = planActivity({
      before: [row("2026-10-02", 1230, 1000)],
      after: [row("2026-10-02", 1230, 2000)],
      coverage: coverage("2026-10-02T10:15:00Z", "2026-10-02T10:00:00Z"),
      observedAt: at("2026-10-02T10:30:00Z"),
    })!;
    expect(plan.window?.start).toEqual(at("2026-10-02T10:00:00Z"));
  });

  it("does not bridge older growth", () => {
    const growth = at("2026-10-02T10:00:00Z");
    const observedAt = new Date(growth.getTime() + BRIDGE_MS + 60_000);
    const plan = planActivity({
      before: [row("2026-10-02", 1230, 1000)],
      after: [row("2026-10-02", 1230, 2000)],
      coverage: coverage(new Date(observedAt.getTime() - 15 * 60_000).toISOString(), growth.toISOString()),
      observedAt,
    })!;
    expect(plan.window?.start).toEqual(new Date(observedAt.getTime() - 15 * 60_000));
  });

  it("ignores snapshots that are not newer than the last observation", () => {
    expect(
      planActivity({
        before: [],
        after: [row("2026-10-02", 1230, 1)],
        coverage: coverage("2026-10-02T10:00:00Z"),
        observedAt: at("2026-10-02T10:00:00Z"),
      }),
    ).toBeNull();
  });

  it("splits a window across midnight by ledger day and drops old corrections", () => {
    const plan = planActivity({
      before: [row("2026-10-01", 1230, 1000), row("2026-09-20", 1230, 50)],
      after: [row("2026-10-01", 1230, 1400), row("2026-10-02", 1230, 200), row("2026-09-20", 1230, 80)],
      coverage: coverage("2026-10-01T23:55:00Z"),
      observedAt: at("2026-10-02T00:10:00Z"),
    })!;
    expect(plan.deltas).toEqual([
      { date: "2026-10-01", typeId: 1230, quantity: 400 },
      { date: "2026-10-02", typeId: 1230, quantity: 200 },
    ]);
  });

  it("uses Last-Modified only when it is a plausible snapshot time", () => {
    const now = at("2026-10-02T10:00:00Z");
    expect(observationTime(at("2026-10-02T09:55:00Z"), now)).toEqual(at("2026-10-02T09:55:00Z"));
    expect(observationTime(at("2026-10-02T07:00:00Z"), now)).toEqual(now);
    expect(observationTime(at("2026-10-02T10:00:30Z"), now)).toEqual(now);
    expect(observationTime(null, now)).toEqual(now);
  });
});
