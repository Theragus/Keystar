export function isActivePath(pathname: string, href: string, exact?: boolean) {
  return exact || href === "/" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

/** The nav item for a path: the most specific active href wins (/mining/ledger over /mining). */
export function matchNavItem<T extends { href: string; exact?: boolean }>(pathname: string, items: readonly T[]) {
  return [...items].sort((a, b) => b.href.length - a.href.length).find((i) => isActivePath(pathname, i.href, i.exact));
}
