import { Bot, FileText } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Portrait } from "@/components/ui/eve-image";
import { Panel } from "@/components/ui/glass";
import { relativeTime } from "@/lib/format";
import { RichText } from "@/modules/killboard/components/rich-text";
import type { Briefing, Dossier, StoredNote, ThreatLevel } from "../ai/types";

const LEVEL: Record<ThreatLevel, { tone: "neutral" | "gold" | "warning" | "critical"; label: string }> = {
  minimal: { tone: "neutral", label: "Minimal threat" },
  low: { tone: "neutral", label: "Low threat" },
  elevated: { tone: "gold", label: "Elevated threat" },
  high: { tone: "warning", label: "High threat" },
  critical: { tone: "critical", label: "Critical threat" },
};

function Byline({ note }: { note: StoredNote<unknown> }) {
  return (
    <p className="mt-3 flex items-center gap-1.5 text-[0.7rem] text-ink-3">
      {note.source === "claude" ? <Bot className="size-3.5" aria-hidden /> : <FileText className="size-3.5" aria-hidden />}
      {note.source === "claude" ? `Written by Claude (${note.model})` : "Written from a template"} {relativeTime(note.createdAt)}
      {note.error ? ` · Claude unavailable: ${note.error}` : ""}
    </p>
  );
}

/** The scan's briefing: threat level, what happened recently, who matters, what to do. */
export function BriefingPanel({
  note,
  pending,
  actions,
  scanId,
  pilotNames,
  claudeHint,
}: {
  note: StoredNote<Briefing> | null;
  pending: boolean;
  actions?: React.ReactNode;
  scanId: string;
  pilotNames: Map<number, string>;
  claudeHint: string | null;
}) {
  if (!note) {
    return (
      <Panel title="Briefing" actions={actions}>
        <p className="text-sm text-ink-3">
          {pending ? "The briefing is written once the most dangerous pilots have their recent kills loaded." : "No briefing for this scan."}
        </p>
        {claudeHint && <p className="mt-2 text-xs text-ink-3">{claudeHint}</p>}
      </Panel>
    );
  }
  const b = note.content;
  return (
    <Panel title="Briefing" actions={actions}>
      <div className="flex flex-wrap items-center gap-3">
        <Badge tone={LEVEL[b.threatLevel].tone}>{LEVEL[b.threatLevel].label}</Badge>
        <h2 className="text-lg font-semibold text-ink">{b.headline}</h2>
      </div>
      <div className="mt-3 max-w-4xl space-y-2.5 text-sm leading-relaxed text-ink-2">
        <p>
          <RichText text={b.recent} />
        </p>
        {b.paragraphs.map((p, i) => (
          <p key={i}>
            <RichText text={p} />
          </p>
        ))}
      </div>
      {b.keyPilots.length > 0 && (
        <ul className="mt-3 grid gap-1.5 md:grid-cols-2">
          {b.keyPilots.map((k) => (
            <li key={k.characterId}>
              <Link href={`/intel/${scanId}/pilot/${k.characterId}`} className="flex items-start gap-2 text-sm hover:text-accent">
                <Portrait id={k.characterId} size={22} />
                <span>
                  <span className="font-medium text-ink">{pilotNames.get(k.characterId) ?? k.characterId}</span>{" "}
                  <span className="text-ink-3">
                    <RichText text={k.note} />
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-sm font-medium text-ink">
        <RichText text={b.advice} />
      </p>
      <Byline note={note} />
    </Panel>
  );
}

export function DossierPanel({ note, actions, claudeHint }: { note: StoredNote<Dossier> | null; actions?: React.ReactNode; claudeHint: string | null }) {
  return (
    <Panel title="Dossier" subtitle={note ? `Confidence: ${note.content.confidence}` : undefined} actions={actions}>
      {note ? (
        <div className="space-y-2.5 text-sm leading-relaxed text-ink-2">
          <p className="text-ink">
            <RichText text={note.content.summary} />
          </p>
          <p>
            <RichText text={note.content.recentActivity} />
          </p>
          {note.content.playstyle && (
            <p>
              <RichText text={note.content.playstyle} />
            </p>
          )}
          {note.content.watchFor.length > 0 && (
            <ul className="list-disc space-y-0.5 pl-5">
              {note.content.watchFor.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}
          {note.content.historyWithUs && (
            <p>
              <RichText text={note.content.historyWithUs} />
            </p>
          )}
          <Byline note={note} />
        </div>
      ) : (
        <p className="text-sm text-ink-3">{claudeHint ?? "A short written profile of this pilot, from the facts on this page."}</p>
      )}
    </Panel>
  );
}
