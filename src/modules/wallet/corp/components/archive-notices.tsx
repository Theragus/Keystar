import { History, TriangleAlert } from "lucide-react";
import { Glass } from "@/components/ui/glass";
import { getI18n } from "@/i18n/server";
import type { SyncStateRow } from "../queries";

const day = (iso: string | Date) => (typeof iso === "string" ? iso : iso.toISOString()).slice(0, 10);

/** Where the archive starts, when it was last imported and any holes ESI could no longer fill. */
export async function ArchiveNotices({
  syncState,
  divisionOptions,
}: {
  syncState: SyncStateRow[];
  divisionOptions: { division: number; name: string }[];
}) {
  const { t, f } = await getI18n();
  const w = t.wallet.corp;
  const journal = syncState.filter((s) => s.stream === "journal");
  if (!journal.length) return null;
  const starts = journal.map((s) => s.historyStartsAt).filter((d): d is Date => d !== null);
  const since = starts.length ? new Date(Math.min(...starts.map((d) => d.getTime()))) : null;
  const synced = journal.map((s) => s.lastSyncedAt).filter((d): d is Date => d !== null);
  const lastSync = synced.length ? new Date(Math.max(...synced.map((d) => d.getTime()))) : null;
  const names = new Map(divisionOptions.map((d) => [d.division, d.name]));
  const gaps = syncState
    .flatMap((s) => s.gaps.map((g) => ({ ...g, division: s.division })))
    // The journal and transactions of a division usually lose the same stretch: list it once.
    .filter((g, i, all) => all.findIndex((o) => o.division === g.division && day(o.from) === day(g.from) && day(o.to) === day(g.to)) === i)
    .sort((a, b) => a.from.localeCompare(b.from));

  return (
    <>
      {gaps.length > 0 && (
        <Glass className="flex items-start gap-4 border border-warning/30 px-5 py-4">
          <TriangleAlert className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
          <div className="min-w-0 flex-1 text-sm text-ink-2">
            <p className="font-semibold text-ink">{w.gaps.title}</p>
            <p className="mt-0.5 text-xs">{w.gaps.body}</p>
            <ul className="mt-1.5 space-y-0.5 text-xs tabular-nums">
              {gaps.map((g) => (
                <li key={`${g.division}-${g.from}-${g.to}`}>
                  {w.gaps.range(names.get(g.division) ?? String(g.division), f.dateTime(g.from), f.dateTime(g.to))}
                </li>
              ))}
            </ul>
          </div>
        </Glass>
      )}
      {since && (
        <p className="flex items-center gap-1.5 text-xs text-ink-3">
          <History className="size-3.5 shrink-0" aria-hidden />
          <span>
            {w.historySince(day(since))}
            {lastSync && ` · ${w.lastSync(f.relativeTime(lastSync))}`}
          </span>
        </p>
      )}
    </>
  );
}
