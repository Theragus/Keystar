import Link from "next/link";
import { Portrait } from "@/components/ui/eve-image";
import { relativeTime } from "@/lib/format";
import type { DisplayNames } from "../names";
import type { Sighting } from "../scans";
import type { PilotScore, Standing } from "../types";
import { ScoreBadge } from "./score";
import { StandingBadge } from "./standing-badge";

/** Pilots the corporation saw in scans recently, newest sighting first; friendlies are left out. */
export function HostilesFeed({
  sightings,
  names,
  hidden,
}: {
  sightings: (Sighting & { standing: Standing })[];
  names: DisplayNames;
  hidden: number;
}) {
  if (!sightings.length) return <p className="text-sm text-ink-3">Nobody hostile scanned in the last week.</p>;
  return (
    <div>
      <ul className="divide-y divide-white/6">
        {sightings.map((s) => {
          const system = s.systemId ? names.systems.get(s.systemId)?.name : null;
          const score: PilotScore | null =
            s.tier && s.tier !== "unknown" && s.score !== null
              ? { composite: s.score, tier: s.tier as PilotScore["tier"], recencyGate: 1, dimensions: [], tags: [], excluded: null, quick: false }
              : null;
          return (
            <li key={s.characterId}>
              <Link href={`/intel/${s.scanId}/pilot/${s.characterId}`} className="flex items-center gap-3 py-2 hover:text-accent">
                <Portrait id={s.characterId} size={28} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5 text-sm">
                    <span className="truncate font-medium">{s.name}</span>
                    <StandingBadge standing={s.standing} />
                  </div>
                  <div className="truncate text-xs text-ink-3">
                    Seen {relativeTime(s.seenAt)}
                    {system ? ` in ${system}` : ""}
                    {s.seenBy ? ` by ${s.seenBy}` : ""}
                    {s.times > 1 ? ` · ${s.times} scans` : ""}
                    {s.fought ? " · fought us" : ""}
                  </div>
                </div>
                <ScoreBadge score={score} />
              </Link>
            </li>
          );
        })}
      </ul>
      {hidden > 0 && <p className="mt-2 text-xs text-ink-3">{hidden} more low-threat pilots not shown.</p>}
    </div>
  );
}
