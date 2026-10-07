"use client";

import { ChevronDown, Menu, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { NAV_SECTIONS_COOKIE, serializeClosedNavSections, SIDEBAR_COOKIE, SIDEBAR_COOKIE_MAX_AGE } from "./sidebar-config";

/** Below this width the sidebar is an off-canvas drawer (Tailwind's `md`). */
export const DESKTOP_QUERY = "(min-width: 48rem)";

const SidebarContext = createContext<{
  collapsed: boolean;
  fading: boolean;
  toggle: () => void;
  closedSections: string[];
  toggleSection: (id: string) => void;
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
}>({
  collapsed: false,
  fading: false,
  toggle: () => {},
  closedSections: [],
  toggleSection: () => {},
  mobileOpen: false,
  setMobileOpen: () => {},
});

const writeCookie = (name: string, value: string) => {
  document.cookie = `${name}=${value}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}; SameSite=Lax`;
};

/**
 * Collapsed/expanded state of the app sidebar and of its sections. The server
 * reads the cookies for the first render; toggling only writes them, so no
 * request is involved. The width changes without hiding the contents.
 *
 * On phones the sidebar is a drawer instead (`mobileOpen`): it closes on
 * navigation, Escape, or when the window grows to desktop width, and locks
 * page scrolling while open.
 */
export function SidebarProvider({
  collapsed: initial,
  closedSections: initialClosed = [],
  children,
}: {
  collapsed: boolean;
  closedSections?: string[];
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(initial);
  const [closedSections, setClosedSections] = useState(initialClosed);
  const toggle = useCallback(() => {
    const next = !collapsed;
    setCollapsed(next);
    writeCookie(SIDEBAR_COOKIE, next ? "collapsed" : "expanded");
  }, [collapsed]);
  const toggleSection = useCallback(
    (id: string) => {
      const next = closedSections.includes(id) ? closedSections.filter((s) => s !== id) : [...closedSections, id];
      setClosedSections(next);
      writeCookie(NAV_SECTIONS_COOKIE, serializeClosedNavSections(next));
    },
    [closedSections],
  );

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
    () => ({ collapsed, fading: false, toggle, closedSections, toggleSection, mobileOpen, setMobileOpen }),
    [collapsed, toggle, closedSections, toggleSection, mobileOpen, setMobileOpen],
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

/**
 * A sidebar section: its heading folds the links below it away. The icon rail
 * always shows every section (the heading is only an abbreviation there), and a
 * folded section's heading still takes the section colour when it holds the
 * current page (`group-has-[[aria-current=page]]` sees the hidden links).
 */
export function NavSectionGroup({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  const { collapsed: rail, closedSections, toggleSection } = useSidebar();
  const closed = !rail && closedSections.includes(id);
  const listId = `nav-section-${id}`;
  const chars = Array.from(label);
  const headingClass =
    "eve-label flex w-full items-center pb-1.5 pl-[calc((2rem-3ch)/2)] text-2xs whitespace-nowrap text-ink-3 group-has-[[aria-current=page]]:text-[color-mix(in_srgb,var(--section)_75%,var(--color-ink-3))]";
  const text = (
    <span>
      {chars.slice(0, 3).join("")}
      <span className="md:group-data-[sidebar=collapsed]/shell:hidden">{chars.slice(3).join("")}</span>
    </span>
  );
  return (
    <>
      {rail ? (
        <div className={headingClass} title={label}>
          {text}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => toggleSection(id)}
          aria-expanded={!closed}
          aria-controls={listId}
          className={cn(headingClass, "rounded-sm pr-1 text-left transition-colors hover:text-ink-2")}
        >
          {text}
          <ChevronDown
            className={cn("ml-auto size-3 shrink-0 transition-transform duration-150 motion-reduce:transition-none", closed && "-rotate-90")}
            aria-hidden
          />
        </button>
      )}
      <div id={listId} hidden={closed}>
        {children}
      </div>
    </>
  );
}
