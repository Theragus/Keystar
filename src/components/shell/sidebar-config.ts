/** Sidebar width preference; expanded unless the viewer collapsed it to the icon rail. */
export const SIDEBAR_COOKIE = "ks_sidebar";
export const SIDEBAR_COOKIE_MAX_AGE = 365 * 24 * 60 * 60;
export function isSidebarCollapsed(value: unknown): boolean {
  return value === "collapsed";
}
