import { inArray } from "drizzle-orm";
import { eveSystems, getDb } from "@/core/db";
import type { Formatter } from "@/lib/format";
import type { Messages } from "@/i18n/messages";
import { getLinkableEvents, getLinkableFleets, type MiningOp } from "./queries";
import type { OpFormValues } from "./components/op-form";

/** A datetime-local value in EVE time (UTC): "2026-10-02T19:00". */
export function eveTimeInput(date: Date | null): string {
  return date ? date.toISOString().slice(0, 16) : "";
}

/** Fleets and calendar events the op form offers, labelled for the viewer. */
export async function opFormOptions(t: Messages, f: Formatter, homeCorporationId: number) {
  const [fleets, events] = await Promise.all([getLinkableFleets(), getLinkableEvents(homeCorporationId)]);
  return {
    events,
    fleetOptions: fleets.map((fl) => ({ fleetId: fl.fleetId, label: t.ops.form.fleetOption(fl.bossName, f.dateTime(fl.startedAt), fl.members) })),
    eventOptions: events.map((e) => ({ eventId: e.eventId, label: t.ops.form.eventOption(e.title, f.dateTime(e.eventDate), e.accepted) })),
  };
}

/** Form values of an existing op. */
export async function opFormValues(op: MiningOp): Promise<OpFormValues> {
  const names = op.solarSystemIds.length
    ? await getDb().select({ id: eveSystems.systemId, name: eveSystems.name }).from(eveSystems).where(inArray(eveSystems.systemId, op.solarSystemIds))
    : [];
  const byId = new Map(names.map((s) => [s.id, s.name]));
  return {
    id: op.id,
    name: op.name,
    startsAt: eveTimeInput(op.startsAt),
    endsAt: eveTimeInput(op.endsAt),
    systems: op.solarSystemIds.map((id) => ({ id, name: byId.get(id) ?? `#${id}` })),
    oreClasses: op.oreClasses,
    participation: op.participation,
    fleetId: op.fleetId,
    calendarEventId: op.calendarEventId,
    valuationSource: op.valuationSource,
    ratePct: op.ratePct,
    corpCutPct: op.corpCutPct,
    splitMode: op.splitMode,
    notes: op.notes,
  };
}
