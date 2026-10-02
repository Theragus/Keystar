"use client";

import { DateRangePicker, type RangePreset } from "@/components/ui/date-range";
import { usePendingNavigation } from "@/components/ui/pending";
import { killboardQueryString, type DateRange } from "../filters";

export function KillboardPeriodPicker({ period, presets }: { period: DateRange; presets: RangePreset[] }) {
  const { navigate } = usePendingNavigation();
  return (
    <DateRangePicker from={period.from} to={period.to} presets={presets} onChange={(r) => navigate(killboardQueryString(r))} />
  );
}
