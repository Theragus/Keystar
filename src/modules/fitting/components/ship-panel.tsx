"use client";

import type { Calculation, Fit, FitItem, State } from "@eveshipfit/dogma-engine";
import { Download, Eraser, Minus, Plus, Upload, X } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ShipRender, TypeIcon } from "@/components/ui/eve-image";
import { Glass } from "@/components/ui/glass";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { bayItems, overflowItems, STATES } from "../engine/fit-state";
import type { FitStats } from "../engine/stats";
import type { ViolationText } from "../engine/violations";
import { compatibleCharges, takesCharges, type ModuleSlot } from "../sde/catalog";
import { type FitIconName } from "../icons";
import type { Sde } from "../sde/reader";
import type { SkillSource } from "../engine/draft";
import type { SkillSourceCharacter } from "../queries";
import { useDropTarget } from "./drop-target";
import { FitIcon } from "./fit-icon";
import { MetaBadge } from "./item-browser";
import { metaColor, metaShort } from "./shared";
import { SlotWheel } from "./slot-wheel";

export type Selection = { kind: "item"; index: number } | { kind: "slot"; slot: ModuleSlot; index: number } | null;

export interface ShipPanelProps {
  sde: Sde;
  fit: Fit | null;
  calc: Calculation | null;
  stats: FitStats | null;
  violations: ViolationText[];
  selection: Selection;
  onSelect: (selection: Selection) => void;
  onName: (name: string) => void;
  onRemove: (index: number) => void;
  onCycleState: (index: number) => void;
  onSetState: (index: number, state: State) => void;
  /** Double-click on the wheel: active ↔ online. */
  onToggleActive: (index: number) => void;
  onCharge: (index: number, chargeTypeId: number | null) => void;
  onQuantity: (index: number, quantity: number) => void;
  /** A type dropped on a module slot (or a charge dropped on a fitted module). */
  onDrop: (typeId: number, target: { slot: ModuleSlot; index: number } | { item: number }) => void;
  source: SkillSource;
  characters: SkillSourceCharacter[];
  onSource: (source: SkillSource) => void;
  skillsLoading: boolean;
  onImport: () => void;
  onExport: () => void;
  onClear: () => void;
  onChangeHull: () => void;
}

const STATE_DOT: Record<State, string> = {
  offline: "bg-ink-3",
  online: "bg-accent",
  active: "bg-good-text",
  overload: "bg-critical-text",
};

/** The game's symbol for a slot kind, shown before a module's name. */
export const SLOT_ICON: Record<ModuleSlot, FitIconName> = {
  high: "slotHigh",
  medium: "slotMedium",
  low: "slotLow",
  rig: "slotRig",
  subsystem: "slotSubsystem",
  service: "slotService",
};

const RESOURCE_ICON: Record<string, FitIconName> = {
  cpu: "cpu",
  powergrid: "powergrid",
  calibration: "calibration",
  drone_bay: "droneBay",
  drone_bandwidth: "droneBandwidth",
  launched_drones: "drones",
  fighter_bay: "fighterDps",
  fighter_tubes: "fighterDps",
  light_fighter_tubes: "fighterDps",
  support_fighter_tubes: "fighterDps",
  heavy_fighter_tubes: "fighterDps",
};

/** The symbol next to a problem: the skill book for a missing skill, the resource's icon for a shortage. */
function violationIcon(v: ViolationText): FitIconName | null {
  if (v.rule === "skill") return "skillWarning";
  if (v.rule === "resource") return RESOURCE_ICON[v.resource ?? ""] ?? null;
  if (v.rule === "slots" || v.rule === "wrong_slot" || v.rule === "slot_taken") return null;
  return null;
}

/** The ship: hull, toolbar, resource bars, slot racks, bays and the fit's problems. */
export function ShipPanel(p: ShipPanelProps) {
  const { t } = useI18n();
  const s = t.fitting;
  const e = s.editor;
  const { sde, fit, calc, stats } = p;

  if (!fit) {
    return (
      <Glass className="min-h-[560px]">
        <EmptyState icon={Plus} title={e.chooseHull}>
          {e.chooseHullHint}
          <div className="mt-4">
            <Button variant="glass" size="sm" onClick={p.onImport}>
              <Upload className="size-3.5" aria-hidden /> {e.import}
            </Button>
          </div>
        </EmptyState>
      </Glass>
    );
  }

  const hull = sde.types.get(fit.ship.type_id);
  const slotCounts = stats?.slots ?? { high: 0, medium: 0, low: 0, rig: 0, subsystem: 0, service: 0 };
  const overflow = overflowItems(fit, slotCounts);
  const problemsByItem = new Map<number, string[]>();
  for (const v of p.violations) {
    if (v.index === null) continue;
    problemsByItem.set(v.index, [...(problemsByItem.get(v.index) ?? []), v.text]);
  }
  const selectedIndex = p.selection?.kind === "item" && fit.items[p.selection.index] ? p.selection.index : null;

  return (
    <Glass className="space-y-4 p-4">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
        <ShipRender id={fit.ship.type_id} size={64} />
        <div className="min-w-[180px] flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-lg font-semibold text-ink">{hull?.name ?? fit.ship.type_id}</span>
            <span className="text-xs text-ink-3">{sde.groups.get(hull?.groupId ?? 0)?.name}</span>
          </div>
          <button type="button" onClick={p.onChangeHull} className="mt-0.5 text-xs whitespace-nowrap text-accent hover:underline">
            {e.changeHull}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={p.onImport}>
            <Upload className="size-3.5" aria-hidden /> {e.import}
          </Button>
          <Button size="sm" onClick={p.onExport}>
            <Download className="size-3.5" aria-hidden /> {e.export}
          </Button>
          <Button size="sm" variant="ghost" onClick={p.onClear} title={e.clearConfirm}>
            <Eraser className="size-3.5" aria-hidden /> {e.clear}
          </Button>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <input
          value={fit.name ?? ""}
          onChange={(ev) => p.onName(ev.target.value)}
          placeholder={e.unnamed}
          aria-label={e.fitName}
          className="glass-inset field-focus h-8 min-w-0 flex-1 rounded-lg px-3 text-sm text-ink outline-none placeholder:text-ink-3"
        />
        <label className="flex shrink-0 items-center gap-1.5 text-2xs text-ink-3">
          {s.skills.label}
          <select
            value={p.source.kind === "character" ? `c:${p.source.characterId}` : p.source.kind}
            onChange={(ev) => {
              const v = ev.target.value;
              p.onSource(v.startsWith("c:") ? { kind: "character", characterId: Number(v.slice(2)) } : v === "none" ? { kind: "none" } : { kind: "allV" });
            }}
            className={cn("glass-inset h-8 min-w-[170px] rounded-lg px-2 text-xs text-ink", p.skillsLoading && "opacity-60")}
            title={s.skills.hint}
          >
            <option value="allV">{s.skills.allV}</option>
            <option value="none">{s.skills.none}</option>
            {p.characters.map((c) => (
              <option key={c.characterId} value={`c:${c.characterId}`} disabled={!c.skillsReady}>
                {c.name}
                {c.skillsReady ? "" : ` (${s.skills.notShared})`}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="space-y-3">
        <SlotWheel
          sde={sde}
          fit={fit}
          calc={calc}
          stats={stats}
          slotCounts={slotCounts}
          problems={problemsByItem}
          selection={p.selection}
          onSelect={p.onSelect}
          onToggleActive={p.onToggleActive}
          onDrop={p.onDrop}
        />
        <Rack title={e.selected}>
          {selectedIndex !== null ? (
            <ItemRow
              sde={sde}
              item={fit.items[selectedIndex]}
              index={selectedIndex}
              calc={calc}
              problems={problemsByItem.get(selectedIndex)}
              selected={false}
              onSelect={() => {}}
              onRemove={() => p.onRemove(selectedIndex)}
              onCycleState={() => p.onCycleState(selectedIndex)}
              onCharge={(id) => p.onCharge(selectedIndex, id)}
              onDropType={(typeId) => p.onDrop(typeId, { item: selectedIndex })}
            />
          ) : (
            <li className="px-2 py-1 text-xs text-ink-3">
              {p.selection?.kind === "slot" ? e.emptySlotHint(e.slot[p.selection.slot], p.selection.index + 1) : e.selectHint}
            </li>
          )}
          {selectedIndex !== null && (
            <li className="flex flex-wrap items-center gap-2 px-2 pt-1">
              <StateControl
                state={calc?.items[selectedIndex]?.state ?? fit.items[selectedIndex].state}
                max={calc?.items[selectedIndex]?.max_state ?? "active"}
                onChange={(state) => p.onSetState(selectedIndex, state)}
              />
              <span className="text-2xs text-ink-3">{e.stateHint}</span>
            </li>
          )}
        </Rack>
        {overflow.length > 0 && (
          <Rack title={e.overflow}>
            {overflow.map((entry) => (
              <ItemRow
                key={`overflow-${entry.index}`}
                sde={sde}
                item={entry.item}
                index={entry.index}
                calc={calc}
                problems={problemsByItem.get(entry.index)}
                selected={false}
                onSelect={() => p.onSelect({ kind: "item", index: entry.index })}
                onRemove={() => p.onRemove(entry.index)}
                onCycleState={() => p.onCycleState(entry.index)}
                onCharge={(id) => p.onCharge(entry.index, id)}
                onDropType={(typeId) => p.onDrop(typeId, { item: entry.index })}
              />
            ))}
          </Rack>
        )}
        {(["drone_bay", "fighter_bay", "cargo"] as const).map((bay) => {
          const entries = bayItems(fit, bay);
          if (!entries.length && !(bay === "drone_bay" && (stats?.resources.droneBay.total ?? 0) > 0)) return null;
          return (
            <Rack key={bay} title={e.bays[bay]}>
              {entries.map((entry) => (
                <BayRow
                  key={entry.index}
                  sde={sde}
                  item={entry.item}
                  calc={calc}
                  index={entry.index}
                  problems={problemsByItem.get(entry.index)}
                  withState={bay !== "cargo"}
                  onRemove={() => p.onRemove(entry.index)}
                  onCycleState={() => p.onCycleState(entry.index)}
                  onQuantity={(q) => p.onQuantity(entry.index, q)}
                />
              ))}
              {!entries.length && <li className="px-2 py-1 text-xs text-ink-3">–</li>}
            </Rack>
          );
        })}
      </div>

      <div className="space-y-1">
        <h3 className="eve-label text-2xs text-ink-3">
          {s.violations.title}
          {p.violations.length > 0 && <span className="ml-2 text-critical-text">{s.violations.count(p.violations.length)}</span>}
        </h3>
        {p.violations.length === 0 ? (
          <p className="text-xs text-good-text">{s.violations.none}</p>
        ) : (
          <ul className="space-y-0.5 text-xs text-critical-text">
            {groupViolations(p.violations).map(({ text, icon, count }) => (
              <li key={text} className="flex items-center gap-1.5">
                {icon ? <FitIcon name={icon} size={14} /> : <span className="size-3.5 shrink-0" />}
                {count > 1 && <span className="tabular text-ink-3">{count}×</span>}
                <span>{text}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Glass>
  );
}

/** Identical lines once, with how often they occur (three turrets missing the same skill), and their symbol. */
function groupViolations(violations: ViolationText[]): { text: string; icon: FitIconName | null; count: number }[] {
  const out = new Map<string, { text: string; icon: FitIconName | null; count: number }>();
  for (const v of violations) {
    const entry = out.get(v.text);
    if (entry) entry.count++;
    else out.set(v.text, { text: v.text, icon: violationIcon(v), count: 1 });
  }
  return [...out.values()];
}

const STATE_ICON: Partial<Record<State, FitIconName>> = { offline: "statePassive", active: "stateActive", overload: "stateOverheated" };

/** The four module states as buttons, those beyond what the module allows disabled. */
function StateControl({ state, max, onChange }: { state: State; max: State; onChange: (state: State) => void }) {
  const { t } = useI18n();
  const e = t.fitting.editor;
  const allowed = STATES.indexOf(max);
  return (
    <div role="radiogroup" aria-label={e.state} className="glass-inset inline-flex items-center gap-0.5 rounded-lg p-0.5">
      {STATES.map((s, i) => {
        const disabled = i > allowed;
        const icon = STATE_ICON[s];
        return (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={s === state}
            disabled={disabled}
            title={disabled ? e.stateUnavailable(e.states[s]) : e.states[s]}
            onClick={() => s !== state && onChange(s)}
            className={cn(
              "flex items-center gap-1 rounded-md px-2 py-1 text-2xs font-medium transition disabled:opacity-35",
              s === state ? "glass-chip text-ink" : "text-ink-3 hover:text-ink",
            )}
          >
            {icon ? <FitIcon name={icon} size={14} /> : <span className={cn("size-2 rounded-full", STATE_DOT[s])} />}
            {e.states[s]}
          </button>
        );
      })}
    </div>
  );
}

function Rack({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="eve-label mb-1 text-2xs text-ink-3">{title}</h3>
      <ul className="space-y-0.5">{children}</ul>
    </section>
  );
}

function ItemRow({
  sde,
  item,
  index,
  calc,
  problems,
  selected,
  onSelect,
  onRemove,
  onCycleState,
  onCharge,
  onDropType,
}: {
  sde: Sde;
  item: FitItem;
  index: number;
  calc: Calculation | null;
  problems: string[] | undefined;
  selected: boolean;
  onSelect: () => void;
  onRemove: () => void;
  onCycleState: () => void;
  onCharge: (chargeTypeId: number | null) => void;
  onDropType: (typeId: number) => void;
}) {
  const { t } = useI18n();
  const e = t.fitting.editor;
  const { over, handlers } = useDropTarget(onDropType);
  const type = sde.types.get(item.type_id);
  const result = calc?.items[index];
  const state = result?.state ?? item.state;
  const charges = takesCharges(sde, item.type_id) ? compatibleCharges(sde, item.type_id) : [];
  const metaLabel = type ? metaShort(type.metaGroupId, sde.metaGroups.get(type.metaGroupId)) : null;
  return (
    <li
      {...handlers}
      className={cn(
        "flex h-9 items-center gap-2 rounded-md px-2 text-sm transition",
        over ? "bg-accent/10 ring-1 ring-accent" : selected ? "bg-accent/5 ring-1 ring-accent/40" : "hover:bg-surface-contrast/5",
        problems && "ring-1 ring-critical/60",
      )}
      title={problems?.join("\n")}
    >
      <button
        type="button"
        onClick={onCycleState}
        title={e.stateToggle(e.states[state])}
        aria-label={e.stateToggle(e.states[state])}
        className="grid size-5 shrink-0 place-items-center rounded-full hover:bg-surface-contrast/10"
      >
        <span className={cn("size-2.5 rounded-full", STATE_DOT[state])} />
      </button>
      <button type="button" onClick={onSelect} className="flex min-w-0 flex-1 items-center gap-2 text-left">
        {"index" in item.slot && (item.slot.type as ModuleSlot) in SLOT_ICON && <FitIcon name={SLOT_ICON[item.slot.type as ModuleSlot]} size={16} />}
        <TypeIcon id={item.type_id} size={24} />
        <span className={cn("min-w-0 flex-1 truncate", problems ? "text-critical-text" : "text-ink")}>{type?.name ?? item.type_id}</span>
      </button>
      {metaLabel && type && <MetaBadge label={metaLabel} color={metaColor(type.metaGroupId)} metaGroupId={type.metaGroupId} />}
      {charges.length > 0 && (
        <select
          value={item.charge?.type_id ?? 0}
          onChange={(ev) => onCharge(Number(ev.target.value) || null)}
          aria-label={e.charge}
          className="glass-inset h-7 max-w-[180px] truncate rounded-md px-1.5 text-2xs text-ink-2"
        >
          <option value={0}>{e.noCharge}</option>
          {charges.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      )}
      <button type="button" onClick={onRemove} aria-label={e.remove} className="text-ink-3 hover:text-critical-text">
        <X className="size-3.5" aria-hidden />
      </button>
    </li>
  );
}

function BayRow({
  sde,
  item,
  index,
  calc,
  problems,
  withState,
  onRemove,
  onCycleState,
  onQuantity,
}: {
  sde: Sde;
  item: FitItem;
  index: number;
  calc: Calculation | null;
  problems: string[] | undefined;
  withState: boolean;
  onRemove: () => void;
  onCycleState: () => void;
  onQuantity: (quantity: number) => void;
}) {
  const { t } = useI18n();
  const e = t.fitting.editor;
  const type = sde.types.get(item.type_id);
  const state = calc?.items[index]?.state ?? item.state;
  const quantity = item.quantity ?? 1;
  return (
    <li className={cn("flex h-9 items-center gap-2 rounded-md px-2 text-sm", problems && "ring-1 ring-critical/60")} title={problems?.join("\n")}>
      {withState ? (
        <button
          type="button"
          onClick={onCycleState}
          title={e.stateToggle(e.states[state])}
          aria-label={e.stateToggle(e.states[state])}
          className="grid size-5 shrink-0 place-items-center rounded-full hover:bg-surface-contrast/10"
        >
          <span className={cn("size-2.5 rounded-full", STATE_DOT[state])} />
        </button>
      ) : (
        <span className="size-5 shrink-0" />
      )}
      <TypeIcon id={item.type_id} size={24} />
      <span className={cn("min-w-0 flex-1 truncate", problems ? "text-critical-text" : "text-ink")}>{type?.name ?? item.type_id}</span>
      <div className="flex items-center gap-1" aria-label={e.quantity}>
        <button type="button" onClick={() => onQuantity(quantity - 1)} className="glass-chip grid size-6 place-items-center rounded-md text-ink-2" aria-label="−1">
          <Minus className="size-3" aria-hidden />
        </button>
        <input
          type="number"
          min={0}
          value={quantity}
          onChange={(ev) => onQuantity(Number(ev.target.value))}
          className="glass-inset h-7 w-14 rounded-md px-1.5 text-center text-xs text-ink"
        />
        <button type="button" onClick={() => onQuantity(quantity + 1)} className="glass-chip grid size-6 place-items-center rounded-md text-ink-2" aria-label="+1">
          <Plus className="size-3" aria-hidden />
        </button>
      </div>
      <button type="button" onClick={onRemove} aria-label={e.remove} className="text-ink-3 hover:text-critical-text">
        <X className="size-3.5" aria-hidden />
      </button>
    </li>
  );
}

