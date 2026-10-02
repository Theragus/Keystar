"use client";

import { usePendingNavigation } from "@/components/ui/pending";
import { Segmented } from "@/components/ui/segmented";
import { miningQueryString, type MiningFilters, type MiningGroupBy } from "../filters";

export function GroupByToggle({ filters }: { filters: MiningFilters }) {
  const { navigate } = usePendingNavigation();
  return (
    <Segmented<MiningGroupBy>
      size="sm"
      label="Group miners by"
      value={filters.groupBy}
      onChange={(groupBy) => navigate(miningQueryString(filters, { groupBy }))}
      options={[
        { value: "user", label: "Pilots", title: "Group alts under their main character" },
        { value: "character", label: "Characters" },
      ]}
    />
  );
}
