import { cn } from "@/lib/utils";

/**
 * A mail label's colour as a small dot. The colour comes from ESI's fixed
 * label palette and is never the only signal: the label name is always shown
 * (or used as the tooltip) next to it.
 */
export function LabelDot({ color, title, className }: { color: string | null; title?: string; className?: string }) {
  return (
    <span
      title={title}
      aria-hidden={title ? undefined : true}
      className={cn("inline-block size-2.5 shrink-0 rounded-full ring-1 ring-white/25", !color && "bg-white/15", className)}
      style={color ? { backgroundColor: color } : undefined}
    />
  );
}
