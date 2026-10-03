import { Bot, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Portrait, TypeIcon } from "@/components/ui/eve-image";
import { Panel } from "@/components/ui/glass";
import { relativeTime } from "@/lib/format";
import { RichText } from "@/modules/killboard/components/rich-text";
import type { DscanRead, StoredNote } from "../ai/types";
import type { DscanMatchRow } from "../dscan";

const CONFIDENCE_TONE = { likely: "accent", possible: "neutral", guess: "neutral" } as const;

/** Ships on the d-scan and the pilots from this scan who probably fly them. */
export function DscanPanel({
  rows,
  read,
  pilotNames,
  form,
  actions,
}: {
  rows: DscanMatchRow[] | null;
  read: StoredNote<DscanRead> | null;
  pilotNames: Map<number, string>;
  form: React.ReactNode;
  actions?: React.ReactNode;
}) {
  const ships = rows?.reduce((n, r) => n + r.count, 0) ?? 0;
  return (
    <Panel
      title="D-scan"
      subtitle={rows ? `${ships} ship${ships === 1 ? "" : "s"} on scan, matched to pilots by the hulls they flew recently.` : "Paste a d-scan to see who is probably flying what."}
      actions={actions}
    >
      {rows && rows.length > 0 && (
        <ul className="mb-4 divide-y divide-white/6">
          {rows.map((r) => (
            <li key={r.typeId} className="flex flex-wrap items-center gap-3 py-2">
              <TypeIcon id={r.typeId} size={28} className="rounded" />
              <div className="w-44 min-w-0">
                <div className="truncate text-sm font-medium text-ink">
                  {r.count > 1 && <span className="tabular-nums">{r.count}× </span>}
                  {r.name}
                </div>
                <div className="text-xs text-ink-3">{r.classLabel}</div>
              </div>
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                {r.assigned.map((a) => (
                  <span key={a.characterId} className="glass-chip inline-flex items-center gap-1.5 rounded-full py-0.5 pr-2 pl-0.5 text-xs">
                    <Portrait id={a.characterId} size={20} />
                    {pilotNames.get(a.characterId) ?? a.characterId}
                    <Badge tone={CONFIDENCE_TONE[a.confidence]}>{a.confidence}</Badge>
                  </span>
                ))}
                {r.assigned.length < r.count && (
                  <span className="text-xs text-ink-3">
                    {r.assigned.length ? `+${r.count - r.assigned.length} unknown` : "Nobody in this list flew it recently"}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {rows && rows.length === 0 && <p className="mb-4 text-sm text-ink-3">No ships on this d-scan.</p>}
      {read && (
        <div className="glass-inset mb-4 rounded-lg px-4 py-3 text-sm text-ink-2">
          <p>
            <RichText text={read.content.assessment} />
          </p>
          {read.content.assignments.some((a) => a.characterId) && (
            <ul className="mt-2 space-y-1 text-xs">
              {read.content.assignments
                .filter((a) => a.characterId)
                .map((a) => (
                  <li key={`${a.typeId}-${a.characterId}`}>
                    <span className="font-medium text-ink">{pilotNames.get(a.characterId!) ?? a.characterId}</span>{" "}
                    <span className="text-ink-3">
                      ({a.confidence}): {a.reason}
                    </span>
                  </li>
                ))}
            </ul>
          )}
          {read.content.notes && <p className="mt-2 text-xs text-ink-3">{read.content.notes}</p>}
          <p className="mt-2 flex items-center gap-1.5 text-[0.7rem] text-ink-3">
            {read.source === "claude" ? <Bot className="size-3.5" aria-hidden /> : <FileText className="size-3.5" aria-hidden />}
            {read.source === "claude" ? `Read by Claude (${read.model})` : "Written from a template"} {relativeTime(read.createdAt)}
            {read.error ? ` · Claude unavailable: ${read.error}` : ""}
          </p>
        </div>
      )}
      {form}
    </Panel>
  );
}
