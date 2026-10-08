"use client";

import type { Calculation, Fit, FitItem, State } from "@eveshipfit/dogma-engine";
import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { TypeIcon } from "@/components/ui/eve-image";
import { typeRender } from "@/core/eve/images";
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

/** The in-game gauge colours: CPU blue, powergrid red. */
const GAUGE = { cpu: "#4a90e2", power: "#d9534f", over: "#ff5a5a", track: "rgba(255,255,255,0.08)" };
const GAUGE_FROM = 18;
const GAUGE_TO = 72;
const GAUGE_MID = (GAUGE_FROM + GAUGE_TO) / 2;
const HULL_RADIUS = RING - TILE / 2 - 4;

const rad = (deg: number) => (deg * Math.PI) / 180;
const point = (radius: number, deg: number) => ({ x: C + radius * Math.cos(rad(deg)), y: C + radius * Math.sin(rad(deg)) });

function arcPath(radius: number, from: number, to: number): string {
  const a = point(radius, from);
  const b = point(radius, to);
  const large = to - from > 180 ? 1 : 0;
  return `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} A ${radius} ${radius} 0 ${large} 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
}

/**
 * CPU and powergrid on one arc, as in the game: both start from the middle, CPU grows counter-clockwise towards the
 * medium slots, powergrid clockwise towards the low slots; each half fills with the share of used to total and
 * turns red when over.
 */
function Gauge({ radius, cpu, power }: { radius: number; cpu: Resource; power: Resource }) {
  const share = (v: Resource) => (v.total > 0 ? Math.min(1, v.used / v.total) : v.used > 0 ? 1 : 0);
  const half = (GAUGE_TO - GAUGE_FROM) / 2;
  const cpuShare = share(cpu);
  const powerShare = share(power);
  return (
    <>
      <path d={arcPath(radius, GAUGE_FROM, GAUGE_TO)} stroke={GAUGE.track} strokeWidth={6} fill="none" />
      {cpuShare > 0 && (
        <path d={arcPath(radius, GAUGE_MID - half * cpuShare, GAUGE_MID)} stroke={cpu.used > cpu.total + 1e-6 ? GAUGE.over : GAUGE.cpu} strokeWidth={6} fill="none" />
      )}
      {powerShare > 0 && (
        <path d={arcPath(radius, GAUGE_MID, GAUGE_MID + half * powerShare)} stroke={power.used > power.total + 1e-6 ? GAUGE.over : GAUGE.power} strokeWidth={6} fill="none" />
      )}
      {(() => {
        const a = point(radius - 6, GAUGE_MID);
        const b = point(radius + 6, GAUGE_MID);
        return <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="rgba(255,255,255,0.5)" />;
      })()}
    </>
  );
}

/** Hardpoints on the ring, leaning into it like a tile: the icon, then a dot per hardpoint (filled = fitted). */
function Hardpoints({ icon, value, title, angle }: { icon: FitIconName; value: Resource; title: string; angle: number }) {
  if (value.total <= 0) return null;
  const { x, y } = point(RING + 2, angle);
  const width = 24 + value.total * 12;
  return (
    <div
      className="absolute flex items-center gap-1.5"
      style={{ left: x - width / 2, top: y - 10, width, height: 20, transform: `rotate(${angle + 90}deg)` }}
      title={title}
    >
      <FitIcon name={icon} size={18} className="shrink-0" style={{ transform: `rotate(${-(angle + 90)}deg)` }} />
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
  /** A click on a fitted module: the next state, as the in-game click does. */
  onCycleState: (index: number) => void;
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
        {ticks.map((deg) => {
          const a = point(RING + TILE / 2 + 2, deg);
          const b = point(RING + TILE / 2 + 9, deg);
          return <line key={deg} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="rgba(255,255,255,0.22)" />;
        })}
        {stats && <Gauge radius={RING + TILE / 2 + 16} cpu={stats.resources.cpu} power={stats.resources.power} />}
      </svg>

      {/* The hull fills the inside of the ring; the square render is cropped to the circle. */}
      <div className="absolute overflow-hidden rounded-full bg-space-900" style={{ inset: C - HULL_RADIUS }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={typeRender(p.fit.ship.type_id, 512)} alt="" className="size-full object-cover" draggable={false} />
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
              angle={angle + 90}
              style={{ left: x - arc.size / 2, top: y - arc.size / 2 }}
              entry={entry}
              state={entry ? (p.calc?.items[entry.index]?.state ?? entry.item.state) : null}
              problems={entry ? p.problems.get(entry.index) : undefined}
              selected={
                entry
                  ? p.selection?.kind === "item" && p.selection.index === entry.index
                  : p.selection?.kind === "slot" && p.selection.slot === slot && p.selection.index === index
              }
              onSelect={() => p.onSelect(entry ? { kind: "item", index: entry.index } : { kind: "slot", slot, index })}
              onCycle={() => entry && p.onCycleState(entry.index)}
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
            angle={-143}
          />
          <Hardpoints
            icon="launchers"
            value={stats.resources.launchers}
            title={`${r.launchers}: ${r.hardpoints(stats.resources.launchers.total - stats.resources.launchers.used, stats.resources.launchers.total)}`}
            angle={-37}
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

/** The state is the only thing a module's frame colour shows: offline dim, online plain, active green, overheated red. */
const STATE_TILE: Record<State, string> = {
  offline: "opacity-50 saturate-50",
  online: "",
  active: "shadow-[0_0_10px_2px_rgba(60,207,60,0.55)] border-good-text/70",
  overload: "shadow-[0_0_10px_2px_rgba(240,122,122,0.6)] border-critical-text/80",
};

function Tile({
  sde,
  slot,
  index,
  size,
  angle,
  style,
  entry,
  state,
  problems,
  selected,
  onSelect,
  onCycle,
  onDropType,
}: {
  sde: Sde;
  slot: ModuleSlot;
  index: number;
  size: number;
  /** The frame's rotation, so the tile leans into the ring. */
  angle: number;
  style: CSSProperties;
  entry: { item: FitItem; index: number } | null;
  state: State | null;
  problems: string[] | undefined;
  selected: boolean;
  onSelect: () => void;
  onCycle: () => void;
  onDropType: (typeId: number) => void;
}) {
  const { t } = useI18n();
  const e = t.fitting.editor;
  const { over, handlers } = useDropTarget(onDropType);
  const upright: CSSProperties = { transform: `rotate(${-angle}deg)` };
  const name = entry ? (sde.types.get(entry.item.type_id)?.name ?? String(entry.item.type_id)) : null;
  const charge = entry?.item.charge ? sde.types.get(entry.item.charge.type_id)?.name : null;
  const title = entry
    ? [name, charge, state ? e.states[state] : null, ...(problems ?? [])].filter(Boolean).join("\n")
    : `${e.slot[slot]} ${index + 1}`;
  const iconSize = Math.round(size * 0.72);
  return (
    <button
      type="button"
      onClick={() => {
        onSelect();
        if (entry) onCycle();
      }}
      {...handlers}
      title={title}
      aria-label={entry ? `${e.slot[slot]} ${index + 1}: ${name}` : `${e.slot[slot]} ${index + 1}: ${e.emptySlot}`}
      className={cn(
        "absolute grid place-items-center rounded-[3px] border border-surface-contrast/25 bg-black/40 transition",
        entry && state && STATE_TILE[state],
        !entry && "hover:border-surface-contrast/50",
        over && "scale-110 border-accent bg-accent/15",
        selected && "outline-2 outline-offset-1 outline-accent",
      )}
      style={{ ...style, width: size, height: size, transform: `rotate(${angle}deg)` }}
    >
      {/* Only the frame follows the ring; what is in it stays upright so it is recognisable in every slot. */}
      <span className="relative grid place-items-center" style={{ ...upright, width: size, height: size }}>
        {entry ? (
          <>
            <TypeIcon id={entry.item.type_id} size={iconSize} className="rounded-[2px] bg-transparent" />
            {entry.item.charge && (
              <span className="absolute right-0 bottom-0 rounded-sm bg-space-900 ring-1 ring-surface-contrast/25">
                <TypeIcon id={entry.item.charge.type_id} size={14} className="rounded-sm" />
              </span>
            )}
            {problems && (
              <span className="absolute -top-1 -left-1 rounded-full bg-space-900/80">
                <FitIcon name="slotWarning" size={14} />
              </span>
            )}
          </>
        ) : (
          <FitIcon name={GLYPH[slot]} size={Math.round(size * 0.55)} className="opacity-45" />
        )}
      </span>
    </button>
  );
}
