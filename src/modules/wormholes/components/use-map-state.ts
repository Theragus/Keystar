"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MapActionResult } from "@/app/(app)/wormholes/actions";
import type { WormholeType } from "../static";
import { applyOp, type MapState, type Op } from "../state";

const POLL_MS = 3_000;
const MAX_BACKOFF_MS = 30_000;

export type SyncStatus = { kind: "live"; at: number } | { kind: "offline" } | { kind: "stopped" };

/**
 * The map as the browser sees it: the last server state with edits still on
 * their way layered on top, so nothing flickers while an edit is saved or a
 * poll lands. Polls only while the tab is visible.
 */
export function useMapState(initial: MapState, types: Record<string, WormholeType>, failedText: string) {
  const [server, setServer] = useState(initial);
  const [pending, setPending] = useState<{ seq: number; op: Op; at: number }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sync, setSync] = useState<SyncStatus>({ kind: "live", at: Date.parse(initial.serverNow) });
  const revision = useRef(initial.revision);
  const seq = useRef(0);
  // Server clock minus browser clock: expiry times come from the database, the browser's clock may be off.
  const offset = useRef(0);
  useEffect(() => {
    offset.current = Date.parse(initial.serverNow) - Date.now();
  }, [initial.serverNow]);

  const accept = useCallback((next: MapState) => {
    if (next.revision < revision.current) return;
    revision.current = next.revision;
    setServer(next);
  }, []);

  const view = useMemo(
    () => pending.reduce((state, p) => applyOp(state, p.op, types, new Date(p.at)), server),
    [server, pending, types],
  );

  const poll = useCallback(async (): Promise<"ok" | "error" | "stop"> => {
    try {
      const res = await fetch(`/api/wormholes/maps/${initial.mapId}/state?since=${revision.current}`, { cache: "no-store" });
      if (res.status === 401 || res.status === 403) return "stop";
      if (!res.ok) return "error";
      const body = (await res.json()) as { changed: false; revision: number } | { changed: true; state: MapState };
      if (body.changed) accept(body.state);
      setSync({ kind: "live", at: Date.now() + offset.current });
      return "ok";
    } catch {
      return "error";
    }
  }, [accept, initial.mapId]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;
    let stopped = false;
    // A poll still on its way schedules the next one itself; showing the tab again mustn't start a second loop.
    let inFlight = false;
    let delay = POLL_MS;
    const tick = async () => {
      if (cancelled || stopped || inFlight) return;
      if (document.visibilityState === "visible") {
        inFlight = true;
        const result = await poll();
        inFlight = false;
        if (cancelled) return;
        if (result === "stop") {
          stopped = true;
          setSync({ kind: "stopped" });
          return;
        }
        if (result === "error") {
          delay = Math.min(delay * 2, MAX_BACKOFF_MS);
          setSync({ kind: "offline" });
        } else delay = POLL_MS;
      }
      timer = setTimeout(tick, delay);
    };
    const onVisible = () => {
      if (document.visibilityState !== "visible" || inFlight || stopped) return;
      clearTimeout(timer);
      void tick();
    };
    timer = setTimeout(tick, POLL_MS);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [poll]);

  /** Applies `op` at once and saves it with `save`; the server's answer replaces the optimistic view. */
  const dispatch = useCallback(
    (op: Op, save: () => Promise<MapActionResult>) => {
      const id = ++seq.current;
      setPending((p) => [...p, { seq: id, op, at: Date.now() + offset.current }]);
      setError(null);
      save()
        .then((result) => {
          if (result.state) accept(result.state);
          if (!result.ok) setError(result.error);
        })
        .catch(() => {
          setError(failedText);
          void poll();
        })
        .finally(() => setPending((p) => p.filter((x) => x.seq !== id)));
    },
    [accept, failedText, poll],
  );

  return { view, dispatch, error, clearError: () => setError(null), sync, saving: pending.length > 0 };
}

/** The server's current time (from `start`, the server clock at render), ticking every `ms`. */
export function useNow(start: string, ms: number): number {
  const [now, setNow] = useState(() => Date.parse(start));
  useEffect(() => {
    const offset = Date.parse(start) - Date.now();
    const tick = () => setNow(Date.now() + offset);
    const id = setInterval(tick, ms);
    const first = setTimeout(tick, 0);
    return () => {
      clearInterval(id);
      clearTimeout(first);
    };
  }, [start, ms]);
  return now;
}
