"use client";

import { Menu, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useI18n } from "@/i18n/client";
import { SIDEBAR_COOKIE, SIDEBAR_COOKIE_MAX_AGE } from "./sidebar-config";

/** Below this width the sidebar is an off-canvas drawer (Tailwind's `md`). */
export const DESKTOP_QUERY = "(min-width: 48rem)";

const SidebarContext = createContext<{
  collapsed: boolean;
  fading: boolean;
  toggle: () => void;
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
}>({
  collapsed: false,
  fading: false,
  toggle: () => {},
  mobileOpen: false,
  setMobileOpen: () => {},
});

/**
 * Collapsed/expanded state of the app sidebar. The server reads the cookie for
 * the first render; toggling only writes it, so no request is involved. The
 * width changes without hiding the contents.
 *
 * On phones the sidebar is a drawer instead (`mobileOpen`): it closes on
 * navigation, Escape, or when the window grows to desktop width, and locks
 * page scrolling while open.
 */
export function SidebarProvider({ collapsed: initial, children }: { collapsed: boolean; children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(initial);
  const toggle = useCallback(() => {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `${SIDEBAR_COOKIE}=${next ? "collapsed" : "expanded"}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}; SameSite=Lax`;
  }, [collapsed]);

  const pathname = usePathname();
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  // Navigating closes the drawer.
  const mobileOpen = openedAt === pathname;
  const setMobileOpen = useCallback((open: boolean) => setOpenedAt(open ? pathname : null), [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const close = () => setOpenedAt(null);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    const desktop = window.matchMedia(DESKTOP_QUERY);
    const onResize = () => desktop.matches && close();
    window.addEventListener("keydown", onKey);
    desktop.addEventListener("change", onResize);
    const root = document.documentElement;
    const overflow = root.style.overflow;
    root.style.overflow = "hidden";
    document.getElementById("app-sidebar-close")?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      desktop.removeEventListener("change", onResize);
      root.style.overflow = overflow;
    };
  }, [mobileOpen]);

  const value = useMemo(
    () => ({ collapsed, fading: false, toggle, mobileOpen, setMobileOpen }),
    [collapsed, toggle, mobileOpen, setMobileOpen],
  );
  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>;
}

export const useSidebar = () => useContext(SidebarContext);

const iconButton =
  "grid size-8 shrink-0 place-items-center rounded-md text-ink-3 transition hover:bg-surface-contrast/[0.06] hover:text-ink";

/**
 * Burger button in the sidebar: collapses the sidebar to its icon rail and back.
 * On phones it is replaced by a button that closes the drawer.
 */
export function SidebarToggle() {
  const { t } = useI18n();
  const { collapsed, toggle, setMobileOpen } = useSidebar();
  const label = collapsed ? t.shell.sidebar.expand : t.shell.sidebar.collapse;
  return (
    <>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={!collapsed}
        aria-controls="app-sidebar"
        aria-label={label}
        title={label}
        className={`${iconButton} max-md:hidden`}
      >
        <Menu className="size-4" aria-hidden />
      </button>
      <button
        id="app-sidebar-close"
        type="button"
        onClick={() => setMobileOpen(false)}
        aria-controls="app-sidebar"
        aria-label={t.shell.sidebar.closeMenu}
        className={`${iconButton} md:hidden`}
      >
        <X className="size-4" aria-hidden />
      </button>
    </>
  );
}

/** Top-bar burger on phones: opens the sidebar drawer. */
export function MobileNavButton() {
  const { t } = useI18n();
  const { mobileOpen, setMobileOpen } = useSidebar();
  return (
    <button
      type="button"
      onClick={() => setMobileOpen(true)}
      aria-expanded={mobileOpen}
      aria-controls="app-sidebar"
      aria-label={t.shell.sidebar.openMenu}
      className={`${iconButton} -ml-1 md:hidden`}
    >
      <Menu className="size-4" aria-hidden />
    </button>
  );
}

/** Dims the page behind the open drawer; tapping it closes the drawer. */
export function MobileNavBackdrop() {
  const { t } = useI18n();
  const { mobileOpen, setMobileOpen } = useSidebar();
  if (!mobileOpen) return null;
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={t.shell.sidebar.closeMenu}
      onClick={() => setMobileOpen(false)}
      className="fixed inset-0 z-45 bg-black/50 md:hidden"
    />
  );
}
