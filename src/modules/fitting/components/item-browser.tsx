"use client";

import { ChevronLeft, ChevronRight, Folder, Search, X } from "lucide-react";
import { useMemo, useState, type KeyboardEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { TypeIcon } from "@/components/ui/eve-image";
import { Glass } from "@/components/ui/glass";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { romanLevel } from "../engine/violations";
import { META_ICON } from "../icons";
import { FitIcon } from "./fit-icon";
import { fitsHull, kindOf, MODULE_SLOTS, requiredSkills, searchTypes, type ItemKind, type ModuleSlot } from "../sde/catalog";
import type { Sde, SdeType } from "../sde/reader";
import type { FitIconName } from "../icons";
import { BROWSER_ROOTS, DRAG_MIME, metaColor, metaShort, type BrowserRoot } from "./shared";

const SEARCH_LIMIT = 80;

export interface ItemBrowserProps {
  sde: Sde;
  /** The fitted hull, for the "fits this hull" filter. */
  shipTypeId: number | null;
  /** The skills in use, for the skills filter and the requirement hints. */
  skills: Record<number, number>;
  /** The selected slot (or the slot of the selected module), for the "fits the selected slot" filter. */
  selectedSlot: ModuleSlot | null;
  root: BrowserRoot;
  onRootChange: (root: BrowserRoot) => void;
  onPick: (typeId: number) => void;
}

const isModuleKind = (kind: ItemKind): kind is ModuleSlot => (MODULE_SLOTS as readonly string[]).includes(kind);

/**
 * The item browser: market groups as folders, a search within the chosen root, and filters that keep the list
 * relevant to the hull and slot at hand. Clicking an item fits it; dragging lets the user choose the slot.
 */
export function ItemBrowser({ sde, shipTypeId, skills, selectedSlot, root, onRootChange, onPick }: ItemBrowserProps) {
  const { t } = useI18n();
  const b = t.fitting.browser;
  const rootId = BROWSER_ROOTS.find((r) => r.key === root)!.id;
  // The folder being browsed; a new root starts at its top folder (state adjusted during render, not in an effect).
  const [nav, setNav] = useState<{ rootId: number; groupId: number }>({ rootId, groupId: rootId });
  if (nav.rootId !== rootId) setNav({ rootId, groupId: rootId });
  const groupId = nav.rootId === rootId ? nav.groupId : rootId;
  const setGroupId = (id: number) => setNav({ rootId, groupId: id });
  const [query, setQuery] = useState("");
  const [fitsSlot, setFitsSlot] = useState(true);
  const [onlyHull, setOnlyHull] = useState(true);
  const [onlySkills, setOnlySkills] = useState(false);
  const [meta, setMeta] = useState(0);

  /** Which root a market group belongs to, for the search. */
  const rootOf = useMemo(() => {
    const out = new Map<number, number>();
    for (const g of sde.marketGroups.values()) {
      let id = g.id;
      for (let guard = 0; guard < 16; guard++) {
        const parent = sde.marketGroups.get(id)?.parentId;
        if (!parent) break;
        id = parent;
      }
      out.set(g.id, id);
    }
    return out;
  }, [sde]);

  const passes = (type: SdeType): boolean => {
    const kind = kindOf(sde, type.id);
    if (meta && type.metaGroupId !== meta) return false;
    if (isModuleKind(kind)) {
      if (fitsSlot && selectedSlot && kind !== selectedSlot) return false;
      if (onlyHull && shipTypeId && !fitsHull(sde, type.id, shipTypeId)) return false;
    }
    if (onlySkills && kind !== "ship" && !meetsSkills(sde, type.id, skills)) return false;
    return true;
  };

  const q = query.trim();
  const group = sde.marketGroups.get(groupId);
  const folders = q ? [] : (group?.childIds.map((id) => sde.marketGroups.get(id)!) ?? []);
  const browsable = new Set<number>(BROWSER_ROOTS.map((r) => r.id));
  const inRoot = q ? searchTypes(sde, q, (type) => rootOf.get(type.marketGroupId) === rootId && passes(type), SEARCH_LIMIT) : [];
  // Nothing under this root: look everywhere the browser shows, so "trimark" finds rigs from the modules tab too.
  const items = q
    ? inRoot.length
      ? inRoot
      : searchTypes(sde, q, (type) => browsable.has(rootOf.get(type.marketGroupId) ?? 0) && passes(type), SEARCH_LIMIT)
    : (group?.typeIds.map((id) => sde.types.get(id)!).filter((type) => type?.published && passes(type)) ?? []).sort((a, c) =>
        a.name.localeCompare(c.name),
      );
  const path: { id: number; name: string }[] = [];
  for (let id = groupId, guard = 0; id && id !== rootId && guard < 16; guard++) {
    const g = sde.marketGroups.get(id);
    if (!g) break;
    path.unshift({ id: g.id, name: g.name });
    id = g.parentId;
  }
  const metaOptions = [...sde.metaGroups].filter(([id]) => id <= 15);

  const onRowKey = (e: KeyboardEvent, typeId: number) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onPick(typeId);
    }
  };

  return (
    <Glass className="flex max-h-[calc(100dvh-10rem)] min-h-[560px] flex-col p-3">
      <div className="flex flex-wrap gap-1" role="tablist" aria-label={b.title}>
        {BROWSER_ROOTS.map((r) => (
          <button
            key={r.key}
            type="button"
            role="tab"
            aria-selected={r.key === root}
            onClick={() => onRootChange(r.key)}
            className={cn(
              "rounded-md px-2.5 py-1 text-2xs font-medium transition",
              r.key === root ? "glass-chip text-ink" : "text-ink-3 hover:text-ink",
            )}
          >
            {b.groups[r.key]}
          </button>
        ))}
      </div>

      <label className="glass-inset field-focus mt-3 flex h-9 items-center gap-2 rounded-lg px-3">
        <Search className="size-3.5 shrink-0 text-ink-3" aria-hidden />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={b.search}
          aria-label={b.searchLabel}
          className="h-full min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-3"
        />
        {query && (
          <button type="button" onClick={() => setQuery("")} aria-label={b.clear} className="text-ink-3 hover:text-ink">
            <X className="size-3.5" aria-hidden />
          </button>
        )}
      </label>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-ink-2">
        {root !== "ships" && root !== "charges" && root !== "drones" && (
          <>
            <label className={cn("flex items-center gap-1.5", !selectedSlot && "opacity-50")}>
              <input type="checkbox" checked={fitsSlot} disabled={!selectedSlot} onChange={(e) => setFitsSlot(e.target.checked)} />
              {b.filters.fitsSlot}
            </label>
            <label className={cn("flex items-center gap-1.5", !shipTypeId && "opacity-50")}>
              <input type="checkbox" checked={onlyHull} disabled={!shipTypeId} onChange={(e) => setOnlyHull(e.target.checked)} />
              {b.filters.fitsHull}
            </label>
          </>
        )}
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={onlySkills} onChange={(e) => setOnlySkills(e.target.checked)} />
          {b.filters.skills}
        </label>
        <label className="flex items-center gap-1.5">
          <span>{b.filters.meta}</span>
          <select
            value={meta}
            onChange={(e) => setMeta(Number(e.target.value))}
            className="glass-inset rounded-md px-1.5 py-0.5 text-2xs text-ink"
          >
            <option value={0}>{b.filters.metaAll}</option>
            {metaOptions.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {!q && (
        <div className="mt-2 flex min-h-6 items-center gap-1 text-2xs text-ink-3">
          {path.length > 0 && (
            <button
              type="button"
              onClick={() => setGroupId(path.length > 1 ? path[path.length - 2].id : rootId)}
              className="glass-chip inline-flex h-6 items-center gap-1 rounded-md px-2 text-ink-2 hover:text-ink"
            >
              <ChevronLeft className="size-3" aria-hidden /> {b.back}
            </button>
          )}
          <span className="truncate">{path.map((p) => p.name).join(" › ")}</span>
        </div>
      )}

      <ul className="mt-2 min-h-0 flex-1 space-y-0.5 overflow-y-auto overscroll-contain pr-1">
        {folders.map((g) => (
          <li key={g.id}>
            <button
              type="button"
              onClick={() => setGroupId(g.id)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-ink-2 hover:bg-surface-contrast/6 hover:text-ink"
            >
              <Folder className="size-4 shrink-0 text-ink-3" aria-hidden />
              <span className="min-w-0 flex-1 truncate">{g.name}</span>
              <ChevronRight className="size-3.5 shrink-0 text-ink-3" aria-hidden />
            </button>
          </li>
        ))}
        {items.map((type) => {
          const kind = kindOf(sde, type.id);
          const missing = meetsSkills(sde, type.id, skills) ? null : firstMissingSkill(sde, type.id, skills);
          const metaLabel = metaShort(type.metaGroupId, sde.metaGroups.get(type.metaGroupId));
          return (
            <li key={type.id}>
              <div
                role="button"
                tabIndex={0}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(DRAG_MIME, String(type.id));
                  e.dataTransfer.effectAllowed = "copy";
                }}
                onClick={() => onPick(type.id)}
                onKeyDown={(e) => onRowKey(e, type.id)}
                title={b.tip}
                className="flex cursor-grab items-center gap-1.5 rounded-md px-2 py-1 text-left text-sm text-ink-2 hover:bg-surface-contrast/6 hover:text-ink active:cursor-grabbing"
              >
                {isModuleKind(kind) && <FitIcon name={SLOT_ICON_BY_KIND[kind]} size={16} title={t.fitting.editor.slot[kind]} />}
                <TypeIcon id={type.id} size={24} />
                <span className="min-w-0 flex-1 truncate">{type.name}</span>
                {missing && (
                  <span role="img" aria-label={b.requires(missing.name, romanLevel(missing.level))} title={b.requires(missing.name, romanLevel(missing.level))}>
                    <FitIcon name="skillWarning" size={16} />
                  </span>
                )}
                {metaLabel && <MetaBadge label={metaLabel} color={metaColor(type.metaGroupId)} metaGroupId={type.metaGroupId} />}
              </div>
            </li>
          );
        })}
        {!folders.length && !items.length && <li className="px-2 py-6 text-center text-xs text-ink-3">{b.noResults}</li>}
        {q && items.length >= SEARCH_LIMIT && <li className="px-2 py-2 text-center text-2xs text-ink-3">{b.resultsCapped(SEARCH_LIMIT)}</li>}
      </ul>
    </Glass>
  );
}

const SLOT_ICON_BY_KIND: Record<ModuleSlot, FitIconName> = {
  high: "slotHigh",
  medium: "slotMedium",
  low: "slotLow",
  rig: "slotRig",
  subsystem: "slotSubsystem",
  service: "slotService",
};

/** A meta badge in the game's colour with the game's marker; Tech I stays a quiet neutral chip. */
export function MetaBadge({ label, color, metaGroupId }: { label: string; color: string | null; metaGroupId: number }) {
  const marker = META_ICON[metaGroupId];
  if (!color) return <Badge className="shrink-0">{label}</Badge>;
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-full py-0.5 pr-2 pl-1.5 text-2xs font-medium whitespace-nowrap text-white ring-1 ring-white/15 ring-inset"
      style={{ background: color }}
    >
      {marker && <FitIcon name={marker} size={12} />}
      {label}
    </span>
  );
}

function meetsSkills(sde: Sde, typeId: number, skills: Record<number, number>): boolean {
  for (const [skill, level] of requiredSkills(sde, typeId)) if ((skills[skill] ?? 0) < level) return false;
  return true;
}

function firstMissingSkill(sde: Sde, typeId: number, skills: Record<number, number>): { name: string; level: number } | null {
  for (const [skill, level] of requiredSkills(sde, typeId)) {
    if ((skills[skill] ?? 0) < level) return { name: sde.types.get(skill)?.name ?? String(skill), level };
  }
  return null;
}
