/** Number formatting used across Keystar. Isomorphic and locale-stable. */

const compactUnits: [number, string][] = [
  [1e12, "T"],
  [1e9, "B"],
  [1e6, "M"],
  [1e3, "K"],
];

/** 1234 → "1.23K", 9_870_000 → "9.87M". */
export function compact(value: number, digits = 2): string {
  const abs = Math.abs(value);
  for (const [size, suffix] of compactUnits) {
    if (abs >= size) {
      const v = value / size;
      const d = Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 10 ? Math.max(0, digits - 1) : digits;
      return `${v.toFixed(d)}${suffix}`;
    }
  }
  return value.toFixed(abs > 0 && abs < 10 && !Number.isInteger(value) ? 1 : 0);
}

export function isk(value: number, opts: { compact?: boolean } = {}): string {
  if (opts.compact === false) return `${Math.round(value).toLocaleString("en-US")} ISK`;
  return `${compact(value)} ISK`;
}

export function integer(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

export function volume(value: number, opts: { compact?: boolean } = {}): string {
  if (opts.compact === false) return `${Math.round(value).toLocaleString("en-US")} m³`;
  return `${compact(value)} m³`;
}

export function percent(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits)}%`;
}

export function unitPrice(value: number): string {
  if (value >= 1000) return `${compact(value)} ISK`;
  return `${value.toFixed(2)} ISK`;
}

/** Change vs. previous period, or null when there is no baseline. */
export function delta(current: number, previous: number): number | null {
  if (!previous) return null;
  return (current - previous) / previous;
}

export function formatMetric(metric: "value" | "volume" | "quantity", value: number): string {
  if (metric === "value") return isk(value);
  if (metric === "volume") return volume(value);
  return compact(value);
}

export function relativeTime(date: Date | string | null | undefined, now: Date = new Date()): string {
  if (!date) return "never";
  const d = typeof date === "string" ? new Date(date) : date;
  const diff = (d.getTime() - now.getTime()) / 1000;
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (abs < 45) return diff < 0 ? "just now" : "in a few seconds";
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  return rtf.format(Math.round(diff / 86400), "day");
}

export function shortDate(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" });
}

export function dateTime(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return `${d.toISOString().slice(0, 16).replace("T", " ")} ET`;
}

/** True if `date` is within the last `ms` milliseconds (request-time check for server components). */
export function isRecent(date: Date | string | null | undefined, ms: number): boolean {
  if (!date) return false;
  const t = typeof date === "string" ? Date.parse(date) : date.getTime();
  return Date.now() - t < ms;
}
