"use client";

import { TriangleAlert } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Glass } from "@/components/ui/glass";
import { useI18n } from "@/i18n/client";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useI18n();
  return (
    <Glass className="mx-auto mt-10 max-w-xl">
      <EmptyState
        icon={TriangleAlert}
        title={t.common.error.title}
        action={
          <button type="button" onClick={reset} className="glass-chip rounded-full px-4 py-2 text-sm hover:bg-surface-contrast/10">
            {t.common.error.retry}
          </button>
        }
      >
        {error.message || t.common.error.unexpected}
        {error.digest && <div className="mt-2 text-xs text-ink-3">{t.common.error.reference(error.digest)}</div>}
      </EmptyState>
    </Glass>
  );
}
