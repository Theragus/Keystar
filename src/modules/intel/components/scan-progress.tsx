"use client";

import { LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import type { ScanProgress } from "../scans";

const MAX_POLL_MS = 20 * 60_000;

function describe(p: ScanProgress["pending"]): string | null {
  if (p.stats) return `Reading zKillboard statistics: ${p.stats} pilot${p.stats === 1 ? "" : "s"} to go`;
  if (p.newest) return `Reading recent kills: ${p.newest} pilot${p.newest === 1 ? "" : "s"} to go`;
  if (p.deeper) return `Reading older kills for ${p.deeper} active pilot${p.deeper === 1 ? "" : "s"}`;
  return null;
}

/**
 * Keeps a scan page current while the worker reads zKillboard: polls a small
 * progress endpoint (faster while statistics are pending) and refreshes the
 * server-rendered page only when something changed.
 */
export function ScanProgressPoller({ scanId, initial }: { scanId: string; initial: ScanProgress }) {
  const router = useRouter();
  const [progress, setProgress] = useState(initial);
  const [, startTransition] = useTransition();
  const version = useRef(initial.version);
  const pending = useRef(initial.pending);
  const done = initial.status === "ready" && !describe(initial.pending);
  const [stopped, setStopped] = useState(done);

  useEffect(() => {
    if (stopped) return;
    const started = Date.now();
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      if (document.visibilityState === "visible") {
        try {
          const res = await fetch(`/api/intel/scans/${scanId}`, { cache: "no-store" });
          if (res.ok) {
            const next = (await res.json()) as ScanProgress;
            pending.current = next.pending;
            setProgress(next);
            if (next.version !== version.current) {
              version.current = next.version;
              startTransition(() => router.refresh());
            }
            if (next.status === "ready" && !describe(next.pending)) {
              setStopped(true);
              return;
            }
          }
        } catch {
          // Network hiccup: try again on the next tick.
        }
      }
      if (Date.now() - started > MAX_POLL_MS) {
        setStopped(true);
        return;
      }
      const p = pending.current;
      timer = setTimeout(tick, p.stats ? 2000 : p.newest ? 4000 : 10_000);
    };
    timer = setTimeout(tick, 1500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [scanId, stopped, router]);

  const text = describe(progress.pending);
  if (!text || stopped) return null;
  return (
    <p className="flex items-center gap-2 text-sm text-ink-2" role="status">
      <LoaderCircle className="size-4 animate-spin text-accent" aria-hidden />
      {text}
    </p>
  );
}
