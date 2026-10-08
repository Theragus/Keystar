"use client";

import type { Calculation, Fit, FitItem, State } from "@eveshipfit/dogma-engine";
import { ShipRender, TypeIcon } from "@/components/ui/eve-image";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { rackItems } from "../engine/fit-state";
import { MODULE_SLOTS, type ModuleSlot } from "../sde/catalog";
import type { Sde } from "../sde/reader";
import { useDropTarget } from "./drop-target";
import type { Selection } from "./ship-panel";

/*
 * The fitting wheel, laid out like the game's fitting window: the hull in the middle, high slots on the top arc,
 * medium slots on the right, low slots at the bottom, rigs on an inner ring at the top left and subsystems (or a
 * structure's service slots) on the inner ring at the bottom left.
 */

const SIZE = 440;
const CENTER = SIZE / 2;
const SLOT = 42;

/** Where each slot kind sits: the arc's middle angle (degrees, clockwise from the right), its radius and spacing. */
const ARCS: Record<ModuleSlot, { center: number; radius: number; step: number }> = {
  high: { center: -90, radius: 196, step: 12.5 },
  medium: { center: 0, radius: 196, step: 12.5 },
  low: { center: 90, radius: 196, step: 12.5 },
  rig: { center: -160, radius: 138, step: 17 },
  subsystem: { center: 160, radius: 138, step: 17 },
  service: { center: 180, radius: 196, step: 12.5 },
};

export const STATE_RING: Record<State, string> = {
  offline: "ring-ink-3/60",
  online: "ring-accent",
  active: "ring-good-text",
  overload: "ring-critical-text",
};

function position(slot: ModuleSlot, index: number, count: number) {
  const arc = ARCS[slot];
  const angle = ((arc.center + (index - (count - 1) / 2) * arc.step) * Math.PI) / 180;
  return { left: CENTER + arc.radius * Math.cos(angle) - SLOT / 2, top: CENTER + arc.radius * Math.sin(angle) - SLOT / 2 };
}

export interface SlotWheelProps {
  sde: Sde;
  fit: Fit;
  calc: Calculation | null;
  slotCounts: Record<ModuleSlot, number>;
  problems: Map<number, string[]>;
  selection: Selection;
  onSelect: (selection: Selection) => void;
  /** Double-click on a fitted module: active ↔ online, as the in-game click does. */
  onToggleActive: (index: number) => void;
  onDrop: (typeId: number, target: { slot: ModuleSlot; index: number } | { item: number }) => void;
}

export function SlotWheel(p: SlotWheelProps) {
  const { t } = useI18n();
  const e = t.fitting.editor;
  return (
    <div className="relative mx-auto" style={{ width: SIZE, height: SIZE }} role="group" aria-label={e.wheel}>
      <div className="absolute rounded-full border border-surface-contrast/10" style={{ inset: CENTER - 196 - SLOT / 2 }} aria-hidden />
      <div className="absolute rounded-full border border-surface-contrast/8" style={{ inset: CENTER - 138 - SLOT / 2 }} aria-hidden />
      <div className="absolute grid place-items-center rounded-full bg-space-900/60 ring-1 ring-surface-contrast/10" style={{ inset: CENTER - 76 }}>
        <ShipRender id={p.fit.ship.type_id} size={128} className="rounded-full" />
      </div>
      {MODULE_SLOTS.filter((slot) => p.slotCounts[slot] > 0).map((slot) =>
        rackItems(p.fit, slot, p.slotCounts[slot]).map((entry, index) => (
          <WheelSlot
            key={`${slot}-${index}`}
            sde={p.sde}
            slot={slot}
            index={index}
            style={position(slot, index, p.slotCounts[slot])}
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
        )),
      )}
    </div>
  );
}

function WheelSlot({
  sde,
  slot,
  index,
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
  style: { left: number; top: number };
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
  return (
    <button
      type="button"
      onClick={onSelect}
      onDoubleClick={onToggle}
      {...handlers}
      title={title}
      aria-label={entry ? `${e.slot[slot]} ${index + 1}: ${name}` : `${e.slot[slot]} ${index + 1}: ${e.emptySlot}`}
      className={cn(
        "absolute grid place-items-center rounded-full transition",
        entry ? "bg-space-800 ring-2" : "border border-dashed border-surface-contrast/25 bg-space-900/40 hover:border-surface-contrast/50",
        entry && state && STATE_RING[state],
        problems && "ring-2 ring-critical",
        over && "scale-110 border-accent bg-accent/15 ring-2 ring-accent",
        selected && "outline-2 outline-offset-2 outline-accent",
      )}
      style={{ ...style, width: SLOT, height: SLOT }}
    >
      {entry ? (
        <>
          <TypeIcon id={entry.item.type_id} size={32} className="rounded-full" />
          {entry.item.charge && (
            <span className="absolute -right-1 -bottom-1 rounded-full bg-space-900 ring-1 ring-surface-contrast/20">
              <TypeIcon id={entry.item.charge.type_id} size={16} className="rounded-full" />
            </span>
          )}
        </>
      ) : (
        <span className="text-3xs font-mono text-ink-3 uppercase">{slot === "medium" ? "mid" : slot.slice(0, 3)}</span>
      )}
    </button>
  );
}
