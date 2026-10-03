"use client";

import { Menu } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useI18n } from "@/i18n/client";
import { SIDEBAR_COOKIE, SIDEBAR_COOKIE_MAX_AGE } from "./sidebar-config";

/**
 * Fade-out, then resize, then fade-in. The opacity (100ms) and width (150ms)
 * transitions live on the sidebar in sidebar.tsx; FADE_MS leaves a frame of
 * slack so the new layout never shows before the contents are hidden.
 */
const FADE_MS = 120;
const RESIZE_MS = 150;

const SidebarContext = createContext<{ collapsed: boolean; fading: boolean; toggle: () => void }>({
  collapsed: false,
  fading: false,
  toggle: () => {},
});

/**
 * Collapsed/expanded state of the app sidebar. The server reads the cookie for
 * the first render; toggling only writes it, so no request is involved. The
 * contents are hidden (`fading`) while the width changes, so the labels never
 * show squeezed mid-animation.
 */
export function SidebarProvider({ collapsed: initial, children }: { collapsed: boolean; children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(initial);
  const [fading, setFading] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const toggle = useCallback(() => {
    if (timers.current.length > 0) return;
    const next = !collapsed;
    const apply = () => {
      setCollapsed(next);
      document.cookie = `${SIDEBAR_COOKIE}=${next ? "collapsed" : "expanded"}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}; SameSite=Lax`;
    };
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return apply();
    setFading(true);
    timers.current = [
      setTimeout(apply, FADE_MS),
      setTimeout(() => {
        setFading(false);
        timers.current = [];
      }, FADE_MS + RESIZE_MS),
    ];
  }, [collapsed]);

  const value = useMemo(() => ({ collapsed, fading, toggle }), [collapsed, fading, toggle]);
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
