"use client";

import { Loader2, MonitorX, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Glass } from "@/components/ui/glass";
import { useI18n } from "@/i18n/client";
import { loadFittingRuntime, type FittingRuntime } from "../engine/engine";
import { Editor } from "./editor";
import type { EsiFittingSummary, SkillSourceCharacter } from "../queries";

export interface FittingEditorProps {
  characters: SkillSourceCharacter[];
  esiFittings: EsiFittingSummary[];
}

/**
 * The fitting tool's shell: loads the engine and static data once, then hands over to the editor. Desktop only;
 * narrow screens get a notice instead (the three-column editor can't be folded onto a phone sensibly).
 */
export function FittingEditor(props: FittingEditorProps) {
  const { t } = useI18n();
  const s = t.fitting;
  const [runtime, setRuntime] = useState<FittingRuntime | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    loadFittingRuntime().then(
      (rt) => !cancelled && setRuntime(rt),
      () => !cancelled && setFailed(true),
    );
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  return (
    <>
      <Glass className="md:hidden">
        <EmptyState icon={MonitorX} title={s.page.desktopOnly.title}>
          {s.page.desktopOnly.body}
        </EmptyState>
      </Glass>
      <div className="max-md:hidden">
        {runtime ? (
          <Editor runtime={runtime} characters={props.characters} esiFittings={props.esiFittings} />
        ) : failed ? (
          <Glass>
            <EmptyState
              icon={TriangleAlert}
              title={s.page.loadFailed}
              action={
                <Button
                  variant="primary"
                  onClick={() => {
                    setFailed(false);
                    setAttempt((n) => n + 1);
                  }}
                >
                  {s.page.retry}
                </Button>
              }
            />
          </Glass>
        ) : (
          <Glass>
            <EmptyState icon={Loader2} title={s.page.loading}>
              {s.page.loadingHint}
            </EmptyState>
          </Glass>
        )}
      </div>
    </>
  );
}
