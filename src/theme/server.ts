import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { resolveTheme, THEME_COOKIE } from "./config";

export const getTheme = cache(async () => resolveTheme((await cookies()).get(THEME_COOKIE)?.value));
