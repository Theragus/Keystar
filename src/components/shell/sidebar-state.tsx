"use client";

import { ChevronDown, Menu } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { NAV_SECTIONS_COOKIE, serializeClosedNavSections, SIDEBAR_COOKIE, SIDEBAR_COOKIE_MAX_AGE } from "./sidebar-config";

const SidebarContext = createContext<{
  collapsed: boolean;
  fading: boolean;
  toggle: () => void;
  closedSections: string[];
  toggleSection: (id: string) => void;
}>({
  collapsed: false,
  fading: false,
  toggle: () => {},
  closedSections: [],
  toggleSection: () => {},
});

const writeCookie = (name: string, value: string) => {
  document.cookie = `${name}=${value}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}; SameSite=Lax`;
};

/**
 * Collapsed/expanded state of the app sidebar and of its sections. The server
 * reads the cookies for the first render; toggling only writes them, so no
 * request is involved. The width changes without hiding the contents.
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
  const value = useMemo(
    () => ({ collapsed, fading: false, toggle, closedSections, toggleSection }),
    [collapsed, toggle, closedSections, toggleSection],
  );
  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>;
}

export const useSidebar = () => useContext(SidebarContext);

/** Burger button in the sidebar: collapses the sidebar to its icon rail and back. */
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
      className="grid size-8 shrink-0 place-items-center rounded-md text-ink-3 transition hover:bg-surface-contrast/[0.06] hover:text-ink"
    >
      <Menu className="size-4" aria-hidden />
    </button>
  );
}

/**
 * A sidebar section: its heading folds the links below it away. The icon rail
 * always shows every section (the heading is only an abbreviation there), and a
 * folded section's heading still takes the section colour when it holds the
 * current page (`group-has-[[aria-current=page]]` sees the hidden links).
 * The links slide open and shut like the sidebar's width; they are only
 * clipped while shut or moving, so the active marker (left of the links) and
 * focus rings show when the section is open.
 */
export function NavSectionGroup({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  const { collapsed: rail, closedSections, toggleSection } = useSidebar();
  const closed = !rail && closedSections.includes(id);
  const [prevClosed, setPrevClosed] = useState(closed);
  const [moving, setMoving] = useState(false);
  if (prevClosed !== closed) {
    setPrevClosed(closed);
    setMoving(true);
  }
  const listId = `nav-section-${id}`;
  const chars = Array.from(label);
  const headingClass =
    "eve-label flex w-full items-center pb-1.5 pl-[calc((2rem-3ch)/2)] text-2xs whitespace-nowrap text-ink-3 group-has-[[aria-current=page]]:text-[color-mix(in_srgb,var(--section)_75%,var(--color-ink-3))]";
  const text = (
    <span>
      {chars.slice(0, 3).join("")}
      <span className="group-data-[sidebar=collapsed]/shell:hidden">{chars.slice(3).join("")}</span>
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
            className={cn("ml-auto size-3 shrink-0 transition-transform duration-300 ease-out motion-reduce:transition-none", closed && "-rotate-90")}
            aria-hidden
          />
        </button>
      )}
      <div
        id={listId}
        inert={closed}
        onTransitionEnd={(e) => e.target === e.currentTarget && setMoving(false)}
        className={cn(
          "grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none",
          closed ? "grid-rows-[0fr]" : "grid-rows-[1fr]",
        )}
      >
        {/* -ml-3/pl-3 keeps the active marker inside the clip while moving. No transition
            ends under reduced motion, so `moving` must not clip there. */}
        <div className={cn("-ml-3 min-h-0 pl-3", closed ? "overflow-hidden" : moving && "overflow-hidden motion-reduce:overflow-visible")}>
          {children}
        </div>
      </div>
    </>
  );
}
