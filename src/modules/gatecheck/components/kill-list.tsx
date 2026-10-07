"use client";

import { useState, type ReactNode } from "react";
import { useI18n } from "@/i18n/client";

const STEP = 5;

/** Kills at a gate, five at first and five more on each click. */
export function KillList({ items }: { items: ReactNode[] }) {
  const { t } = useI18n();
  const [shown, setShown] = useState(STEP);
  const left = items.length - shown;
  const button =
    "cursor-pointer rounded px-1 text-xs text-ink-3 transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-accent";
  return (
    <ul className="mt-1 divide-y divide-surface-contrast/6">
      {items.slice(0, shown)}
      {(left > 0 || shown > STEP) && (
        <li className="flex flex-wrap gap-x-3 py-1">
          {left > 0 && (
            <button type="button" className={button} onClick={() => setShown(shown + STEP)}>
              {t.gatecheck.kill.showMore(Math.min(STEP, left), left)}
            </button>
          )}
          {shown > STEP && (
            <button type="button" className={button} onClick={() => setShown(STEP)}>
              {t.gatecheck.kill.showFewer}
            </button>
          )}
        </li>
      )}
    </ul>
  );
}
