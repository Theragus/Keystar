import type { DateBucket } from "@/lib/dates";
import { shortDate } from "@/lib/format";

/** "02 Oct", "28 Sep – 04 Oct" (week, long), "Sep 2026". Isomorphic. */
export function bucketLabel(b: { start: string; end: string }, bucket: DateBucket, long = false): string {
  if (bucket === "month") {
    return new Date(`${b.start}T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
  }
  if (bucket === "week") return long ? `${shortDate(b.start)} – ${shortDate(b.end)}` : shortDate(b.start);
  return shortDate(b.start);
}
