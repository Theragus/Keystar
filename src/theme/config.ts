/** Explicit preference; preserve KeyStar's existing dark default. */
export type Theme = "dark" | "light";
export const THEME_COOKIE = "ks_theme";
export const THEME_COOKIE_MAX_AGE = 365 * 24 * 60 * 60;
export function isTheme(value: unknown): value is Theme {
  return value === "dark" || value === "light";
}
export function resolveTheme(value: unknown): Theme {
  return isTheme(value) ? value : "dark";
}
