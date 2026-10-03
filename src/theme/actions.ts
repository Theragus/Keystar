"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { sessionCookieOptions } from "@/core/auth/cookie";
import { isTheme, THEME_COOKIE, THEME_COOKIE_MAX_AGE } from "./config";

/** A display preference only: available on signed-out pages as well. */
export async function setThemeFromForm(form: FormData) {
  const theme = form.get("theme");
  if (!isTheme(theme)) throw new Error("Unsupported theme");
  (await cookies()).set(THEME_COOKIE, theme, sessionCookieOptions(THEME_COOKIE_MAX_AGE));
  revalidatePath("/", "layout");
}
