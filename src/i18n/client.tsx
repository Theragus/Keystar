"use client";

import { createContext, useContext, type ReactNode } from "react";
import { FORMATTERS } from "@/lib/format";
import { DEFAULT_LOCALE, type Locale } from "./config";
import { MESSAGES } from "./messages";

const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

/** Set once in the root layout with the locale the server rendered. */
export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

/** Messages (`t`) and formatter (`f`) in the viewer's language for client components. */
export function useI18n() {
  const locale = useContext(LocaleContext);
  return { locale, t: MESSAGES[locale], f: FORMATTERS[locale] };
}
