"use client";

import { AlertTriangle, CheckCircle2, CircleDashed, Clock3, XCircle } from "lucide-react";
import type { ReactNode } from "react";
import type { Role } from "@/core/rbac/roles";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "accent" | "gold" | "good" | "warning" | "critical";

const tones: Record<Tone, string> = {
  neutral: "bg-white/7 text-ink-2 ring-white/10",
  accent: "bg-accent/12 text-accent ring-accent/25",
  gold: "bg-gold/12 text-gold ring-gold/25",
  good: "bg-good/15 text-good-text ring-good/30",
  warning: "bg-warning/12 text-warning ring-warning/30",
  critical: "bg-critical/15 text-critical-text ring-critical/30",
};

export function Badge({ tone = "neutral", className, children }: { tone?: Tone; className?: string; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-medium whitespace-nowrap ring-1 ring-inset",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

const roleTone: Record<Role, Tone> = {
  guest: "warning",
  member: "neutral",
  viewer: "neutral",
  contributor: "accent",
  director: "gold",
  admin: "gold",
};

export function RoleBadge({ role }: { role: Role }) {
  const { t } = useI18n();
  return (
    <Badge tone={roleTone[role]} className="rounded px-1.5 font-mono text-3xs tracking-wider uppercase">
      {t.common.roles[role].label}
    </Badge>
  );
}

/** Status always pairs color with an icon and a label. */
export function StatusBadge({ status, label }: { status: "ok" | "error" | "running" | "pending" | "skipped" | "warning"; label?: string }) {
  const { t } = useI18n();
  switch (status) {
    case "ok":
      return (
        <Badge tone="good">
          <CheckCircle2 className="size-3" aria-hidden /> {label ?? t.common.status.ok}
        </Badge>
      );
    case "error":
      return (
        <Badge tone="critical">
          <XCircle className="size-3" aria-hidden /> {label ?? t.common.status.error}
        </Badge>
      );
    case "warning":
      return (
        <Badge tone="warning">
          <AlertTriangle className="size-3" aria-hidden /> {label ?? t.common.status.warning}
        </Badge>
      );
    case "running":
      return (
        <Badge tone="accent">
          <Clock3 className="size-3" aria-hidden /> {label ?? t.common.status.running}
        </Badge>
      );
    default:
      return (
        <Badge>
          <CircleDashed className="size-3" aria-hidden /> {label ?? t.common.status.pending}
        </Badge>
      );
  }
}
