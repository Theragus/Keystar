import { and, eq, gt, notInArray, sql } from "drizzle-orm";
import type { Db } from "@/core/db";
import { EsiError, type EsiClient } from "@/core/esi/client";
import { CALENDAR_JOB_KEY, CALENDAR_SCOPE } from "./module";
import { calendarEventAttendees, calendarEvents, type CalendarOwnerType, type CalendarResponse } from "./schema";

/**
 * EVE calendar import for mining ops (GET /characters/{id}/calendar,
 * /calendar/{event_id} and /calendar/{event_id}/attendees). Only events owned
 * by a corporation or an alliance are kept; personal and CCP events are read
 * to learn their owner and then dropped. ESI lists up to 50 events from now
 * on, so events that already started are refreshed by id for a while
 * (attendance is often answered late).
 */

interface EventSummary {
  event_id: number;
  event_date: string;
  title: string;
}

interface EventDetail {
  event_id: number;
  date: string;
  duration: number;
  importance: number;
  owner_id: number;
  owner_name: string;
  owner_type: "eve_server" | "corporation" | "faction" | "character" | "alliance";
  text: string;
  title: string;
}

interface Attendee {
  character_id: number;
  event_response: CalendarResponse;
}

/** Started events keep being refreshed by id this long. */
export const RECENT_EVENT_MS = 2 * 86400_000;

const RESPONSES: CalendarResponse[] = ["accepted", "declined", "tentative", "not_responded"];

export function isSharedEvent(detail: Pick<EventDetail, "owner_type">): detail is { owner_type: CalendarOwnerType } {
  return detail.owner_type === "corporation" || detail.owner_type === "alliance";
}

export interface CalendarSyncResult {
  events: number;
  attendees: number;
  expiresAt: Date | null;
}

export async function syncCalendar(db: Db, esi: EsiClient, characterId: number, now = new Date()): Promise<CalendarSyncResult> {
  const list = await esi.get<EventSummary[]>(`/characters/${characterId}/calendar`, { characterId });
  const upcoming = (list.data ?? []).map((e) => e.event_id);
  const recent = await db
    .select({ eventId: calendarEvents.eventId })
    .from(calendarEvents)
    .where(and(eq(calendarEvents.seenByCharacterId, characterId), gt(calendarEvents.eventDate, new Date(now.getTime() - RECENT_EVENT_MS))));
  const eventIds = [...new Set([...upcoming, ...recent.map((r) => r.eventId)])];

  let events = 0;
  let attendees = 0;
  for (const eventId of eventIds) {
    let detail: EventDetail;
    try {
      detail = (await esi.get<EventDetail>(`/characters/${characterId}/calendar/${eventId}`, { characterId })).data;
    } catch (err) {
      // Deleted in game, or the character lost access (left the corporation).
      if (err instanceof EsiError && (err.status === 404 || err.status === 403)) continue;
      throw err;
    }
    if (!isSharedEvent(detail)) continue;
    const row = {
      eventId: detail.event_id,
      ownerType: detail.owner_type,
      ownerId: detail.owner_id,
      ownerName: detail.owner_name,
      title: detail.title,
      text: detail.text ?? "",
      eventDate: new Date(detail.date),
      durationMinutes: Math.max(0, Math.round(detail.duration ?? 0)),
      importance: detail.importance ?? 0,
      seenByCharacterId: characterId,
      updatedAt: now,
    };
    await db.insert(calendarEvents).values(row).onConflictDoUpdate({ target: calendarEvents.eventId, set: row });
    events++;

    let answered: Attendee[] = [];
    try {
      answered = (await esi.get<Attendee[]>(`/characters/${characterId}/calendar/${eventId}/attendees`, { characterId })).data ?? [];
    } catch (err) {
      if (err instanceof EsiError && (err.status === 404 || err.status === 403)) continue;
      throw err;
    }
    const rows = answered
      .filter((a) => RESPONSES.includes(a.event_response))
      .map((a) => ({ eventId, characterId: a.character_id, response: a.event_response, updatedAt: now }));
    await db.transaction(async (tx) => {
      const keep = rows.map((r) => r.characterId);
      await tx
        .delete(calendarEventAttendees)
        .where(
          keep.length
            ? and(eq(calendarEventAttendees.eventId, eventId), notInArray(calendarEventAttendees.characterId, keep))
            : eq(calendarEventAttendees.eventId, eventId),
        );
      if (rows.length)
        await tx
          .insert(calendarEventAttendees)
          .values(rows)
          .onConflictDoUpdate({
            target: [calendarEventAttendees.eventId, calendarEventAttendees.characterId],
            set: { response: sql`excluded.response`, updatedAt: sql`excluded.updated_at` },
          });
    });
    attendees += rows.length;
  }
  return { events, attendees, expiresAt: list.expiresAt };
}

export interface CalendarAccess {
  characterId: number;
  name: string;
  granted: boolean;
  /** Switched off in Keystar while the token still holds the scope. */
  switchedOff: boolean;
  grantedScopes: string[];
  tokenStatus: "active" | "invalid" | null;
  lastSuccessAt: Date | null;
  lastStatus: string | null;
  lastError: string | null;
  events: number;
}

/** The account's characters with calendar access and import status. */
export async function getCalendarAccess(db: Db, userId: string): Promise<CalendarAccess[]> {
  const rows = await db.execute<Record<string, unknown>>(sql`
    SELECT c.character_id, c.name, t.scopes, t.disabled_scopes, t.status AS token_status,
           j.last_success_at, j.last_status, j.last_error,
           (SELECT COUNT(*)::int FROM calendar_events e WHERE e.seen_by_character_id = c.character_id) AS events
    FROM characters c
    JOIN users u ON u.id = c.user_id
    LEFT JOIN esi_tokens t ON t.character_id = c.character_id
    LEFT JOIN sync_jobs j ON j.job_key = ${CALENDAR_JOB_KEY} AND j.owner_type = 'character' AND j.owner_id = c.character_id
    WHERE c.user_id = ${userId}::uuid
    ORDER BY c.character_id IS NOT DISTINCT FROM u.main_character_id DESC, c.name`);
  return rows.map((r) => {
    const scopes = Array.isArray(r.scopes) ? (r.scopes as string[]) : [];
    return {
      characterId: Number(r.character_id),
      name: String(r.name),
      granted: scopes.includes(CALENDAR_SCOPE),
      switchedOff:
        r.token_status === "active" && Array.isArray(r.disabled_scopes) && (r.disabled_scopes as string[]).includes(CALENDAR_SCOPE),
      grantedScopes: scopes,
      tokenStatus: r.token_status === "active" || r.token_status === "invalid" ? r.token_status : null,
      lastSuccessAt: r.last_success_at ? new Date(String(r.last_success_at)) : null,
      lastStatus: r.last_status === null || r.last_status === undefined ? null : String(r.last_status),
      lastError: r.last_error === null || r.last_error === undefined ? null : String(r.last_error),
      events: Number(r.events ?? 0),
    };
  });
}
