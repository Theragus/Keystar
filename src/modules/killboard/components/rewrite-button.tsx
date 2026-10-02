"use client";

import { RefreshCw } from "lucide-react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

export function RewriteReportButton() {
  const { pending } = useFormStatus();
  return (
    <Button size="sm" variant="ghost" type="submit" disabled={pending}>
      <RefreshCw className={pending ? "size-3.5 animate-spin" : "size-3.5"} aria-hidden />
      {pending ? "Writing…" : "Rewrite report"}
    </Button>
  );
}
