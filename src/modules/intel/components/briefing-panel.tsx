import { Bot, FileText } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Portrait } from "@/components/ui/eve-image";
import { Panel } from "@/components/ui/glass";
import { getI18n } from "@/i18n/server";
import { RichText } from "@/modules/killboard/components/rich-text";
import { readBriefing, readDossier } from "../ai/template";
import type { StoredNote, ThreatLevel } from "../ai/types";
import { noteErrorText } from "../text";

const LEVEL_TONE: Record<ThreatLevel, "neutral" | "gold" | "warning" | "critical"> = {
  minimal: "neutral",
  low: "neutral",
  elevated: "gold",
  high: "warning",
  critical: "critical",
};

/** Who wrote a note and when, and why Claude did not if it was meant to. */
export async function NoteByline({ note, verb = "wrote" }: { note: StoredNote<unknown>; verb?: "wrote" | "read" }) {
  const { t, f } = await getI18n();
  const n = t.intel.notes;
  const by = note.source === "claude" ? (verb === "read" ? n.readByClaude(note.model) : n.byClaude(note.model)) : n.byTemplate;
  return (
    <p className="mt-3 flex items-center gap-1.5 text-2xs text-ink-3">
      {note.source === "claude" ? <Bot className="size-3.5" aria-hidden /> : <FileText className="size-3.5" aria-hidden />}
      {by} {f.relativeTime(note.createdAt)}
      {note.error ? ` · ${n.unavailable(noteErrorText(t, note.error))}` : ""}
    </p>
  );
}

/** The scan's briefing: threat level, what happened recently, who matters, what to do. */
export async function BriefingPanel({
  note: stored,
  pending,
  actions,
  scanId,
  pilotNames,
  claudeHint,
}: {
  note: StoredNote<unknown> | null;
  pending: boolean;
  actions?: React.ReactNode;
  scanId: string;
  pilotNames: Map<number, string>;
  claudeHint: string | null;
}) {
  const { t } = await getI18n();
  const n = t.intel.notes;
  if (!stored) {
    return (
      <Panel title={n.briefingTitle} actions={actions}>
        <p className="text-sm text-ink-3">{pending ? n.briefingPending : n.noBriefing}</p>
        {claudeHint && <p className="mt-2 text-xs text-ink-3">{claudeHint}</p>}
      </Panel>
    );
  }
  const note = readBriefing(stored, t);
  const b = note.content;
  return (
    <Panel title={n.briefingTitle} actions={actions}>
      <div className="flex flex-wrap items-center gap-3">
        <Badge tone={LEVEL_TONE[b.threatLevel]}>{t.intel.threatLevels[b.threatLevel]}</Badge>
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
      <NoteByline note={note} />
    </Panel>
  );
}

export async function DossierPanel({ note: stored, actions, claudeHint }: { note: StoredNote<unknown> | null; actions?: React.ReactNode; claudeHint: string | null }) {
  const { t } = await getI18n();
  const n = t.intel.notes;
  const note = stored ? readDossier(stored, t) : null;
  return (
    <Panel title={n.dossierTitle} subtitle={note ? n.confidence(t.intel.confidence[note.content.confidence]) : undefined} actions={actions}>
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
          <NoteByline note={note} />
        </div>
      ) : (
        <p className="text-sm text-ink-3">{claudeHint ?? n.dossierHint}</p>
      )}
    </Panel>
  );
}
