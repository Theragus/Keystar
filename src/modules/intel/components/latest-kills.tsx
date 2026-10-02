import { TypeIcon } from "@/components/ui/eve-image";
import { compact, relativeTime } from "@/lib/format";
import { KILL_COLOR, LOSS_COLOR } from "@/modules/killboard/colors";
import { zkillKill } from "@/modules/killboard/links";
import type { DisplayNames } from "../names";
import type { LatestEvent, PilotProfile } from "../types";

/** The pilot's newest kills and losses, newest first: what they fly right now and where. */
export function LatestKills({ events, names, limit = 5 }: { events: LatestEvent[]; names: DisplayNames; limit?: number }) {
  if (!events.length) return null;
  return (
    <ol className="flex flex-wrap gap-1.5">
      {events.slice(0, limit).map((e) => {
        const color = e.isLoss ? LOSS_COLOR : KILL_COLOR;
        const other = e.otherShipTypeId ? names.types.get(e.otherShipTypeId)?.name : null;
        const system = names.systems.get(e.systemId)?.name;
        return (
          <li key={e.killmailId}>
            <a
              href={zkillKill(e.killmailId)}
              target="_blank"
              rel="noopener noreferrer"
              className="glass-chip flex items-center gap-2 rounded-lg border-l-[3px] py-1 pr-2.5 pl-1.5 text-xs hover:bg-white/8"
              style={{ borderLeftColor: color }}
              title={`${e.isLoss ? "Lost" : "Killed"} ${other ?? "a ship"}${system ? ` in ${system}` : ""} · ${compact(e.value)} ISK · ${e.attackerCount} attacker${e.attackerCount === 1 ? "" : "s"}`}
            >
              {e.shipTypeId ? <TypeIcon id={e.shipTypeId} size={22} className="rounded" /> : null}
              <span className="min-w-0">
                <span className="block max-w-36 truncate text-ink">
                  <span className="sr-only">{e.isLoss ? "Loss: " : "Kill: "}</span>
                  {e.isLoss ? "Lost" : "Killed"} {other ?? "ship"}
                </span>
                <span className="block text-[0.66rem] text-ink-3">
                  {relativeTime(e.time)} · {system ?? "?"} · {e.solo ? "solo" : `${e.attackerCount} pilots`}
                </span>
              </span>
            </a>
          </li>
        );
      })}
    </ol>
  );
}

/** "Last seen flying a Sabre, 3 h ago in Amamake" — or what zKillboard says they fly recently. */
export function LastSeen({ profile, names }: { profile: PilotProfile; names: DisplayNames }) {
  const seen = profile.recent.lastSeen;
  if (seen) {
    const ship = seen.shipTypeId ? names.types.get(seen.shipTypeId)?.name : null;
    const system = names.systems.get(seen.systemId)?.name;
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-ink-2">
        {seen.shipTypeId && <TypeIcon id={seen.shipTypeId} size={16} className="rounded" />}
        Last seen {seen.isLoss ? "losing" : "flying"} {ship ?? "a ship"}, {relativeTime(seen.time)}
        {system ? ` in ${system}` : ""}
      </span>
    );
  }
  const recent = profile.hulls.slice(0, 3);
  if (!recent.length) return null;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-ink-3">
      Recently flying
      {recent.map((h) => (
        <span key={h.shipTypeId} className="inline-flex items-center gap-1 text-ink-2">
          <TypeIcon id={h.shipTypeId} size={16} className="rounded" />
          {names.types.get(h.shipTypeId)?.name ?? ""}
        </span>
      ))}
    </span>
  );
}
