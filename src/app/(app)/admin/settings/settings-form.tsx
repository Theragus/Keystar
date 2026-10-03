"use client";

import { Save } from "lucide-react";
import { createContext, useContext, useTransition, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/i18n/client";
import { saveSettings } from "../actions";

const PendingContext = createContext(false);

/**
 * The settings form, submitted by hand rather than through `<form action>`:
 * React resets a form after its action, which would throw away a rejected
 * entry and put every <select> back on the value it was first rendered with.
 */
export function SettingsForm({ className, children }: { className?: string; children: ReactNode }) {
  const { t } = useI18n();
  const ts = t.admin.settings;
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  return (
    <form
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(async () => {
          let result: Awaited<ReturnType<typeof saveSettings>> | null = null;
          try {
            result = await saveSettings(data);
          } catch {
            // Signed out, or a lookup after saving failed; the message covers both.
          }
          if (result?.ok) {
            toast({
              tone: "good",
              title: ts.saved,
              description: result.homeChanged ? ts.savedHomeChanged : undefined,
            });
          } else {
            toast({ tone: "critical", title: ts.saveFailed, description: ts.errors[result?.error ?? "unknown"] });
          }
        });
      }}
    >
      <PendingContext.Provider value={pending}>{children}</PendingContext.Provider>
    </form>
  );
}

/** The header's save button; disabled while a save is running. */
export function SaveSettingsButton() {
  const { t } = useI18n();
  const pending = useContext(PendingContext);
  return (
    <Button type="submit" variant="primary" disabled={pending}>
      <Save className="size-4" aria-hidden /> {t.admin.settings.save}
    </Button>
  );
}
