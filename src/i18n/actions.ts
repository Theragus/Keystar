"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { sessionCookieOptions } from "@/core/auth/cookie";
import { isLocale, LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE } from "./config";

/**
 * Stores an explicit language choice. Works signed out too (login page).
 * Revalidating the root layout re-renders the current page and drops cached
 * pages that were rendered in the previous language.
 */
export async function setLocale(locale: string) {
  if (!isLocale(locale)) throw new Error("Unsupported language");
  (await cookies()).set(LOCALE_COOKIE, locale, sessionCookieOptions(LOCALE_COOKIE_MAX_AGE));
  revalidatePath("/", "layout");
}

/** Form variant (`<button name="locale" value="de">`), so it also works before the page has hydrated. */
export async function setLocaleFromForm(formData: FormData) {
  await setLocale(String(formData.get("locale")));
}
