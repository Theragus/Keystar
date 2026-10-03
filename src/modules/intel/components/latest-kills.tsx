import { eventTargetHull, newestEvents } from "../evidence";
import { typeIcon } from "@/core/eve/images";
import { TypeIcon } from "@/components/ui/eve-image";
import { getI18n } from "@/i18n/server";
import { KILL_COLOR, LOSS_COLOR } from "@/modules/killboard/colors";
import { zkillKill } from "@/modules/killboard/links";
import type { DisplayNames } from "../names";
import type { LatestEvent, PilotProfile } from "../types";

/** The pilot's newest kills and losses, newest first: historical observations, never current ship assignments. */
export async function LatestKills({ events, names, limit = 5, compact = false }: { events: LatestEvent[]; names: DisplayNames; limit?: number; compact?: boolean }) {
  if (!events.length) return null;
  const { t, f } = await getI18n();
  const l = t.intel.latest;
  return (
    <ol className={compact ? "grid grid-cols-3 gap-1.5" : "flex flex-wrap gap-1.5"}>
      {newestEvents(events).slice(0, limit).map((e) => {
        const color = e.isLoss ? LOSS_COLOR : KILL_COLOR;
        const targetHull = eventTargetHull(e);
        const other = targetHull ? (names.types.get(targetHull)?.name ?? null) : null;
        const system = names.systems.get(e.systemId)?.name ?? null;
        return (
          <li key={e.killmailId}>
            <a
              href={zkillKill(e.killmailId)}
              target="_blank"
              rel="noopener noreferrer"
              className={compact ? "glass-chip relative flex aspect-square min-w-0 items-end overflow-hidden rounded-md border-t-2 bg-cover bg-center text-center text-xs transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-accent" : "glass-chip flex items-center gap-2 rounded-lg border-l-[3px] py-1 pr-2.5 pl-1.5 text-xs hover:bg-surface-contrast/8"}
              style={compact ? { borderTopColor: color, backgroundImage: targetHull ? `url("${typeIcon(targetHull, 64)}")` : undefined } : { borderLeftColor: color }}
              title={`${l.title({ isLoss: e.isLoss, ship: other, system, isk: f.compact(e.value), attackers: e.attackerCount })} · ${f.relativeTime(e.time)}`}
            >
              {!compact && targetHull ? <TypeIcon id={targetHull} size={22} className="rounded" /> : null}
              <span className={compact ? "relative w-full min-w-0 bg-white/40 px-1.5 py-1.5 text-slate-950 backdrop-blur-sm" : "min-w-0"}>
                <span className={compact ? "block truncate font-medium" : "block max-w-36 truncate text-ink"}>
                  <span className="sr-only">{l.srKind(e.isLoss)}</span>
                  {other ?? t.intel.pilot.unknownHull}
                </span>
                {!compact && <span className="block text-3xs text-ink-3">
                  {f.relativeTime(e.time)} · {system ?? "?"} · {e.solo ? l.solo : l.pilots(e.attackerCount)}
                </span>}
              </span>
            </a>
          </li>
        );
      })}
    </ol>
  );
}

/** "Last seen flying a Sabre, 3 h ago in Amamake" — or what zKillboard says they fly recently. */
export async function LastSeen({ profile, names }: { profile: PilotProfile; names: DisplayNames }) {
  const { t, f } = await getI18n();
  const seen = profile.recent.lastSeen;
  if (seen) {
    const ship = seen.shipTypeId ? (names.types.get(seen.shipTypeId)?.name ?? null) : null;
    const system = names.systems.get(seen.systemId)?.name ?? null;
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-ink-2">
        {seen.shipTypeId && <TypeIcon id={seen.shipTypeId} size={16} className="rounded" />}
        {t.intel.latest.lastSeen(seen.isLoss, ship, f.relativeTime(seen.time), system)}
      </span>
    );
  }
  const recent = profile.hulls.slice(0, 3);
  if (!recent.length) return null;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-ink-3">
      {t.intel.latest.recentlyFlying}
      {recent.map((h) => (
        <span key={h.shipTypeId} className="inline-flex items-center gap-1 text-ink-2">
          <TypeIcon id={h.shipTypeId} size={16} className="rounded" />
          {names.types.get(h.shipTypeId)?.name ?? ""}
        </span>
      ))}
    </span>
  );
}
