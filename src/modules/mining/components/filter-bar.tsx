"use client";

import { Gem, Layers, MapPin, RotateCcw, Users } from "lucide-react";
import { DateRangePicker, type RangePreset } from "@/components/ui/date-range";
import { Portrait, TypeIcon } from "@/components/ui/eve-image";
import { MultiSelect } from "@/components/ui/multi-select";
import { usePendingNavigation } from "@/components/ui/pending";
import { Segmented } from "@/components/ui/segmented";
import { displaySecurity } from "@/core/eve/images";
import { ORE_CLASS_META, ORE_CLASSES, type OreClass } from "@/core/eve/ore";
import { MINING_METRICS, MINING_SOURCES, miningQueryString, type MiningFilters } from "../filters";
import type { FilterOptions } from "../queries";

export function MiningFilterBar({
  filters,
  options,
  presets,
  showMetric = true,
  showSource = true,
}: {
  filters: MiningFilters;
  options: FilterOptions;
  presets: RangePreset[];
  showMetric?: boolean;
  showSource?: boolean;
}) {
  const { navigate } = usePendingNavigation();
  const apply = (overrides: Partial<MiningFilters>) => navigate(miningQueryString(filters, { ...overrides, page: 1 }));

  const isFiltered =
    filters.characters.length + filters.types.length + filters.classes.length + filters.systems.length > 0 ||
    (showSource && filters.source !== "all");

  return (
    <div className="flex flex-wrap items-center gap-2">
      <DateRangePicker from={filters.from} to={filters.to} presets={presets} onChange={(r) => apply(r)} />

      <MultiSelect
        label="Members"
        allLabel="All"
        icon={<Users className="size-3.5 text-accent" aria-hidden />}
        selected={filters.characters}
        onApply={(v) => apply({ characters: v.map(Number) })}
        options={options.characters.map((c) => ({
          value: c.id,
          label: c.name,
          group: c.registered ? "Registered" : "Not registered",
          leading: <Portrait id={c.id} size={20} />,
        }))}
      />

      <MultiSelect
        label="Class"
        allLabel="All"
        icon={<Layers className="size-3.5 text-accent" aria-hidden />}
        selected={filters.classes}
        onApply={(v) => apply({ classes: v as OreClass[] })}
        options={ORE_CLASSES.filter((c) => c !== "other").map((c) => ({ value: c, label: ORE_CLASS_META[c].label }))}
      />

      <MultiSelect
        label="Ore"
        allLabel="All"
        icon={<Gem className="size-3.5 text-accent" aria-hidden />}
        selected={filters.types}
        onApply={(v) => apply({ types: v.map(Number) })}
        options={options.types.map((t) => ({
          value: t.id,
          label: t.name,
          group: ORE_CLASS_META[t.oreClass].label,
          leading: <TypeIcon id={t.id} size={20} />,
        }))}
      />

      <MultiSelect
        label="System"
        allLabel="All"
        icon={<MapPin className="size-3.5 text-accent" aria-hidden />}
        selected={filters.systems}
        onApply={(v) => apply({ systems: v.map(Number) })}
        options={options.systems.map((s) => ({
          value: s.id,
          label: s.name,
          hint: s.security === null ? undefined : displaySecurity(s.security),
        }))}
      />

      {showSource && (
        <Segmented
          label="Data source"
          value={filters.source}
          onChange={(source) => apply({ source })}
          options={MINING_SOURCES.map((s) => ({ value: s.value, label: s.label, title: s.hint }))}
        />
      )}

      {showMetric && (
        <Segmented
          label="Measure"
          value={filters.metric}
          onChange={(metric) => apply({ metric })}
          options={MINING_METRICS.map((m) => ({ value: m.value, label: m.label }))}
        />
      )}

      {isFiltered && (
        <button
          type="button"
          onClick={() =>
            apply({ characters: [], types: [], classes: [], systems: [], source: "all" })
          }
          className="inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs text-ink-3 transition hover:bg-white/6 hover:text-ink"
        >
          <RotateCcw className="size-3.5" aria-hidden /> Reset
        </button>
      )}
    </div>
  );
}
