"use client";

import { usePendingNavigation } from "@/components/ui/pending";
import { Segmented } from "@/components/ui/segmented";
import { useI18n } from "@/i18n/client";
import { miningQueryString, type MiningFilters, type MiningGroupBy } from "../filters";

export function GroupByToggle({ filters }: { filters: MiningFilters }) {
  const { t } = useI18n();
  const { navigate } = usePendingNavigation();
  return (
    <Segmented<MiningGroupBy>
      size="sm"
      label={t.mining.groupBy.label}
      value={filters.groupBy}
      onChange={(groupBy) => navigate(miningQueryString(filters, { groupBy }))}
      options={[
        { value: "user", label: t.mining.groupBy.pilots, title: t.mining.groupBy.pilotsHint },
        { value: "character", label: t.mining.groupBy.characters },
      ]}
    />
  );
}
