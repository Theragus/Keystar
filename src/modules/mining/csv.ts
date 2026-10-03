/**
 * A text CSV cell (names and other free text). Quotes where needed and
 * neutralises spreadsheet formula injection: text starting with `=`, `+`, `-`
 * or `@` gets a leading `'`, even when it looks like a number.
 */
export function csvText(value: string | null): string {
  if (value === null) return "";
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) || safe !== value ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/**
 * A numeric CSV cell, written as-is so spreadsheets keep it a number (for
 * example a negative security status, `-0.45`).
 */
export function csvNumber(value: number | null, digits?: number): string {
  if (value === null) return "";
  return digits === undefined ? String(value) : value.toFixed(digits);
}
