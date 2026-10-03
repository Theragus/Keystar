import type { DateBucket } from "@/lib/dates";
import type { Formatter } from "@/lib/format";

/** "02 Oct", "28 Sep – 04 Oct" (week, long), "Sep 2026", in the viewer's language. Isomorphic. */
export function bucketLabel(b: { start: string; end: string }, bucket: DateBucket, f: Formatter, long = false): string {
  if (bucket === "month") {
    return new Date(`${b.start}T00:00:00Z`).toLocaleDateString(f.locale === "de" ? "de-DE" : "en-GB", {
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
  }
  if (bucket === "week") return long ? `${f.shortDate(b.start)} – ${f.shortDate(b.end)}` : f.shortDate(b.start);
  return f.shortDate(b.start);
}
