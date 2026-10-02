import { TypeIcon } from "@/components/ui/eve-image";
import { compact, dateTime } from "@/lib/format";
import { KILL_COLOR, LOSS_COLOR } from "../colors";
import { zkillKill } from "../links";
import type { ActivityRow } from "../queries";

/**
 * Latest kills and losses, newest first, in a single column; each row opens the
 * killmail on zKillboard. The colour sits on the marker and edge only; text
 * stays in text colours.
 */
export function RecentActivity({ rows }: { rows: ActivityRow[] }) {
  if (!rows.length) return <p className="py-6 text-center text-sm text-ink-3">No kills or losses in this period.</p>;
  return (
    <ol className="space-y-1.5">
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
              <TypeIcon id={r.shipTypeId} size={36} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">
                  <span className="font-medium text-ink">{r.shipName ?? `Type ${r.shipTypeId}`}</span>
                  {r.victimName && <span className="text-ink-2"> · {r.victimName}</span>}
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-ink-3">
                  <span className="inline-flex items-center gap-1.5 font-medium text-ink-2">
                    <span className="size-2 rounded-full" style={{ background: color }} aria-hidden />
                    {kill ? "Kill" : "Loss"}
                  </span>
                  {r.solo && <span>solo</span>}
                  <span className="truncate">{r.systemName ?? "Unknown system"}</span>
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-semibold text-ink tabular-nums">{compact(r.value)}</div>
                <div className="text-2xs whitespace-nowrap text-ink-3 tabular-nums">{dateTime(r.time).replace(" ET", "")}</div>
              </div>
            </a>
          </li>
        );
      })}
    </ol>
  );
}
