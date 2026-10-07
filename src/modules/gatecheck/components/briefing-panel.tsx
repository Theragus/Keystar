"use client";

import { Sparkles } from "lucide-react";
import { useState, useTransition } from "react";
import type { BriefingState } from "@/app/(app)/gatecheck/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/glass";
import { useI18n } from "@/i18n/client";
import { RichText } from "@/modules/killboard/components/rich-text";

const LEVEL_TONE = {
  minimal: "good",
  low: "good",
  elevated: "gold",
  high: "warning",
  critical: "critical",
} as const;

/** Asks Claude for a route briefing on request (it spends the shared API key, so never automatically). */
export function BriefingPanel({
  params,
  action,
}: {
  params: Record<string, string>;
  action: (params: Record<string, string>) => Promise<BriefingState>;
}) {
  const { t, f } = useI18n();
  const s = t.gatecheck.briefing;
  const [state, setState] = useState<BriefingState | null>(null);
  const [pending, start] = useTransition();
  const ask = () =>
    start(async () => {
      try {
        setState(await action(params));
      } catch {
        setState({ ok: false, reason: "failed" });
      }
    });
  return (
    <Panel
      title={s.title}
      actions={
        <Button size="sm" onClick={ask} disabled={pending}>
          <Sparkles className="size-3.5" aria-hidden />
          {pending ? s.writing : state?.ok ? s.again : s.ask}
        </Button>
      }
    >
      {!state && !pending && <p className="text-xs text-ink-3">{s.intro}</p>}
      {pending && (
        <p role="status" className="text-xs text-ink-3">
          {s.writing}
        </p>
      )}
      {state && !pending && !state.ok && <p className="text-sm text-warning">{s[state.reason]}</p>}
      {state?.ok && !pending && (
        <div className="space-y-3 text-sm text-ink-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={LEVEL_TONE[state.briefing.threatLevel]}>{s.level[state.briefing.threatLevel]}</Badge>
            <h3 className="font-semibold text-ink">{state.briefing.headline}</h3>
          </div>
          <p>
            <RichText text={state.briefing.summary} />
          </p>
          {state.briefing.hotspots.length > 0 && (
            <ul className="space-y-1">
              {state.briefing.hotspots.map((h) => (
                <li key={h.system}>
                  <strong className="text-ink">{h.system}</strong> — <RichText text={h.note} />
                </li>
              ))}
            </ul>
          )}
          <p>
            <span className="eve-label mr-2 text-2xs text-ink-3">{s.advice}</span>
            <RichText text={state.briefing.advice} />
          </p>
          <p className="text-2xs text-ink-3">{s.by(state.model ?? "Claude", f.relativeTime(state.createdAt))}</p>
        </div>
      )}
    </Panel>
  );
}
