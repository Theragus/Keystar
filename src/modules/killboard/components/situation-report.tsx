import { ChevronDown, Radio } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Glass } from "@/components/ui/glass";
import { dateTime } from "@/lib/format";
import { rangeLabel } from "../filters";
import { parseMarkup, type Segment } from "../report/markup";
import type { ReadinessLevel, StoredReport } from "../report/types";
import type { ReactNode } from "react";

const READINESS_TONE: Record<ReadinessLevel, "good" | "accent" | "critical" | "neutral"> = {
  surging: "good",
  steady: "accent",
  strained: "critical",
  quiet: "neutral",
};

function Rich({ text }: { text: string }) {
  return (
    <>
      {parseMarkup(text).map((s: Segment, i) => {
        switch (s.kind) {
          case "bold":
            return (
              <strong key={i} className="font-semibold text-ink">
                {s.text}
              </strong>
            );
          case "good":
            return (
              <span key={i} className="font-medium text-good-text">
                {s.text}
              </span>
            );
          case "bad":
            return (
              <span key={i} className="font-medium text-critical-text">
                {s.text}
              </span>
            );
          case "pilot":
            return (
              <span key={i} className="font-medium text-accent">
                {s.text}
              </span>
            );
          default:
            return <span key={i}>{s.text}</span>;
        }
      })}
    </>
  );
}

/** The weekly briefing, collapsible like the original dashboard (open by default). */
export function SituationReportPanel({
  stored,
  canManage,
  claudeConfigured,
  actions,
}: {
  stored: StoredReport | null;
  canManage: boolean;
  claudeConfigured: boolean;
  actions?: ReactNode;
}) {
  const window = stored ? rangeLabel({ from: stored.periodFrom, to: stored.periodTo }) : null;
  return (
    <Glass as="details" open className="group">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
        <Radio className="size-4 text-accent" aria-hidden />
        <span className="eve-label text-[0.7rem] text-accent">Situation report</span>
        {window && <span className="text-xs text-ink-3">{window}</span>}
        {stored && (
          <Badge tone={READINESS_TONE[stored.report.readiness.level]} className="ml-1">
            {stored.report.readiness.label}
          </Badge>
        )}
        <ChevronDown className="ml-auto size-4 text-ink-3 transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="border-t border-white/6 px-5 pt-4 pb-5">
        {stored ? (
          <article className="max-w-4xl space-y-3">
            <h3 className="text-lg font-semibold tracking-tight text-ink">{stored.report.headline}</h3>
            {stored.report.paragraphs.map((p, i) => (
              <p key={i} className="text-sm leading-relaxed text-ink-2">
                <Rich text={p} />
              </p>
            ))}
            <p className="text-sm leading-relaxed text-ink-2">
              <span className="eve-label mr-2 text-[0.64rem] text-ink-3">Readiness</span>
              <Rich text={stored.report.readiness.assessment} />
            </p>
          </article>
        ) : (
          <p className="text-sm text-ink-3">
            The first report is written once a full week of killmails has been imported (shortly after 02:00 EVE time).
          </p>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-ink-3">
          {stored && (
            <span>
              {stored.source === "claude" ? `Written by Claude (${stored.model ?? "unknown model"})` : "Written from the weekly numbers"}
              {" · "}
              {dateTime(stored.createdAt)}
            </span>
          )}
          {canManage && stored?.error && <span className="text-warning">Claude failed: {stored.error}</span>}
          {canManage && !claudeConfigured && (
            <span>Set ANTHROPIC_API_KEY on the server to have Claude write these reports.</span>
          )}
          {actions && <span className="ml-auto">{actions}</span>}
        </div>
      </div>
    </Glass>
  );
}
