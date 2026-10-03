import { getSetting } from "@/core/settings";
import { encountersWithUs, engagementsWithUs, historyTotals } from "./history";
import { lookupDisplayNames, scanEntityIds } from "./names";
import { getScanPilots, type ScanRow } from "./scans";
import { groupSummary } from "./score/summary";
import { loadStandings, standingOf } from "./standings";
import type { PilotProfile, PilotScore } from "./types";

/**
 * Everything a scan shows, loaded once: pilots with standings, profiles and
 * scores, fights with us, the group summary and display names. Used by the
 * scan page and by the briefing writer, so both see the same facts.
 */
export async function loadScanView(scan: ScanRow) {
  const [pilots, standings, home] = await Promise.all([getScanPilots(scan.id), loadStandings(), getSetting("corp.homeCorporationId")]);
  const ids = pilots.map((p) => p.characterId);
  const engagements = home ? await engagementsWithUs(home, await encountersWithUs(home, ids), ids) : [];
  const rows = pilots.map((p) => ({
    pilot: p,
    standing: standingOf(p, standings),
    profile: (p.profile as PilotProfile | null) ?? null,
    score: (p.scoreDetail as PilotScore | null) ?? null,
  }));
  const entityIds = scanEntityIds(
    pilots.map((p) => p.history),
    engagements,
  );
  const names = await lookupDisplayNames({
    typeIds: [
      ...entityIds.typeIds,
      ...rows.flatMap((r) => [
        ...(r.profile?.hulls.slice(0, 5).map((h) => h.shipTypeId) ?? []),
        ...(r.profile?.recent.latest.flatMap((e) => [e.shipTypeId, e.otherShipTypeId]) ?? []),
      ]),
    ],
    systemIds: [
      scan.systemId,
      ...engagements.map((e) => e.systemId),
      ...rows.flatMap((r) => [...(r.profile?.recent.latest.map((e) => e.systemId) ?? []), r.profile?.recent.lastSeen?.systemId]),
    ],
    entityIds: [...entityIds.entityIds, ...pilots.map((p) => p.allianceId)],
    corporationIds: [...entityIds.corporationIds, ...pilots.map((p) => p.corporationId)],
  });
  const summary = groupSummary(
    rows.map((r) => ({
      characterId: r.pilot.characterId,
      corporationId: r.pilot.corporationId,
      allianceId: r.pilot.allianceId,
      standing: r.standing,
      score: r.score,
      profile: r.profile,
    })),
    scan.createdAt,
  );
  return {
    home,
    pilots,
    rows,
    engagements,
    names,
    summary,
    totals: historyTotals(
      pilots.map((p) => p.history),
      engagements,
    ),
    pilotNames: new Map(pilots.map((p) => [p.characterId, p.name])),
    system: scan.systemId ? (names.systems.get(scan.systemId) ?? null) : null,
  };
}

export type ScanView = Awaited<ReturnType<typeof loadScanView>>;
