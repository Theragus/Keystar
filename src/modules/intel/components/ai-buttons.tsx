"use client";

import { RefreshCw, Sparkles } from "lucide-react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/client";

function Submit({ label, icon }: { label: string; icon: "sparkles" | "refresh" }) {
  const { t } = useI18n();
  const { pending } = useFormStatus();
  const Icon = icon === "sparkles" ? Sparkles : RefreshCw;
  return (
    <Button size="sm" variant="ghost" type="submit" disabled={pending}>
      <Icon className={pending ? "size-3.5 animate-pulse" : "size-3.5"} aria-hidden />
      {pending ? t.intel.buttons.writing : label}
    </Button>
  );
}

export function RewriteBriefingButton({ scanId, action }: { scanId: string; action: (formData: FormData) => Promise<void> }) {
  const { t } = useI18n();
  return (
    <form action={action}>
      <input type="hidden" name="scanId" value={scanId} />
      <Submit label={t.intel.buttons.rewriteBriefing} icon="refresh" />
    </form>
  );
}

export function WriteDossierButton({
  scanId,
  characterId,
  action,
  again,
}: {
  scanId: string;
  characterId: number;
  action: (formData: FormData) => Promise<void>;
  again: boolean;
}) {
  const { t } = useI18n();
  return (
    <form action={action}>
      <input type="hidden" name="scanId" value={scanId} />
      <input type="hidden" name="characterId" value={characterId} />
      <Submit label={again ? t.intel.buttons.writeAgain : t.intel.buttons.writeDossier} icon="sparkles" />
    </form>
  );
}
