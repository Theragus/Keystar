"use client";

import { RefreshCw } from "lucide-react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/client";

export function RewriteReportButton() {
  const { pending } = useFormStatus();
  const { t } = useI18n();
  return (
    <Button size="sm" variant="ghost" type="submit" disabled={pending}>
      <RefreshCw className={pending ? "size-3.5 animate-spin" : "size-3.5"} aria-hidden />
      {pending ? t.killboard.report.rewriting : t.killboard.report.rewrite}
    </Button>
  );
}
