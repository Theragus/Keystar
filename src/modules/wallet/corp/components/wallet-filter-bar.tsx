"use client";

import { Landmark, RotateCcw, Tags } from "lucide-react";
import { DateRangePicker, type RangePreset } from "@/components/ui/date-range";
import { MultiSelect } from "@/components/ui/multi-select";
import { usePendingNavigation } from "@/components/ui/pending";
import { Segmented } from "@/components/ui/segmented";
import { useI18n } from "@/i18n/client";
import { isJournalCategory, JOURNAL_CATEGORIES } from "../classify";
import { corpWalletQueryString, JOURNAL_FLOWS, WALLET_BUCKETS, type CorpWalletFilters } from "../filters";

export function WalletFilterBar({
  filters,
  presets,
  divisions,
  showBucket = false,
  showJournalFilters = false,
}: {
  filters: CorpWalletFilters;
  presets: RangePreset[];
  divisions: { division: number; name: string }[];
  showBucket?: boolean;
  showJournalFilters?: boolean;
}) {
  const { navigate } = usePendingNavigation();
  const { t } = useI18n();
  const w = t.wallet.corp;
  const apply = (overrides: Partial<CorpWalletFilters>) => navigate(corpWalletQueryString(filters, { ...overrides, page: 1 }));
  const narrowed = filters.divisions.length > 0 || filters.categories.length > 0 || filters.flow !== "all";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <DateRangePicker from={filters.from} to={filters.to} presets={presets} onChange={(r) => apply(r)} />
      <MultiSelect
        label={w.filters.divisions}
        allLabel={t.common.multiSelect.all}
        icon={<Landmark className="size-3.5 text-accent" aria-hidden />}
        selected={filters.divisions}
        onApply={(v) => apply({ divisions: v.map(Number) })}
        options={divisions.map((d) => ({ value: d.division, label: d.name }))}
      />
      {showJournalFilters && (
        <>
          <MultiSelect
            label={w.filters.categories}
            allLabel={t.common.multiSelect.all}
            icon={<Tags className="size-3.5 text-accent" aria-hidden />}
            selected={filters.categories}
            onApply={(v) => apply({ categories: v.filter(isJournalCategory) })}
            options={JOURNAL_CATEGORIES.map((c) => ({ value: c, label: w.categories[c] }))}
          />
          <Segmented
            label={w.filters.flow}
            value={filters.flow}
            onChange={(flow) => apply({ flow })}
            options={JOURNAL_FLOWS.map((f) => ({ value: f, label: w.flows[f] }))}
          />
        </>
      )}
      {showBucket && (
        <Segmented
          label={w.filters.groupBy}
          value={filters.bucket}
          onChange={(bucket) => apply({ bucket })}
          options={WALLET_BUCKETS.map((b) => ({ value: b, label: w.buckets[b] }))}
        />
      )}
      {narrowed && (
        <button
          type="button"
          onClick={() => apply({ divisions: [], categories: [], flow: "all" })}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs text-ink-3 transition hover:bg-white/6 hover:text-ink"
        >
          <RotateCcw className="size-3.5" aria-hidden /> {w.filters.reset}
        </button>
      )}
    </div>
  );
}
