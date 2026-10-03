/**
 * Supported UI languages and how the active one is chosen. Isomorphic: safe
 * for client components, server code and tests.
 *
 * The language is not part of the URL. An explicit choice (the language
 * switch) is stored in a cookie; without one, the browser's Accept-Language
 * header decides, so a German browser gets German on the very first visit.
 */
export const LOCALES = ["en", "de"] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

/** Holds an explicit language choice. Absent = follow the browser. */
export const LOCALE_COOKIE = "ks_locale";

export const LOCALE_COOKIE_MAX_AGE = 365 * 24 * 60 * 60;

/** `label` is the language's own name, so it is recognisable whichever language is active. */
export const LOCALE_META: Record<Locale, { label: string; short: string }> = {
  en: { label: "English", short: "EN" },
  de: { label: "Deutsch", short: "DE" },
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/**
 * Best supported locale for an Accept-Language header, by quality then order:
 * "de-AT,de;q=0.9,en;q=0.8" → "de", "fr-FR,fr;q=0.9" → the default.
 */
export function negotiateLocale(header: string | null | undefined): Locale {
  if (!header) return DEFAULT_LOCALE;
  const ranked = header
    .split(",")
    .map((part, index) => {
      const [tag = "", ...params] = part.trim().split(";");
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      const quality = q === undefined ? 1 : Number(q.slice(2));
      return { language: tag.trim().toLowerCase().split("-")[0], quality: Number.isFinite(quality) ? quality : 0, index };
    })
    .filter((r) => r.language && r.quality > 0)
    .sort((a, b) => b.quality - a.quality || a.index - b.index);
  return ranked.map((r) => r.language).find(isLocale) ?? DEFAULT_LOCALE;
}

/** Explicit cookie choice first, then the browser's preference. */
export function resolveLocale(cookieValue: string | undefined, acceptLanguage: string | null | undefined): Locale {
  return isLocale(cookieValue) ? cookieValue : negotiateLocale(acceptLanguage);
}
