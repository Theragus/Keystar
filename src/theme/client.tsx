"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Theme } from "./config";

const ThemeContext = createContext<Theme>("dark");
export function ThemeProvider({ theme, children }: { theme: Theme; children: ReactNode }) {
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}
export const useTheme = () => useContext(ThemeContext);
