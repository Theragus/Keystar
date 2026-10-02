import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/** Icon tile + mono label + value, as used on the overview page. */
export function InfoItem({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3.5">
      <span className="grid size-11 shrink-0 place-items-center rounded-lg border border-white/[0.08] bg-white/[0.025]">
        <Icon className="size-[18px] text-ink-2" aria-hidden />
      </span>
      <div className="min-w-0">
        <div className="eve-label text-2xs text-ink-3">{label}</div>
        <div className="mt-1 truncate text-[0.95rem] text-ink">{children}</div>
      </div>
    </div>
  );
}
