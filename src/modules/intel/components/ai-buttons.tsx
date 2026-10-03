"use client";

import { RefreshCw, Sparkles } from "lucide-react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

function Submit({ label, pendingLabel, icon }: { label: string; pendingLabel: string; icon: "sparkles" | "refresh" }) {
  const { pending } = useFormStatus();
  const Icon = icon === "sparkles" ? Sparkles : RefreshCw;
  return (
    <Button size="sm" variant="ghost" type="submit" disabled={pending}>
      <Icon className={pending ? "size-3.5 animate-pulse" : "size-3.5"} aria-hidden />
      {pending ? pendingLabel : label}
    </Button>
  );
}

export function RewriteBriefingButton({ scanId, action }: { scanId: string; action: (formData: FormData) => Promise<void> }) {
  return (
    <form action={action}>
      <input type="hidden" name="scanId" value={scanId} />
      <Submit label="Rewrite briefing" pendingLabel="Writing…" icon="refresh" />
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
  return (
    <form action={action}>
      <input type="hidden" name="scanId" value={scanId} />
      <input type="hidden" name="characterId" value={characterId} />
      <Submit label={again ? "Write again" : "Write dossier"} pendingLabel="Writing…" icon="sparkles" />
    </form>
  );
}
