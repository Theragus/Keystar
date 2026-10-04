import { CalendarDays, Users } from "lucide-react";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/shell/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Panel } from "@/components/ui/glass";
import { requirePermission } from "@/core/auth/dal";
import { getSettings } from "@/core/settings";
import { getI18n } from "@/i18n/server";
import { MINING_PERMISSIONS } from "@/modules/mining/module";
import { calendarEventWindow } from "@/modules/mining/ops/attribution";
import { OpForm, type OpFormValues } from "@/modules/mining/ops/components/op-form";
import { eveTimeInput, opFormOptions } from "@/modules/mining/ops/form-data";
import { saveOp } from "../actions";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t.ops.form.titleNew };
}

export default async function NewOpPage({ searchParams }: PageProps<"/mining/ops/new">) {
  await requirePermission(MINING_PERMISSIONS.manageOps);
  const settings = await getSettings();
  const home = settings["corp.homeCorporationId"];
  if (!home) redirect("/mining/ops");
  const { t, f } = await getI18n();
  const m = t.ops.form;
  const params = await searchParams;
  const { events, fleetOptions, eventOptions } = await opFormOptions(t, f, home);

  const eventId = Number(params.event);
  const fleetId = Number(params.fleet);
  const event = events.find((e) => e.eventId === eventId);
  const now = new Date();
  now.setUTCSeconds(0, 0);
  now.setUTCMinutes(now.getUTCMinutes() - (now.getUTCMinutes() % 5));
  const window = event ? calendarEventWindow(event) : null;
  const values: OpFormValues = {
    name: event?.title ?? "",
    startsAt: eveTimeInput(window?.startsAt ?? now),
    endsAt: window && event!.durationMinutes > 0 ? eveTimeInput(window.endsAt) : "",
    systems: [],
    oreClasses: [],
    participation: event ? "calendar" : fleetOptions.some((fl) => fl.fleetId === fleetId) ? "fleet" : "anyone",
    fleetId: fleetOptions.some((fl) => fl.fleetId === fleetId) ? fleetId : null,
    calendarEventId: event?.eventId ?? null,
    valuationSource: settings["mining.valuationSource"],
    ratePct: 100,
    corpCutPct: 0,
    splitMode: "contribution",
    notes: "",
  };

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={t.mining.module.nav.ops} title={m.titleNew} description={m.description} />
      {events.length > 0 && (
        <Panel title={m.fromEvent.title} subtitle={m.fromEvent.subtitle}>
          <ul className="divide-y divide-surface-contrast/[0.06]">
            {events.map((e) => (
              <li key={e.eventId} className="flex flex-wrap items-center gap-3 py-2">
                <CalendarDays className="size-4 text-ink-3" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-ink">{e.title}</span>
                  <span className="block text-xs text-ink-3">
                    {f.dateTime(e.eventDate)} · {m.fromEvent.duration(e.durationMinutes)} · {e.ownerName}
                  </span>
                </span>
                <span className="flex items-center gap-1 text-xs text-ink-3">
                  <Users className="size-3.5" aria-hidden /> {m.fromEvent.accepted(e.accepted)}
                </span>
                <ButtonLink href={`/mining/ops/new?event=${e.eventId}`} size="sm" variant={e.eventId === eventId ? "primary" : "glass"}>
                  {m.fromEvent.use}
                </ButtonLink>
              </li>
            ))}
          </ul>
        </Panel>
      )}
      {/* Keyed so picking another event resets the uncontrolled fields. */}
      <OpForm key={event?.eventId ?? "blank"} action={saveOp} values={values} fleets={fleetOptions} events={eventOptions} cancelHref="/mining/ops" />
    </div>
  );
}
