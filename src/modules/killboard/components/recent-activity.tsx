import { TypeIcon } from "@/components/ui/eve-image";
import { compact, dateTime } from "@/lib/format";
import { KILL_COLOR, LOSS_COLOR } from "../colors";
import { zkillKill } from "../links";
import type { ActivityRow } from "../queries";

/** Latest kills and losses; each card opens the killmail on zKillboard. */
export function RecentActivity({ rows }: { rows: ActivityRow[] }) {
  if (!rows.length) return <p className="py-6 text-center text-sm text-ink-3">No kills or losses in this period.</p>;
  return (
    <ul className="grid gap-2 lg:grid-cols-2">
      {rows.map((r) => {
        const kill = r.kind === "kill";
        const color = kill ? KILL_COLOR : LOSS_COLOR;
        return (
          <li key={r.killmailId}>
            <a
              href={zkillKill(r.killmailId)}
              target="_blank"
              rel="noopener noreferrer"
              className="glass-inset flex items-center gap-3 rounded-lg border-l-[3px] py-2 pr-4 pl-3 hover:bg-white/5"
              style={{ borderLeftColor: color }}
            >
              <TypeIcon id={r.shipTypeId} size={40} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-ink">
                  {r.shipName ?? `Type ${r.shipTypeId}`}
                  {r.victimName && <span className="font-normal text-ink-2"> · {r.victimName}</span>}
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-ink-3">
                  <span
                    className="rounded px-1.5 py-px text-[0.62rem] font-semibold tracking-wider"
                    style={{ color, background: `${color}22`, boxShadow: `inset 0 0 0 1px ${color}55` }}
                  >
                    {kill ? "KILL" : "LOSS"}
                  </span>
                  {r.solo && <span className="text-ink-2">solo</span>}
                  <span className="truncate">{r.systemName ?? "Unknown system"}</span>
                  <span className="whitespace-nowrap tabular-nums">{dateTime(r.time).replace(" ET", "")}</span>
                </div>
              </div>
              <div className="text-sm font-semibold tabular-nums" style={{ color }}>
                {compact(r.value)}
              </div>
            </a>
          </li>
        );
      })}
    </ul>
  );
}
