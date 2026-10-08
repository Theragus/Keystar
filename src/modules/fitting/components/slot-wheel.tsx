"use client";

import type { Calculation, Fit, FitItem, State } from "@eveshipfit/dogma-engine";
import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { ShipRender, TypeIcon } from "@/components/ui/eve-image";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { rackItems } from "../engine/fit-state";
import type { FitStats, Resource } from "../engine/stats";
import type { FitIconName } from "../icons";
import { MODULE_SLOTS, type ModuleSlot } from "../sde/catalog";
import type { Sde } from "../sde/reader";
import { useDropTarget } from "./drop-target";
import { FitIcon } from "./fit-icon";
import type { Selection } from "./ship-panel";

/*
 * The fitting wheel, laid out like the game's fitting window: the hull in the middle, square slot tiles on the ring
 * (high slots on the top arc, medium slots on the right, low slots at the bottom, rigs on the top left, subsystems on
 * the left), the turret and launcher hardpoints as dots at the top corners, the CPU and powergrid gauges as arcs on
 * the bottom right with their numbers beside them, and the cargo and drone bays on the bottom left.
 */

const SIZE = 560;
const C = SIZE / 2;
const RING = 236;
const TILE = 46;

/** Where each slot kind sits: the arc's middle angle (degrees, clockwise from the right), tile size and spacing. */
const ARCS: Record<ModuleSlot, { center: number; step: number; size: number; radius: number }> = {
  high: { center: -90, step: 11.5, size: TILE, radius: RING },
  medium: { center: 0, step: 11.5, size: TILE, radius: RING },
  low: { center: 90, step: 11.5, size: TILE, radius: RING },
  rig: { center: -147, step: 9, size: 34, radius: RING },
  subsystem: { center: 180, step: 11.5, size: TILE, radius: RING },
  service: { center: 147, step: 11.5, size: TILE, radius: RING },
};

const GLYPH: Record<ModuleSlot, FitIconName> = {
  high: "glyphHigh",
  medium: "glyphMedium",
  low: "glyphLow",
  rig: "slotRig",
  subsystem: "slotSubsystem",
  service: "slotService",
};

/** The in-game gauge colours: CPU teal, powergrid red. */
const GAUGE = { cpu: "#3fb8c6", power: "#d9534f", over: "#ff5a5a", track: "rgba(255,255,255,0.08)" };

const rad = (deg: number) => (deg * Math.PI) / 180;
const point = (radius: number, deg: number) => ({ x: C + radius * Math.cos(rad(deg)), y: C + radius * Math.sin(rad(deg)) });

function arcPath(radius: number, from: number, to: number): string {
  const a = point(radius, from);
  const b = point(radius, to);
  const large = to - from > 180 ? 1 : 0;
  return `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} A ${radius} ${radius} 0 ${large} 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
}

/** A resource as an arc between two angles: a faint track and the used share, red when over. */
function Gauge({ radius, from, to, value, color }: { radius: number; from: number; to: number; value: Resource; color: string }) {
  const over = value.used > value.total + 1e-6;
  const share = value.total > 0 ? Math.min(1, value.used / value.total) : value.used > 0 ? 1 : 0;
  return (
    <>
      <path d={arcPath(radius, from, to)} stroke={GAUGE.track} strokeWidth={5} fill="none" strokeLinecap="round" />
      {share > 0 && (
        <path
          d={arcPath(radius, from, from + (to - from) * share)}
          stroke={over ? GAUGE.over : color}
          strokeWidth={5}
          fill="none"
          strokeLinecap="round"
        />
      )}
    </>
  );
}

/** Hardpoints as dots: filled for a weapon fitted, hollow for a free one. */
function Hardpoints({ icon, value, title, className }: { icon: FitIconName; value: Resource; title: string; className?: string }) {
  if (value.total <= 0) return null;
  return (
    <div className={cn("absolute flex items-center gap-1.5", className)} title={title}>
      <FitIcon name={icon} size={18} />
      <div className="flex gap-1">
        {Array.from({ length: value.total }, (_, i) => (
          <span key={i} className={cn("size-2 rounded-full ring-1 ring-ink-2/70", i < value.used ? "bg-ink" : "bg-transparent")} />
        ))}
      </div>
    </div>
  );
}

function Readout({ icon, value, unit, title, over, f, className, align = "left" }: { icon: FitIconName; value: Resource; unit: string; title: string; over?: boolean; f: (v: number) => string; className?: string; align?: "left" | "right" }) {
  return (
    <div className={cn("absolute flex items-center gap-2 text-xs", align === "right" && "flex-row-reverse text-right", className)} title={title}>
      <FitIcon name={icon} size={20} />
      <div className="leading-tight">
        <div className={cn("tabular font-medium", over ? "text-critical-text" : "text-ink")}>{f(value.used)}</div>
        <div className="tabular text-2xs text-ink-3">
          / {f(value.total)} {unit}
        </div>
      </div>
    </div>
  );
}

export interface SlotWheelProps {
  sde: Sde;
  fit: Fit;
  calc: Calculation | null;
  stats: FitStats | null;
  slotCounts: Record<ModuleSlot, number>;
  problems: Map<number, string[]>;
  selection: Selection;
  onSelect: (selection: Selection) => void;
  /** Double-click on a fitted module: active ↔ online, as the in-game click does. */
  onToggleActive: (index: number) => void;
  onDrop: (typeId: number, target: { slot: ModuleSlot; index: number } | { item: number }) => void;
}

/** The wheel is drawn at a fixed size and scaled down to the column it sits in (never up). */
function useFitScale() {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setScale(Math.min(1, el.clientWidth / SIZE));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return { ref, scale };
}

export function SlotWheel(p: SlotWheelProps) {
  const { ref, scale } = useFitScale();
  return (
    <div ref={ref} className="w-full" style={{ height: SIZE * scale }}>
      <div style={{ width: SIZE, height: SIZE, transform: `scale(${scale})`, transformOrigin: "top left" }}>
        <Wheel {...p} />
      </div>
    </div>
  );
}

function Wheel(p: SlotWheelProps) {
  const { t, f } = useI18n();
  const s = t.fitting;
  const e = s.editor;
  const r = s.stats.resources;
  const n0 = (v: number) => f.integer(Math.round(v));
  const n1 = (v: number) => f.number(v, 1);
  const stats = p.stats;
  const ticks = Array.from({ length: 19 }, (_, i) => 21 + i * 2.6);
  return (
    <div className="relative select-none" style={{ width: SIZE, height: SIZE }} role="group" aria-label={e.wheel}>
      <svg className="absolute inset-0" width={SIZE} height={SIZE} aria-hidden>
        <circle cx={C} cy={C} r={RING + TILE / 2 + 6} fill="none" stroke="rgba(255,255,255,0.07)" />
        <circle cx={C} cy={C} r={RING - TILE / 2 - 6} fill="none" stroke="rgba(255,255,255,0.05)" />
        <circle cx={C} cy={C} r={126} fill="rgba(8,9,12,0.55)" stroke="rgba(255,255,255,0.1)" />
        {ticks.map((deg) => {
          const a = point(RING + TILE / 2 + 2, deg);
          const b = point(RING + TILE / 2 + 9, deg);
          return <line key={deg} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="rgba(255,255,255,0.22)" />;
        })}
        {stats && (
          <>
            <Gauge radius={RING + TILE / 2 + 15} from={22} to={68} value={stats.resources.cpu} color={GAUGE.cpu} />
            <Gauge radius={RING + TILE / 2 + 24} from={22} to={68} value={stats.resources.power} color={GAUGE.power} />
          </>
        )}
      </svg>

      <div className="absolute grid place-items-center overflow-hidden rounded-full" style={{ inset: C - 120 }}>
        <ShipRender id={p.fit.ship.type_id} size={240} className="rounded-full" />
      </div>

      {MODULE_SLOTS.filter((slot) => p.slotCounts[slot] > 0).map((slot) =>
        rackItems(p.fit, slot, p.slotCounts[slot]).map((entry, index) => {
          const arc = ARCS[slot];
          const angle = arc.center + (index - (p.slotCounts[slot] - 1) / 2) * arc.step;
          const { x, y } = point(arc.radius, angle);
          return (
            <Tile
              key={`${slot}-${index}`}
              sde={p.sde}
              slot={slot}
              index={index}
              size={arc.size}
              style={{ left: x - arc.size / 2, top: y - arc.size / 2, transform: `rotate(${angle + 90}deg)` }}
              entry={entry}
              state={entry ? (p.calc?.items[entry.index]?.state ?? entry.item.state) : null}
              problems={entry ? p.problems.get(entry.index) : undefined}
              selected={
                entry
                  ? p.selection?.kind === "item" && p.selection.index === entry.index
                  : p.selection?.kind === "slot" && p.selection.slot === slot && p.selection.index === index
              }
              onSelect={() => p.onSelect(entry ? { kind: "item", index: entry.index } : { kind: "slot", slot, index })}
              onToggle={() => entry && p.onToggleActive(entry.index)}
              onDropType={(typeId) => p.onDrop(typeId, entry ? { item: entry.index } : { slot, index })}
            />
          );
        }),
      )}

      {stats && (
        <>
          <Hardpoints
            icon="turrets"
            value={stats.resources.turrets}
            title={`${r.turrets}: ${r.hardpoints(stats.resources.turrets.total - stats.resources.turrets.used, stats.resources.turrets.total)}`}
            className="top-[76px] left-[52px]"
          />
          <Hardpoints
            icon="launchers"
            value={stats.resources.launchers}
            title={`${r.launchers}: ${r.hardpoints(stats.resources.launchers.total - stats.resources.launchers.used, stats.resources.launchers.total)}`}
            className="top-[76px] right-[52px] flex-row-reverse"
          />
          <Readout icon="cargo" value={stats.resources.cargo} unit={s.stats.units.m3} title={r.cargo} over={stats.resources.cargo.used > stats.resources.cargo.total} f={n1} className="bottom-[44px] left-0" />
          {stats.resources.droneBay.total > 0 && (
            <Readout icon="droneBayWindow" value={stats.resources.droneBay} unit={s.stats.units.m3} title={r.droneBay} over={stats.resources.droneBay.used > stats.resources.droneBay.total} f={n0} className="bottom-[2px] left-0" />
          )}
          <Readout icon="cpu" value={stats.resources.cpu} unit={s.stats.units.tf} title={r.cpu} over={stats.resources.cpu.used > stats.resources.cpu.total + 1e-6} f={n1} className="right-0 bottom-[44px]" align="right" />
          <Readout icon="powergrid" value={stats.resources.power} unit={s.stats.units.mw} title={r.power} over={stats.resources.power.used > stats.resources.power.total + 1e-6} f={n1} className="right-0 bottom-[2px]" align="right" />
          {stats.slots.rig > 0 && (
            <div
              className={cn("absolute top-[132px] left-[8px] flex items-center gap-1.5 text-2xs", stats.resources.calibration.used > stats.resources.calibration.total ? "text-critical-text" : "text-ink-3")}
              title={r.calibration}
            >
              <FitIcon name="calibration" size={14} />
              <span className="tabular">
                {n0(stats.resources.calibration.used)} / {n0(stats.resources.calibration.total)}
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const STATE_TILE: Record<State, string> = {
  offline: "opacity-50",
  online: "",
  active: "shadow-[0_0_10px_2px_rgba(60,207,60,0.55)] border-good-text/70",
  overload: "shadow-[0_0_10px_2px_rgba(240,122,122,0.6)] border-critical-text/80",
};

function Tile({
  sde,
  slot,
  index,
  size,
  style,
  entry,
  state,
  problems,
  selected,
  onSelect,
  onToggle,
  onDropType,
}: {
  sde: Sde;
  slot: ModuleSlot;
  index: number;
  size: number;
  style: CSSProperties;
  entry: { item: FitItem; index: number } | null;
  state: State | null;
  problems: string[] | undefined;
  selected: boolean;
  onSelect: () => void;
  onToggle: () => void;
  onDropType: (typeId: number) => void;
}) {
  const { t } = useI18n();
  const e = t.fitting.editor;
  const { over, handlers } = useDropTarget(onDropType);
  const name = entry ? (sde.types.get(entry.item.type_id)?.name ?? String(entry.item.type_id)) : null;
  const charge = entry?.item.charge ? sde.types.get(entry.item.charge.type_id)?.name : null;
  const title = entry
    ? [name, charge, state ? e.states[state] : null, ...(problems ?? [])].filter(Boolean).join("\n")
    : `${e.slot[slot]} ${index + 1}`;
  const iconSize = Math.round(size * 0.72);
  return (
    <button
      type="button"
      onClick={onSelect}
      onDoubleClick={onToggle}
      {...handlers}
      title={title}
      aria-label={entry ? `${e.slot[slot]} ${index + 1}: ${name}` : `${e.slot[slot]} ${index + 1}: ${e.emptySlot}`}
      className={cn(
        "absolute grid place-items-center rounded-[3px] border border-surface-contrast/25 bg-black/40 transition",
        entry && state && STATE_TILE[state],
        !entry && "hover:border-surface-contrast/50",
        problems && "border-critical ring-1 ring-critical/70",
        over && "scale-110 border-accent bg-accent/15",
        selected && "outline-2 outline-offset-1 outline-accent",
      )}
      style={{ ...style, width: size, height: size }}
    >
      {entry ? (
        <>
          <TypeIcon id={entry.item.type_id} size={iconSize} className="rounded-[2px] bg-transparent" />
          {entry.item.charge && (
            <span className="absolute -right-1 -bottom-1 rounded-sm bg-space-900 ring-1 ring-surface-contrast/25">
              <TypeIcon id={entry.item.charge.type_id} size={14} className="rounded-sm" />
            </span>
          )}
        </>
      ) : (
        <FitIcon name={GLYPH[slot]} size={Math.round(size * 0.55)} className="opacity-45" />
      )}
    </button>
  );
}
