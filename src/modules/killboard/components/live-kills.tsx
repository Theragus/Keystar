"use client";

import { Bell, BellOff } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Portrait, ShipRender } from "@/components/ui/eve-image";
import { SecurityStatus } from "@/components/ui/security";
import { Toast, ToastViewport } from "@/components/ui/toast";
import { useI18n } from "@/i18n/client";
import { KILL_COLOR, LOSS_COLOR } from "../colors";
import { zkillKill } from "../links";
import type { LiveEvent } from "../queries";

/** The worker reads zKillboard every 10 seconds; checking the database a little less often is plenty. */
const POLL_MS = 15_000;
const TOAST_MS = 30_000;
const MAX_VISIBLE = 3;
/** After a tab was hidden this long, start fresh instead of replaying what was missed. */
const RESUME_GAP_MS = 2 * 60_000;
const MUTE_KEY = "ks_kill_alerts";
const CHANNEL = "ks-live-kills";

/** Per-browser mute switch in localStorage; other tabs follow through the storage event. */
const muteListeners = new Set<() => void>();
let mutedFallback = false;

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "off";
  } catch {
    return mutedFallback;
  }
}

function subscribeMuted(listener: () => void) {
  muteListeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    muteListeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function writeMuted(muted: boolean) {
  mutedFallback = muted;
  try {
    if (muted) localStorage.setItem(MUTE_KEY, "off");
    else localStorage.removeItem(MUTE_KEY);
  } catch {
    // Storage blocked: the choice lasts for this page only (mutedFallback).
  }
  for (const listener of muteListeners) listener();
}

/**
 * Live kill and loss notifications for the top bar: a mute toggle, plus toasts
 * for killmails the worker picks up from zKillboard's live feed. Each toast
 * stays 30 seconds (paused while hovered) and opens the killmail on zKillboard.
 */
export function LiveKills() {
  const { t } = useI18n();
  const l = t.killboard.live;
  const muted = useSyncExternalStore(subscribeMuted, readMuted, () => false);
  const [toasts, setToasts] = useState<LiveEvent[]>([]);
  const seen = useRef(new Set<number>());
  const channel = useRef<BroadcastChannel | null>(null);

  // Tabs tell each other what they announced, so one browser shows each killmail once.
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const bc = new BroadcastChannel(CHANNEL);
    bc.onmessage = (e: MessageEvent<number>) => {
      if (typeof e.data === "number") seen.current.add(e.data);
    };
    channel.current = bc;
    return () => {
      bc.close();
      channel.current = null;
    };
  }, []);

  useEffect(() => {
    if (muted) return;
    let cursor: string | null = null;
    let hiddenAt: number | null = null;
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;

    const tick = async () => {
      if (cancelled) return;
      if (document.visibilityState !== "visible") {
        hiddenAt ??= Date.now();
      } else {
        if (hiddenAt !== null && Date.now() - hiddenAt > RESUME_GAP_MS) cursor = null;
        hiddenAt = null;
        try {
          const res = await fetch(cursor ? `/api/killboard/live?since=${encodeURIComponent(cursor)}` : "/api/killboard/live", {
            cache: "no-store",
          });
          if (res.ok) {
            const body = (await res.json()) as { events: LiveEvent[]; cursor: string };
            const fresh = body.events.filter((e) => !seen.current.has(e.killmailId));
            for (const e of fresh) {
              seen.current.add(e.killmailId);
              channel.current?.postMessage(e.killmailId);
            }
            if (!cancelled && fresh.length) setToasts((list) => [...list, ...fresh]);
            cursor = body.cursor;
          }
        } catch {
          // Network hiccup: try again on the next tick.
        }
      }
      if (!cancelled) timer = setTimeout(tick, POLL_MS);
    };
    timer = setTimeout(tick, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [muted]);

  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((e) => e.killmailId !== id)), []);

  const toggle = () => {
    const next = !muted;
    writeMuted(next);
    if (next) setToasts([]);
  };

  const Icon = muted ? BellOff : Bell;
  return (
    <>
      <button
        type="button"
        onClick={toggle}
        aria-pressed={!muted}
        title={muted ? l.toggle.enable : l.toggle.disable}
        className="flex h-8 items-center gap-1.5 rounded-md border border-surface-contrast/[0.08] bg-surface-contrast/[0.03] px-2.5 text-xs text-ink-3 transition hover:text-ink"
      >
        <Icon className={muted ? "size-3.5" : "size-3.5 text-accent"} aria-hidden />
        <span className="sr-only sm:not-sr-only">{muted ? l.toggle.off : l.toggle.on}</span>
      </button>
      <ToastViewport label={l.region}>
        {/* Newest on top; the rest wait until one closes. */}
        {toasts
          .slice(0, MAX_VISIBLE)
          .reverse()
          .map((e) => (
            <KillToast key={e.killmailId} event={e} onDismiss={dismiss} />
          ))}
      </ToastViewport>
    </>
  );
}

function KillToast({ event: e, onDismiss }: { event: LiveEvent; onDismiss: (id: number) => void }) {
  const { t, f } = useI18n();
  const l = t.killboard.live;
  const kill = e.kind === "kill";
  const color = kill ? KILL_COLOR : LOSS_COLOR;
  const a = e.attacker;
  // The corporation's own pilot: the one who scored the kill, or the one who lost the ship.
  const memberId = kill ? a?.characterId : e.victimId;
  const close = useCallback(() => onDismiss(e.killmailId), [onDismiss, e.killmailId]);
  const others = e.attackerCount - (a ? 1 : 0);

  return (
    <Toast href={zkillKill(e.killmailId)} linkLabel={l.open} dismissLabel={l.dismiss} color={color} durationMs={TOAST_MS} onDismiss={close}>
      <div className="relative shrink-0 self-start">
        <ShipRender id={e.shipTypeId} size={56} />
        {memberId ? <Portrait id={memberId} size={26} className="absolute -right-2 -bottom-2 ring-2 ring-space-900" /> : null}
      </div>
      <div className="min-w-0 flex-1 text-xs">
        <div className="flex items-baseline justify-between gap-2">
          <span className="eve-label inline-flex items-center gap-1.5 text-3xs text-ink-2">
            <span className="size-2 rounded-full" style={{ background: color }} aria-hidden />
            {l.kind[e.kind]}
          </span>
          <span className="text-sm font-semibold text-ink tabular-nums">{f.isk(e.value)}</span>
        </div>
        <div className="mt-0.5 truncate text-sm font-medium text-ink">{e.shipName ?? t.killboard.fallback.type(e.shipTypeId)}</div>
        <div className="truncate text-ink-2">
          {e.victimId ? (e.victimName ?? t.killboard.fallback.character(e.victimId)) : l.noPilot}
          {e.victimTicker && <span className="ml-1 font-mono text-3xs text-ink-3">[{e.victimTicker}]</span>}
        </div>
        {a && (
          <div className="truncate text-ink-2">
            <span className="text-ink-3">{kill ? (a.finalBlow ? l.finalBlow : l.topDamage) : l.killedBy}: </span>
            {a.characterId ? (a.name ?? t.killboard.fallback.character(a.characterId)) : l.npc}
            {a.ticker && <span className="ml-1 font-mono text-3xs text-ink-3">[{a.ticker}]</span>}
            {a.shipTypeId ? <span className="text-ink-3"> · {a.shipName ?? t.killboard.fallback.type(a.shipTypeId)}</span> : null}
            {others > 0 && <span className="text-ink-3"> · {l.others(others)}</span>}
          </div>
        )}
        <div className="mt-1 flex min-w-0 items-center gap-1.5 text-ink-3">
          <SecurityStatus value={e.security} />
          <span className="truncate">
            {e.systemName ?? t.killboard.fallback.system}
            {e.regionName && ` · ${e.regionName}`}
          </span>
        </div>
      </div>
    </Toast>
  );
}
