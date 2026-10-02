"use client";

import { TriangleAlert } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Glass } from "@/components/ui/glass";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Glass className="mx-auto mt-10 max-w-xl">
      <EmptyState
        icon={TriangleAlert}
        title="Something went wrong"
        action={
          <button type="button" onClick={reset} className="glass-chip rounded-full px-4 py-2 text-sm hover:bg-white/10">
            Try again
          </button>
        }
      >
        {error.message || "An unexpected error occurred."}
        {error.digest && <div className="mt-2 text-xs text-ink-3">Reference: {error.digest}</div>}
      </EmptyState>
    </Glass>
  );
}
