import { ChevronDown, Radio } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Glass } from "@/components/ui/glass";
import { getI18n } from "@/i18n/server";
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
export async function SituationReportPanel({
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
  const { t, f } = await getI18n();
  const window = stored ? rangeLabel({ from: stored.periodFrom, to: stored.periodTo }, f.locale) : null;
  return (
    <Glass as="details" open className="group">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
        <Radio className="size-4 text-accent" aria-hidden />
        <span className="eve-label text-xs text-accent">{t.killboard.report.title}</span>
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
              <span className="eve-label mr-2 text-2xs text-ink-3">{t.killboard.report.readiness}</span>
              <Rich text={stored.report.readiness.assessment} />
            </p>
          </article>
        ) : (
          <p className="text-sm text-ink-3">{t.killboard.report.pending}</p>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-ink-3">
          {stored && (
            <span>
              {stored.source === "claude" ? t.killboard.report.byClaude(stored.model) : t.killboard.report.byTemplate}
              {" · "}
              {f.dateTime(stored.createdAt)}
            </span>
          )}
          {canManage && stored?.error && <span className="text-warning">{t.killboard.report.claudeFailed(stored.error)}</span>}
          {canManage && !claudeConfigured && <span>{t.killboard.report.claudeHint}</span>}
          {actions && <span className="ml-auto">{actions}</span>}
        </div>
      </div>
    </Glass>
  );
}
