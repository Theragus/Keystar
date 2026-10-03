"use client";

import { X } from "lucide-react";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

/** How long the fade-out takes before the toast is removed. */
const LEAVE_MS = 300;

const noSubscription = () => () => {};

/**
 * Top-right stack for toasts. Rendered into <body>: the top bar's backdrop
 * filter would otherwise become the containing block of `position: fixed`.
 */
export function ToastViewport({ label, children }: { label: string; children: ReactNode }) {
  // False while server rendering and hydrating, true afterwards: portals need <body>.
  const mounted = useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
  if (!mounted) return null;
  return createPortal(
    <section
      aria-label={label}
      aria-live="polite"
      className="pointer-events-none fixed top-16 right-4 z-50 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"
    >
      {children}
    </section>,
    document.body,
  );
}

/**
 * One toast: the whole card is a link, with a close button and a countdown bar
 * along the bottom edge. Hovering or focusing it pauses the countdown; when the
 * bar runs out the toast fades and `onDismiss` removes it.
 */
export function Toast({
  href,
  linkLabel,
  dismissLabel,
  color,
  durationMs = 30_000,
  onDismiss,
  children,
}: {
  href: string;
  linkLabel: string;
  dismissLabel: string;
  /** Edge and countdown colour. */
  color: string;
  durationMs?: number;
  onDismiss: () => void;
  children: ReactNode;
}) {
  const [paused, setPaused] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!leaving) return;
    const id = setTimeout(onDismiss, LEAVE_MS);
    return () => clearTimeout(id);
  }, [leaving, onDismiss]);

  return (
    <div
      role="status"
      className={cn(
        "glass toast-in pointer-events-auto relative overflow-hidden transition-[opacity,translate] duration-300",
        leaving && "translate-x-4 opacity-0",
      )}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setPaused(false);
      }}
    >
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        title={linkLabel}
        className="flex gap-3 rounded-[inherit] border-l-[3px] py-3 pr-9 pl-3 transition-colors hover:bg-surface-contrast/5"
        style={{ borderLeftColor: color }}
      >
        {children}
      </a>
      <button
        type="button"
        onClick={() => setLeaving(true)}
        aria-label={dismissLabel}
        title={dismissLabel}
        className="absolute top-2 right-2 z-10 rounded-md p-1 text-ink-3 transition hover:bg-surface-contrast/8 hover:text-ink"
      >
        <X className="size-3.5" aria-hidden />
      </button>
      <div className="absolute inset-x-0 bottom-0 h-[3px] bg-surface-contrast/8" aria-hidden>
        <div
          className="toast-countdown h-full"
          style={{
            background: color,
            ["--toast-duration" as string]: `${durationMs}ms`,
            animationPlayState: paused || leaving ? "paused" : "running",
          }}
          onAnimationEnd={() => setLeaving(true)}
        />
      </div>
    </div>
  );
}
