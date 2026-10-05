"use client";

import { Info, Keyboard, LayoutGrid, Maximize, Ellipsis, WifiOff } from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  addSystemAction,
  arrangeAction,
  clearMapAction,
  connectAction,
  moveSystemsAction,
  removeConnectionAction,
  removeSystemAction,
  setHomeAction,
  setLabelAction,
  setPinnedAction,
  updateConnectionAction,
} from "@/app/(app)/wormholes/actions";
import { Button } from "@/components/ui/button";
import { Popover } from "@/components/ui/popover";
import { Segmented } from "@/components/ui/segmented";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { LIFE_STATES, type LifeState, type MassState } from "../lifetime";
import { DASH, MASS_WIDTH } from "../presentation";
import type { StaticFile, SystemSummary, WormholeType } from "../static";
import type { ConnectionPatch, MapConnection, MapState, MapSystem } from "../state";
import { ListView } from "./list-view";
import type { Selection } from "./map-view";
import { SidePanel } from "./side-panel";
import { SystemSearch } from "./system-search";
import { useMapState, useNow } from "./use-map-state";

function Loading() {
  const { t } = useI18n();
  return <div className="grid h-full place-items-center text-sm text-ink-3">{t.wormholes.page.loading}</div>;
}

// React Flow measures the DOM, so the canvas renders in the browser only (and loads only on this page).
const MapView = dynamic(() => import("./map-view"), { ssr: false, loading: Loading });

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName));

/** The chain map page: toolbar, canvas or list, and the details panel. */
export function MapShell({
  initial,
  types,
  effects,
  canEdit,
  canManage,
}: {
  initial: MapState;
  types: Record<string, WormholeType>;
  effects: StaticFile["effects"];
  canEdit: boolean;
  canManage: boolean;
}) {
  const { t, f } = useI18n();
  const tw = t.wormholes;
  const { view, dispatch, error, clearError, sync, saving } = useMapState(initial, types, tw.errors.failed);
  const now = useNow(initial.serverNow, 30_000);
  const [mode, setMode] = useState<"map" | "list">("map");
  const [selection, setSelection] = useState<Selection>(null);
  const [menu, setMenu] = useState<"more" | "legend" | "keys" | null>(null);
  const fit = useRef<() => void>(() => {});
  const search = useRef<HTMLInputElement>(null);

  const selectedSystem = selection?.kind === "system" ? view.systems.find((s) => s.id === selection.id) : undefined;
  const selectedConn = selection?.kind === "connection" ? view.connections.find((c) => c.id === selection.id) : undefined;

  const addSystem = (system: SystemSummary) => {
    if (!canEdit) return;
    const connectTo = selectedSystem && selectedSystem.id !== system.id ? selectedSystem.id : null;
    // A system already on the map is only connected to the selected one (as the search box says); with nothing
    // selected, or when the two are already connected, picking it just selects it.
    const onMap = view.systems.some((s) => s.id === system.id);
    const linked =
      connectTo !== null &&
      view.connections.some((c) => (c.a === system.id && c.b === connectTo) || (c.b === system.id && c.a === connectTo));
    if (onMap && (connectTo === null || linked)) {
      setSelection({ kind: "system", id: system.id });
      return;
    }
    const connId = crypto.randomUUID();
    dispatch({ kind: "addSystem", system, connectTo, connId }, () =>
      addSystemAction({ systemId: system.id, connectTo, connId }),
    );
    setSelection({ kind: "system", id: system.id });
  };
  const update = useCallback(
    (conn: MapConnection, patch: ConnectionPatch) =>
      dispatch({ kind: "updateConnection", id: conn.id, patch }, () => updateConnectionAction(conn.id, patch)),
    [dispatch],
  );
  const removeSystem = (system: MapSystem) => {
    if (!window.confirm(tw.panel.removeConfirm(system.name))) return;
    setSelection(null);
    dispatch({ kind: "removeSystem", id: system.id }, () => removeSystemAction(system.id));
  };
  const removeConnection = (conn: MapConnection) => {
    if (!window.confirm(tw.panel.removeConnectionConfirm)) return;
    setSelection(null);
    dispatch({ kind: "removeConnection", id: conn.id }, () => removeConnectionAction(conn.id));
  };
  const onMove = useCallback(
    (moves: { id: number; x: number; y: number }[]) => {
      if (moves.length) dispatch({ kind: "move", moves }, () => moveSystemsAction(moves));
    },
    [dispatch],
  );
  const onConnect = useCallback(
    (from: number, to: number) => {
      const id = crypto.randomUUID();
      dispatch({ kind: "connect", id, from, to }, () => connectAction({ id, from, to }));
      setSelection({ kind: "connection", id });
    },
    [dispatch],
  );
  const onReady = useCallback((fn: () => void) => {
    fit.current = fn;
  }, []);
  const arrange = (resetAll: boolean) => {
    setMenu(null);
    dispatch({ kind: "arrange", resetAll }, () => arrangeAction(resetAll));
    setTimeout(() => fit.current(), 50);
  };

  // Keyboard shortcuts (ignored while typing in a field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === "/") {
        e.preventDefault();
        search.current?.focus();
      } else if (key === "escape") setSelection(null);
      else if (key === "f") fit.current();
      else if (canEdit && selectedConn) {
        const life: Record<string, LifeState> = Object.fromEntries(LIFE_STATES.map((s, i) => [String(i + 1), s]));
        const mass: Record<string, MassState> = { "7": "stable", "8": "reduced", "9": "critical" };
        if (life[key]) update(selectedConn, { life: life[key] });
        else if (key === "e") update(selectedConn, { life: "lt4h" });
        else if (mass[key]) update(selectedConn, { mass: mass[key] });
        else if (key === "delete" || key === "backspace") removeConnection(selectedConn);
      } else if (canEdit && selectedSystem && (key === "delete" || key === "backspace") && selectedSystem.id !== view.home) {
        removeSystem(selectedSystem);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          size="sm"
          label={tw.toolbar.view}
          value={mode}
          onChange={setMode}
          options={[
            { value: "map", label: tw.toolbar.map },
            { value: "list", label: tw.toolbar.list },
          ]}
        />
        {canEdit && (
          <div className="flex min-w-[16rem] flex-1 items-center gap-2 sm:max-w-md">
            <SystemSearch
              inputRef={search}
              label={tw.toolbar.add}
              placeholder={selectedSystem ? tw.toolbar.connectTo(selectedSystem.name) : tw.toolbar.add}
              className="flex-1"
              onSelect={addSystem}
            />
          </div>
        )}
        <Button size="sm" variant="ghost" onClick={() => fit.current()} disabled={mode !== "map"}>
          <Maximize className="size-3.5" aria-hidden />
          {tw.toolbar.fit}
        </Button>
        {canEdit && (
          <Button size="sm" variant="ghost" onClick={() => arrange(false)} title={tw.toolbar.arrangeTitle}>
            <LayoutGrid className="size-3.5" aria-hidden />
            {tw.toolbar.arrange}
          </Button>
        )}
        <Popover
          open={menu === "legend"}
          onClose={() => setMenu(null)}
          trigger={
            <Button size="sm" variant="ghost" onClick={() => setMenu(menu === "legend" ? null : "legend")}>
              <Info className="size-3.5" aria-hidden />
              {tw.toolbar.legend}
            </Button>
          }
          className="w-72 p-4"
        >
          <Legend />
        </Popover>
        <Popover
          open={menu === "keys"}
          onClose={() => setMenu(null)}
          trigger={
            <Button size="sm" variant="ghost" onClick={() => setMenu(menu === "keys" ? null : "keys")} title={tw.toolbar.shortcuts}>
              <Keyboard className="size-3.5" aria-hidden />
              <span className="sr-only">{tw.toolbar.shortcuts}</span>
            </Button>
          }
          className="w-80 p-4"
        >
          <div className="eve-label mb-2 text-2xs text-ink-3">{tw.shortcuts.title}</div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
            {tw.shortcuts.items.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="font-mono text-ink">{k}</dt>
                <dd className="text-ink-2">{v}</dd>
              </div>
            ))}
          </dl>
        </Popover>
        {(canEdit || canManage) && (
          <Popover
            open={menu === "more"}
            onClose={() => setMenu(null)}
            align="right"
            trigger={
              <Button size="sm" variant="ghost" onClick={() => setMenu(menu === "more" ? null : "more")} title={tw.toolbar.more}>
                <Ellipsis className="size-3.5" aria-hidden />
                <span className="sr-only">{tw.toolbar.more}</span>
              </Button>
            }
            className="w-60 p-1.5"
          >
            {canEdit && (
              <button
                type="button"
                className="w-full rounded-md px-3 py-2 text-left text-sm text-ink hover:bg-surface-contrast/6"
                onClick={() => arrange(true)}
              >
                {tw.toolbar.arrangeAll}
              </button>
            )}
            {canManage && (
              <button
                type="button"
                className="w-full rounded-md px-3 py-2 text-left text-sm text-critical-text hover:bg-critical/15"
                onClick={() => {
                  setMenu(null);
                  if (!window.confirm(tw.toolbar.clearConfirm)) return;
                  setSelection(null);
                  dispatch({ kind: "clear" }, () => clearMapAction());
                }}
              >
                {tw.toolbar.clear}
              </button>
            )}
          </Popover>
        )}
        <span className="ml-auto flex items-center gap-1.5 text-2xs text-ink-3" aria-live="polite">
          {sync.kind === "offline" ? (
            <>
              <WifiOff className="size-3.5 text-warning" aria-hidden />
              {tw.toolbar.offline}
            </>
          ) : sync.kind === "live" ? (
            <>
              <span className={cn("size-1.5 rounded-full", saving ? "bg-warning" : "bg-good-text")} aria-hidden />
              {tw.toolbar.synced(f.relativeTime(new Date(sync.at), new Date(Math.max(now, sync.at))))}
            </>
          ) : (
            <>
              <WifiOff className="size-3.5 text-critical-text" aria-hidden />
              {tw.toolbar.stopped}
              <button type="button" className="underline" onClick={() => window.location.reload()}>
                {tw.toolbar.reload}
              </button>
            </>
          )}
        </span>
      </div>
      {error && (
        <div className="flex items-center gap-3 rounded-lg bg-critical/15 px-3 py-2 text-sm text-critical-text" role="alert">
          {error}
          <button type="button" className="ml-auto text-xs underline" onClick={clearError}>
            {tw.panel.close}
          </button>
        </div>
      )}
      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="glass min-h-[420px] overflow-hidden rounded-[var(--radius-glass)]">
          {mode === "map" ? (
            <MapView
              state={view}
              types={types}
              now={now}
              selection={selection}
              editable={canEdit}
              tw={tw}
              onSelect={setSelection}
              onMove={onMove}
              onConnect={onConnect}
              onReady={onReady}
            />
          ) : (
            <ListView state={view} types={types} now={now} selection={selection} onSelect={setSelection} />
          )}
        </div>
        <SidePanel
          state={view}
          selection={selection}
          types={types}
          effects={effects}
          now={now}
          canEdit={canEdit}
          canManage={canManage}
          onSelect={setSelection}
          onLabel={(id, label) => dispatch({ kind: "label", id, label }, () => setLabelAction(id, label))}
          onPin={(id, pinned) => dispatch({ kind: "pin", id, pinned }, () => setPinnedAction(id, pinned))}
          onSetHome={(system) => dispatch({ kind: "setHome", system }, () => setHomeAction(system.id))}
          onRemoveSystem={removeSystem}
          onUpdate={update}
          onRemoveConnection={removeConnection}
        />
      </div>
    </div>
  );
}

function Legend() {
  const { t } = useI18n();
  const tw = t.wormholes;
  const line = (dash: string | undefined, width: number, color = "var(--color-ink-2)") => (
    <svg width="44" height="10" aria-hidden className="shrink-0">
      <line x1="2" y1="5" x2="42" y2="5" strokeWidth={width} strokeDasharray={dash} strokeLinecap="round" style={{ stroke: color }} />
    </svg>
  );
  return (
    <div className="space-y-3 text-xs">
      <div>
        <div className="eve-label mb-1.5 text-2xs text-ink-3">{tw.legend.lifetime}</div>
        {LIFE_STATES.filter((s) => s !== "closing").map((s) => (
          <div key={s} className="flex items-center gap-2 py-0.5">
            {line(DASH[s], 4, s === "lt4h" || s === "lt1h" ? "var(--color-warning)" : undefined)}
            <span className="text-ink-2">{tw.life[s]}</span>
          </div>
        ))}
      </div>
      <div>
        <div className="eve-label mb-1.5 text-2xs text-ink-3">{tw.legend.mass}</div>
        {(["stable", "reduced", "critical"] as const).map((m) => (
          <div key={m} className="flex items-center gap-2 py-0.5">
            {line(undefined, MASS_WIDTH[m], m === "critical" ? "var(--color-critical-text)" : undefined)}
            <span className="text-ink-2">
              {tw.mass[m]}
              {m !== "stable" && <span className="ml-1.5 font-mono text-ink-3">{tw.massShort[m]}</span>}
            </span>
          </div>
        ))}
      </div>
      <p className="text-2xs text-ink-3">{tw.legend.note}</p>
    </div>
  );
}
