"use client";

import { Menu } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useI18n } from "@/i18n/client";
import { SIDEBAR_COOKIE, SIDEBAR_COOKIE_MAX_AGE } from "./sidebar-config";

const SidebarContext = createContext<{ collapsed: boolean; toggle: () => void }>({
  collapsed: false,
  toggle: () => {},
});

/**
 * Collapsed/expanded state of the app sidebar. The server reads the cookie for
 * the first render; toggling only writes it, so the switch is instant.
 */
export function SidebarProvider({ collapsed: initial, children }: { collapsed: boolean; children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(initial);
  const toggle = useCallback(() => {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `${SIDEBAR_COOKIE}=${next ? "collapsed" : "expanded"}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}; SameSite=Lax`;
  }, [collapsed]);
  const value = useMemo(() => ({ collapsed, toggle }), [collapsed, toggle]);
  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>;
}

export const useSidebar = () => useContext(SidebarContext);

/** Burger button in the top bar: collapses the sidebar to its icon rail and back. */
export function SidebarToggle() {
  const { t } = useI18n();
  const { collapsed, toggle } = useSidebar();
  const label = collapsed ? t.shell.sidebar.expand : t.shell.sidebar.collapse;
  return (
    <button
      type="button"
      onClick={toggle}
      aria-expanded={!collapsed}
      aria-controls="app-sidebar"
      aria-label={label}
      title={label}
      className="-ml-2 grid size-8 shrink-0 place-items-center rounded-md text-ink-3 transition hover:bg-surface-contrast/[0.06] hover:text-ink"
    >
      <Menu className="size-4" aria-hidden />
    </button>
  );
}
