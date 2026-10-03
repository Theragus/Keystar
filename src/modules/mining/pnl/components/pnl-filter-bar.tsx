"use client";

import { RotateCcw, Users } from "lucide-react";
import { DateRangePicker, type RangePreset } from "@/components/ui/date-range";
import { Portrait } from "@/components/ui/eve-image";
import { MultiSelect } from "@/components/ui/multi-select";
import { usePendingNavigation } from "@/components/ui/pending";
import { Segmented } from "@/components/ui/segmented";
import { PNL_BUCKETS, pnlQueryString, type PnlFilters } from "../filters";

export function PnlFilterBar({
  filters,
  presets,
  characters,
  showBucket = false,
}: {
  filters: PnlFilters;
  presets: RangePreset[];
  characters: { characterId: number; name: string }[];
  showBucket?: boolean;
}) {
  const { navigate } = usePendingNavigation();
  const apply = (overrides: Partial<PnlFilters>) => navigate(pnlQueryString(filters, { ...overrides, page: 1 }));

  return (
    <div className="flex flex-wrap items-center gap-2">
      <DateRangePicker from={filters.from} to={filters.to} presets={presets} onChange={(r) => apply(r)} />
      {characters.length > 1 && (
        <MultiSelect
          label="Characters"
          allLabel="All"
          icon={<Users className="size-3.5 text-accent" aria-hidden />}
          selected={filters.characters}
          onApply={(v) => apply({ characters: v.map(Number) })}
          options={characters.map((c) => ({ value: c.characterId, label: c.name, leading: <Portrait id={c.characterId} size={20} /> }))}
        />
      )}
      {showBucket && (
        <Segmented
          label="Group by"
          value={filters.bucket}
          onChange={(bucket) => apply({ bucket })}
          options={PNL_BUCKETS.map((b) => ({ value: b.value, label: b.label }))}
        />
      )}
      {filters.characters.length > 0 && (
        <button
          type="button"
          onClick={() => apply({ characters: [] })}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs text-ink-3 transition hover:bg-white/6 hover:text-ink"
        >
          <RotateCcw className="size-3.5" aria-hidden /> Reset
        </button>
      )}
    </div>
  );
}
