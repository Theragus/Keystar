/**
 * The member audit's state lives in the URL (search, filter, page), so the
 * roster is searched and paged in the database rather than rendered whole —
 * corporations can have thousands of members. Isomorphic and pure.
 */

export const MEMBER_FILTERS = ["all", "roster", "registered", "unregistered", "esi"] as const;
export type MemberFilter = (typeof MEMBER_FILTERS)[number];

export interface MemberAuditParams {
  /** Matches character name, the owning account's main, or an exact character ID. */
  q: string;
  filter: MemberFilter;
  /** Only this Keystar account's characters (user id), for links from Users & Roles. */
  account: string | null;
  page: number;
}

export const MEMBER_PAGE_SIZE = 50;

type SearchParams = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isMemberFilter(value: unknown): value is MemberFilter {
  return typeof value === "string" && (MEMBER_FILTERS as readonly string[]).includes(value);
}

export function parseMemberAuditParams(sp: SearchParams): MemberAuditParams {
  const filter = first(sp.filter);
  const page = first(sp.page);
  const account = first(sp.account);
  return {
    q: first(sp.q).trim().slice(0, 100),
    filter: isMemberFilter(filter) ? filter : "all",
    account: UUID.test(account) ? account.toLowerCase() : null,
    page: /^\d{1,6}$/.test(page) && Number(page) > 0 ? Number(page) : 1,
  };
}

export const EMPTY_MEMBER_AUDIT: MemberAuditParams = { q: "", filter: "all", account: null, page: 1 };

/** Link to the member audit with some state changed. A new search or filter starts again at page 1. */
export function memberAuditHref(
  current: MemberAuditParams = EMPTY_MEMBER_AUDIT,
  change: Partial<MemberAuditParams> = {},
): string {
  const resets = "q" in change || "filter" in change || "account" in change;
  const next: MemberAuditParams = { ...current, ...(resets ? { page: 1 } : {}), ...change };
  const params = new URLSearchParams();
  if (next.q) params.set("q", next.q);
  if (next.filter !== "all") params.set("filter", next.filter);
  if (next.account) params.set("account", next.account);
  if (next.page > 1) params.set("page", String(next.page));
  const s = params.toString();
  return s ? `/admin/members?${s}` : "/admin/members";
}

/** Escapes LIKE wildcards so a search for "100%" or "a_b" matches literally. */
export function likePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}
