import "server-only";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { FORMATTERS } from "@/lib/format";
import { LOCALE_COOKIE, resolveLocale, type Locale } from "./config";
import { MESSAGES } from "./messages";

/** The viewer's language: their explicit choice (cookie), otherwise the browser's Accept-Language. */
export const getLocale = cache(async (): Promise<Locale> => {
  const [cookieStore, headerList] = await Promise.all([cookies(), headers()]);
  return resolveLocale(cookieStore.get(LOCALE_COOKIE)?.value, headerList.get("accept-language"));
});

/**
 * Messages (`t`) and formatter (`f`) in the viewer's language for server
 * components, server actions, route handlers and `generateMetadata`.
 * Client components use `useI18n()` from `@/i18n/client` instead.
 */
export async function getI18n() {
  const locale = await getLocale();
  return { locale, t: MESSAGES[locale], f: FORMATTERS[locale] };
}
