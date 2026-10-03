"use client";

import { Bell, BellOff, Monitor, MonitorOff } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Portrait, ShipRender } from "@/components/ui/eve-image";
import { SecurityStatus } from "@/components/ui/security";
import { Toast, ToastViewport } from "@/components/ui/toast";
import { typeRender } from "@/core/eve/images";
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
/** Opt-in for native desktop notifications, per browser. */
const DESKTOP_KEY = "ks_kill_alerts_desktop";
/** Which tab of this browser has focus (tab id → when), so unfocused tabs leave its killmails to its toasts. */
const FOCUS_KEY = "ks_kill_alerts_focus";
const FOCUS_TTL_MS = POLL_MS + 10_000;
/** Killmails some tab of this browser already announced (id → when), shared through localStorage. */
const CLAIMS_KEY = "ks_kill_alerts_shown";
const CLAIMS_TTL_MS = 6 * 3600_000;
const CLAIMS_LOCK = "ks-kill-alerts-claims";

/**
 * Claims killmails for this tab and returns the ones it may announce: across
 * tabs only the first claim wins. Read-check-write runs under a Web Lock, so two
 * tabs polling at the same moment can't both take the same killmail. Without
 * storage (blocked) every tab announces on its own.
 */
async function claimForThisTab(ids: number[]): Promise<number[]> {
  const claim = () => {
    let shown: Record<string, number> = {};
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem(CLAIMS_KEY) ?? "{}");
      if (parsed && typeof parsed === "object") shown = parsed as Record<string, number>;
    } catch {
      return ids;
    }
    const now = Date.now();
    for (const [id, at] of Object.entries(shown)) if (!(now - at < CLAIMS_TTL_MS)) delete shown[id];
    const mine = ids.filter((id) => !(String(id) in shown));
    for (const id of mine) shown[id] = now;
    try {
      localStorage.setItem(CLAIMS_KEY, JSON.stringify(shown));
    } catch {
      // Storage full or blocked: announce anyway.
    }
    return mine;
  };
  return typeof navigator !== "undefined" && navigator.locks ? navigator.locks.request(CLAIMS_LOCK, claim) : claim();
}

/**
 * A per-browser on/off switch in localStorage; other tabs follow through the
 * storage event. Without storage the choice lasts for this page only.
 */
function createSwitch(key: string, stored: string) {
  const listeners = new Set<() => void>();
  let fallback = false;
  return {
    read(): boolean {
      try {
        return localStorage.getItem(key) === stored;
      } catch {
        return fallback;
      }
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      window.addEventListener("storage", listener);
      return () => {
        listeners.delete(listener);
        window.removeEventListener("storage", listener);
      };
    },
    write(value: boolean) {
      fallback = value;
      try {
        if (value) localStorage.setItem(key, stored);
        else localStorage.removeItem(key);
      } catch {
        // Storage blocked: `fallback` keeps the choice for this page.
      }
      for (const listener of listeners) listener();
    },
  };
}

const muteSwitch = createSwitch(MUTE_KEY, "off");
const desktopSwitch = createSwitch(DESKTOP_KEY, "on");

type Permission = NotificationPermission | "unsupported";

/** The browser's notification permission; "unsupported" without the API or outside a secure context. */
function readPermission(): Permission {
  if (typeof window === "undefined" || !window.isSecureContext || typeof Notification === "undefined") return "unsupported";
  return Notification.permission;
}

const permissionListeners = new Set<() => void>();

function subscribePermission(listener: () => void) {
  permissionListeners.add(listener);
  // Site settings can change the permission while the page is open; re-read when the user comes back.
  window.addEventListener("focus", listener);
  let status: PermissionStatus | null = null;
  let unsubscribed = false;
  navigator.permissions
    ?.query({ name: "notifications" })
    .then((s) => {
      if (unsubscribed) return;
      status = s;
      s.addEventListener("change", listener);
    })
    .catch(() => {});
  return () => {
    unsubscribed = true;
    permissionListeners.delete(listener);
    window.removeEventListener("focus", listener);
    status?.removeEventListener("change", listener);
  };
}

const tabId = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Math.random());

/** The user is looking at this tab: visible and its window focused. */
const looking = () => document.visibilityState === "visible" && document.hasFocus();

function readFocus(): Record<string, number> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(FOCUS_KEY) ?? "{}");
    return parsed && typeof parsed === "object" ? (parsed as Record<string, number>) : {};
  } catch {
    return {};
  }
}

/** Records (or clears) that this tab has focus. */
function markFocus(focused: boolean) {
  const now = Date.now();
  const tabs = readFocus();
  for (const [id, at] of Object.entries(tabs)) if (!(now - at < FOCUS_TTL_MS)) delete tabs[id];
  if (focused) tabs[tabId] = now;
  else delete tabs[tabId];
  try {
    localStorage.setItem(FOCUS_KEY, JSON.stringify(tabs));
  } catch {
    // Storage blocked: every tab decides on its own.
  }
}

/** Another tab of this browser has focus and shows the killmails as toasts. */
function otherTabFocused(): boolean {
  const now = Date.now();
  return Object.entries(readFocus()).some(([id, at]) => id !== tabId && now - at < FOCUS_TTL_MS);
}

/**
 * Live kill and loss notifications for the top bar: a mute toggle, plus toasts
 * for killmails the worker picks up from zKillboard's live feed. Each toast
 * stays 30 seconds (paused while hovered) and opens the killmail on zKillboard.
 *
 * With desktop notifications switched on (and allowed by the browser), a tab the
 * user isn't looking at keeps polling and announces killmails as native OS
 * notifications instead, unless another Keystar tab has focus.
 */
export function LiveKills() {
  const { t, f } = useI18n();
  const l = t.killboard.live;
  const muted = useSyncExternalStore(muteSwitch.subscribe, muteSwitch.read, () => false);
  const desktopOn = useSyncExternalStore(desktopSwitch.subscribe, desktopSwitch.read, () => false);
  const permission = useSyncExternalStore(subscribePermission, readPermission, () => "unsupported" as const);
  const desktop = desktopOn && permission === "granted";
  const [toasts, setToasts] = useState<LiveEvent[]>([]);
  const seen = useRef(new Set<number>());
  // Read inside the polling loop, so switching desktop notifications doesn't restart it.
  const desktopRef = useRef(desktop);
  const notifyRef = useRef<(e: LiveEvent) => void>(() => {});
  useEffect(() => {
    desktopRef.current = desktop;
    notifyRef.current = (e) => {
      const ship = e.shipName ?? t.killboard.fallback.type(e.shipTypeId);
      const victim = e.victimId ? (e.victimName ?? t.killboard.fallback.character(e.victimId)) : l.noPilot;
      const place = (e.systemName ?? t.killboard.fallback.system) + (e.regionName ? ` · ${e.regionName}` : "");
      try {
        const n = new Notification(`${l.kind[e.kind]} · ${f.isk(e.value)}`, {
          body: [ship, victim + (e.victimTicker ? ` [${e.victimTicker}]` : ""), place].join("\n"),
          icon: typeRender(e.shipTypeId, 128),
          tag: `killmail-${e.killmailId}`,
        });
        n.onclick = () => {
          window.focus();
          window.open(zkillKill(e.killmailId), "_blank", "noopener");
          n.close();
        };
      } catch {
        // Some browsers only allow notifications from a service worker: fall back to a toast.
        setToasts((list) => [...list, e]);
      }
    };
  });

  // Unfocused tabs leave killmails to a focused one, so the user gets a toast there and no duplicate notification.
  useEffect(() => {
    if (muted) return;
    const update = () => markFocus(looking());
    update();
    const timer = setInterval(update, POLL_MS);
    const clear = () => markFocus(false);
    window.addEventListener("focus", update);
    window.addEventListener("blur", update);
    document.addEventListener("visibilitychange", update);
    window.addEventListener("pagehide", clear);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", update);
      window.removeEventListener("blur", update);
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener("pagehide", clear);
      clear();
    };
  }, [muted]);

  useEffect(() => {
    if (muted) return;
    let cursor: string | null = null;
    let hiddenAt: number | null = null;
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;

    const tick = async () => {
      if (cancelled) return;
      // Hidden tabs only poll for desktop notifications.
      if (document.visibilityState !== "visible" && !desktopRef.current) {
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
            const unseen = body.events.filter((e) => !seen.current.has(e.killmailId));
            const native = desktopRef.current && !looking();
            // A focused tab polls these too (its own cursor) and shows them as toasts.
            if (!(native && unseen.length && otherTabFocused())) {
              for (const e of unseen) seen.current.add(e.killmailId);
              // One browser shows each killmail once, in whichever tab claims it first.
              const mine = new Set(unseen.length ? await claimForThisTab(unseen.map((e) => e.killmailId)) : []);
              const fresh = unseen.filter((e) => mine.has(e.killmailId));
              if (!cancelled && fresh.length) {
                if (native) for (const e of fresh) notifyRef.current(e);
                else setToasts((list) => [...list, ...fresh]);
              }
            }
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
    muteSwitch.write(next);
    if (next) setToasts([]);
  };

  const toggleDesktop = async () => {
    if (desktop) return desktopSwitch.write(false);
    // Asking has to happen in the click itself; browsers ignore requests without a user gesture.
    const granted = permission === "granted" || (await Notification.requestPermission()) === "granted";
    for (const listener of permissionListeners) listener();
    desktopSwitch.write(granted);
  };

  const Icon = muted ? BellOff : Bell;
  const DesktopIcon = desktop ? Monitor : MonitorOff;
  const desktopTitle =
    permission === "denied" ? l.desktop.blocked : permission === "unsupported" ? l.desktop.unsupported : desktop ? l.desktop.disable : l.desktop.enable;
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
      {!muted && (
        <button
          type="button"
          onClick={toggleDesktop}
          disabled={permission === "denied" || permission === "unsupported"}
          aria-pressed={desktop}
          aria-label={l.desktop.label}
          title={desktopTitle}
          className="flex h-8 items-center rounded-md border border-surface-contrast/[0.08] bg-surface-contrast/[0.03] px-2 text-ink-3 transition hover:text-ink disabled:opacity-50 disabled:hover:text-ink-3"
        >
          <DesktopIcon className={desktop ? "size-3.5 text-accent" : "size-3.5"} aria-hidden />
        </button>
      )}
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
