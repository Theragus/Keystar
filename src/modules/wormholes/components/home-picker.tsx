"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setHomeAction } from "@/app/(app)/wormholes/actions";
import { useI18n } from "@/i18n/client";
import { SystemSearch } from "./system-search";

/** First run: a director picks the system the chain starts from. */
export function HomePicker() {
  const { t } = useI18n();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="mx-auto w-full max-w-sm space-y-2">
      <SystemSearch
        label={t.wormholes.page.chooseHome}
        placeholder={t.wormholes.page.chooseHome}
        autoFocus
        onSelect={(system) =>
          startTransition(async () => {
            const result = await setHomeAction(system.id);
            if (result.ok) router.refresh();
            else setError(result.error);
          })
        }
      />
      {pending && <p className="text-xs text-ink-3">{t.wormholes.page.loading}</p>}
      {error && <p className="text-xs text-critical-text">{error}</p>}
    </div>
  );
}
