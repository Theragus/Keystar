import { sql } from "drizzle-orm";
import { calendarEventAttendees, calendarEvents, miningActivity, miningActivityCoverage, miningCharacterLedger, miningOpParticipants, miningOps, type Db } from "@/core/db";
import { finalizeOp } from "@/modules/mining/ops/queries";

/**
 * Demo mining ops: a finalized belt op a few days ago (with a solo miner the
 * organiser excluded), one running now and a planned moon pop from a
 * corporation calendar event. Their ore is written as measured activity and
 * into the ledgers, so the ops add up like real ones.
 */
export async function seedMiningOps(
  db: Db,
  opts: {
    corporationId: number;
    corporationName: string;
    members: { characterId: number; name: string }[];
    organiser: { userId: string; name: string };
    beltSystemId: number;
    moonSystemId: number;
    ores: { typeId: number; volume: number }[];
    rand: () => number;
    now: Date;
  },
): Promise<{ ops: number; windows: number }> {
  const { members, rand, now } = opts;
  const day = (offset: number, hour: number, minute = 0) => {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() + offset);
    d.setUTCHours(hour, minute, 0, 0);
    return d;
  };
  const activity: (typeof miningActivity.$inferInsert)[] = [];
  const ledger = new Map<string, typeof miningCharacterLedger.$inferInsert>();
  /** 15-minute windows of one pilot from `from` to `to`, about `m3PerHour` of one ore. */
  const mine = (characterId: number, from: Date, to: Date, m3PerHour: number) => {
    const ore = opts.ores[Math.floor(rand() * opts.ores.length)];
    for (let t = from.getTime(); t + 900_000 <= to.getTime(); t += 900_000) {
      const quantity = Math.round(((m3PerHour / 4) * (0.8 + rand() * 0.4)) / ore.volume);
      const date = new Date(t).toISOString().slice(0, 10);
      activity.push({
        characterId,
        date,
        solarSystemId: opts.beltSystemId,
        typeId: ore.typeId,
        quantity,
        windowStart: new Date(t),
        windowEnd: new Date(t + 900_000),
      });
      const key = `${characterId}|${date}|${ore.typeId}`;
      const row = ledger.get(key) ?? { characterId, date, solarSystemId: opts.beltSystemId, typeId: ore.typeId, quantity: 0 };
      row.quantity = (row.quantity ?? 0) + quantity;
      ledger.set(key, row);
    }
  };

  // Finalized belt op three days ago, 18:00–20:30; the first six members mine through most of it.
  const beltStart = day(-3, 18);
  const beltEnd = day(-3, 20, 30);
  const crew = members.slice(0, 6);
  crew.forEach((m, i) => mine(m.characterId, day(-3, 18, (i % 3) * 15), day(-3, 20, 30 - (i % 2) * 15), 30_000 + i * 4000));
  // A solo miner in the same belt before and during the op.
  const solo = members[6];
  if (solo) mine(solo.characterId, day(-3, 17), day(-3, 19), 25_000);

  // Running op: started 75 minutes ago, four pilots.
  const runningStart = new Date(Math.floor((now.getTime() - 75 * 60_000) / 900_000) * 900_000);
  members.slice(0, 4).forEach((m) => mine(m.characterId, runningStart, new Date(Math.floor(now.getTime() / 900_000) * 900_000), 35_000));

  for (let i = 0; i < activity.length; i += 1000) await db.insert(miningActivity).values(activity.slice(i, i + 1000)).onConflictDoNothing();
  const ledgerRows = [...ledger.values()];
  for (let i = 0; i < ledgerRows.length; i += 1000)
    await db
      .insert(miningCharacterLedger)
      .values(ledgerRows.slice(i, i + 1000))
      .onConflictDoUpdate({
        target: [miningCharacterLedger.characterId, miningCharacterLedger.date, miningCharacterLedger.solarSystemId, miningCharacterLedger.typeId],
        set: { quantity: sql`${miningCharacterLedger.quantity} + excluded.quantity` },
      });
  await db
    .insert(miningActivityCoverage)
    .values(members.map((m) => ({ characterId: m.characterId, since: day(-14, 0), lastObservedAt: new Date(now.getTime() - 300_000) })))
    .onConflictDoNothing();

  const common = {
    corporationId: opts.corporationId,
    valuationSource: "jita_buy" as const,
    createdBy: opts.organiser.userId,
    createdByName: opts.organiser.name,
  };
  await db.insert(miningOps).values([
    {
      ...common,
      id: "demoBeltOp1",
      name: "Belt op · Vitrauze",
      startsAt: beltStart,
      endsAt: beltEnd,
      solarSystemIds: [opts.beltSystemId],
      ratePct: 90,
      corpCutPct: 10,
      notes: "Orca on grid from 18:00, hauler: Mira. Ore goes to the corp hangar in Vitrauze.",
    },
    {
      ...common,
      id: "demoEveningOp",
      name: "Evening belt run",
      startsAt: runningStart,
      endsAt: null,
      solarSystemIds: [opts.beltSystemId],
      ratePct: 90,
      corpCutPct: 0,
      splitMode: "equal",
    },
  ]);
  if (solo)
    await db.insert(miningOpParticipants).values({
      opId: "demoBeltOp1",
      characterId: solo.characterId,
      mode: "excluded",
      reason: "Mining solo, not in the op",
      setByName: opts.organiser.name,
    });
  await finalizeOp("demoBeltOp1", opts.organiser.name, day(-3, 22));

  // Planned moon pop from the corporation calendar, two days ahead, with its attendees.
  const eventId = 9_000_001;
  await db.insert(calendarEvents).values({
    eventId,
    ownerType: "corporation",
    ownerId: opts.corporationId,
    ownerName: opts.corporationName,
    title: "Sunday moon pop",
    text: "Athanor chunk arrives at 19:00. Bring Orcas.",
    eventDate: day(2, 19),
    durationMinutes: 150,
    importance: 1,
    seenByCharacterId: members[0].characterId,
  });
  await db.insert(calendarEventAttendees).values(
    members.slice(0, 8).map((m, i) => ({ eventId, characterId: m.characterId, response: i < 5 ? ("accepted" as const) : i < 7 ? ("tentative" as const) : ("declined" as const) })),
  );
  await db.insert(miningOps).values({
    ...common,
    id: "demoMoonPop1",
    name: "Sunday moon pop",
    startsAt: day(2, 19),
    endsAt: day(2, 21, 30),
    solarSystemIds: [opts.moonSystemId],
    oreClasses: ["moon_r4", "moon_r8", "moon_r16", "moon_r32", "moon_r64"],
    participation: "calendar",
    calendarEventId: eventId,
    ratePct: 90,
    corpCutPct: 15,
  });
  return { ops: 3, windows: activity.length };
}
