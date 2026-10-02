"use client";

import { cn } from "@/lib/utils";

/** Liquid-glass segmented control with a floating thumb on the active option. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  size = "md",
}: {
  options: { value: T; label: string; title?: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  size?: "sm" | "md";
}) {
  return (
    <div role="radiogroup" aria-label={label} className="glass-inset inline-flex items-center gap-0.5 rounded-lg p-0.5">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={o.title}
            onClick={() => !active && onChange(o.value)}
            className={cn(
              "rounded-md font-medium transition-all duration-200",
              size === "sm" ? "px-2.5 py-1 text-2xs" : "px-3.5 py-1.5 text-xs",
              active ? "glass-chip text-ink" : "text-ink-3 hover:text-ink",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
