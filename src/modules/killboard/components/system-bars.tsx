import { SecurityStatus } from "@/components/ui/security";
import { compact } from "@/lib/format";
import { zkillSystem } from "../links";
import type { SystemRow } from "../queries";
import { DeltaChip } from "@/components/ui/deltas";

/** Ranked systems as horizontal bars; each row links to the system on zKillboard. */
export function SystemBars({
  rows,
  color,
  unit,
  upIsGood,
}: {
  rows: SystemRow[];
  color: string;
  unit: "kills" | "losses";
  upIsGood: boolean;
}) {
  if (!rows.length) return <p className="py-6 text-center text-sm text-ink-3">No {unit} in this period.</p>;
  const max = rows[0].count;
  return (
    <ol className="space-y-1">
      {rows.map((r) => (
        <li key={r.systemId}>
          <a
            href={zkillSystem(r.systemId)}
            target="_blank"
            rel="noopener noreferrer"
            className="group -mx-2 grid grid-cols-[minmax(0,7.5rem)_1fr_auto] items-center gap-3 rounded-md px-2 py-1.5 hover:bg-white/5"
            title={`${r.name ?? r.systemId}: ${r.count} ${unit}, ${compact(r.value)} ISK. 7d: ${r.week} (prev ${r.prevWeek})`}
          >
            <span className="flex min-w-0 items-center gap-1.5 text-sm">
              <SecurityStatus value={r.security} />
              <span className="truncate font-medium text-ink group-hover:text-accent">{r.name ?? `#${r.systemId}`}</span>
            </span>
            <span className="h-2.5 overflow-hidden rounded-full bg-white/4">
              <span
                className="block h-full rounded-full"
                style={{ width: `${Math.max(2, (r.count / max) * 100)}%`, background: color }}
              />
            </span>
            <span className="flex items-center gap-2">
              <span className="w-9 text-right text-sm font-semibold tabular-nums">{r.count}</span>
              <span className="w-10 text-right">
                <DeltaChip value={r.week - r.prevWeek} upIsGood={upIsGood} />
              </span>
            </span>
          </a>
        </li>
      ))}
    </ol>
  );
}
