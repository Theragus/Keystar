"use client";

import { Gem, Layers, MapPin, RotateCcw, Users } from "lucide-react";
import { DateRangePicker, type RangePreset } from "@/components/ui/date-range";
import { Portrait, TypeIcon } from "@/components/ui/eve-image";
import { MultiSelect } from "@/components/ui/multi-select";
import { usePendingNavigation } from "@/components/ui/pending";
import { Segmented } from "@/components/ui/segmented";
import { displaySecurity } from "@/core/eve/images";
import { ORE_CLASSES, type OreClass } from "@/core/eve/ore";
import { useI18n } from "@/i18n/client";
import { MINING_METRICS, MINING_SOURCES, miningQueryString, type MiningFilters, type MiningView } from "../filters";
import type { FilterOptions } from "../queries";

export function MiningFilterBar({
  filters,
  options,
  presets,
  showMetric = true,
  showSource = true,
  showView = false,
}: {
  filters: MiningFilters;
  options: FilterOptions;
  presets: RangePreset[];
  showMetric?: boolean;
  showSource?: boolean;
  /** Corporation / "My characters" switch, for viewers with corporation access. */
  showView?: boolean;
}) {
  const { t } = useI18n();
  const { navigate } = usePendingNavigation();
  const all = t.common.multiSelect.all;
  const apply = (overrides: Partial<MiningFilters>) => navigate(miningQueryString(filters, { ...overrides, page: 1 }));

  const isFiltered =
    filters.characters.length + filters.types.length + filters.classes.length + filters.systems.length > 0 ||
    (showSource && filters.source !== "all");

  return (
    <div className="flex flex-wrap items-center gap-2">
      {showView && (
        <Segmented<MiningView>
          label={t.mining.view.label}
          value={filters.view}
          // Selected members may not exist in the other view.
          onChange={(view) => apply({ view, characters: [] })}
          options={[
            { value: "corp", label: t.mining.view.corp, title: t.mining.view.corpHint },
            { value: "own", label: t.mining.view.own, title: t.mining.view.ownHint },
          ]}
        />
      )}

      <DateRangePicker from={filters.from} to={filters.to} presets={presets} onChange={(r) => apply(r)} />

      <MultiSelect
        label={t.mining.filters.members}
        allLabel={all}
        icon={<Users className="size-3.5 text-accent" aria-hidden />}
        selected={filters.characters}
        onApply={(v) => apply({ characters: v.map(Number) })}
        options={options.characters.map((c) => ({
          value: c.id,
          label: c.name,
          group: c.registered ? t.mining.filters.registered : t.mining.filters.notRegistered,
          leading: <Portrait id={c.id} size={20} />,
        }))}
      />

      <MultiSelect
        label={t.mining.filters.class}
        allLabel={all}
        icon={<Layers className="size-3.5 text-accent" aria-hidden />}
        selected={filters.classes}
        onApply={(v) => apply({ classes: v as OreClass[] })}
        options={ORE_CLASSES.filter((c) => c !== "other").map((c) => ({ value: c, label: t.eve.oreClasses[c].label }))}
      />

      <MultiSelect
        label={t.mining.filters.ore}
        allLabel={all}
        icon={<Gem className="size-3.5 text-accent" aria-hidden />}
        selected={filters.types}
        onApply={(v) => apply({ types: v.map(Number) })}
        options={options.types.map((type) => ({
          value: type.id,
          label: type.name,
          group: t.eve.oreClasses[type.oreClass].label,
          leading: <TypeIcon id={type.id} size={20} />,
        }))}
      />

      <MultiSelect
        label={t.mining.filters.system}
        allLabel={all}
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
          label={t.mining.filters.dataSource}
          value={filters.source}
          onChange={(source) => apply({ source })}
          options={MINING_SOURCES.map((s) => ({ value: s, label: t.mining.sources[s].label, title: t.mining.sources[s].hint }))}
        />
      )}

      {showMetric && (
        <Segmented
          label={t.mining.filters.measure}
          value={filters.metric}
          onChange={(metric) => apply({ metric })}
          options={MINING_METRICS.map((m) => ({ value: m, label: t.mining.metrics[m] }))}
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
          <RotateCcw className="size-3.5" aria-hidden /> {t.mining.filters.reset}
        </button>
      )}
    </div>
  );
}
