import { Badge } from "@/components/ui/badge";
import type { OpStatus } from "../attribution";

const TONES = { planned: "neutral", running: "accent", ended: "warning", finalized: "good" } as const;

export function OpStatusBadge({ status, label }: { status: OpStatus; label: string }) {
  return <Badge tone={TONES[status]}>{label}</Badge>;
}
