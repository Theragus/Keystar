import type { Role } from "@/core/rbac/roles";
import type { DatePresetId } from "@/lib/dates";
import type { WormholeClass } from "@/core/eve/systems";
import { FORMATTERS } from "@/lib/format";

const n = FORMATTERS.en.integer;

/** Words and UI-kit strings shared by every page. */
export const common = {
  appTagline: "Self-hosted EVE Online corporation dashboard",
  unknown: "unknown",
  never: "never",
  /** Screen-reader note on links that open in a new tab. */
  opensInNewTab: "(opens in a new tab)",
  status: {
    ok: "OK",
    error: "Error",
    warning: "Warning",
    running: "Running",
    pending: "Pending",
  },
  roles: {
    guest: { label: "Guest", description: "Signed in but not approved yet. Can only manage their own characters." },
    member: { label: "Member", description: "Sees data from their own characters and ESI tokens only." },
    viewer: { label: "Viewer", description: "Read-only access to all corporation data." },
    contributor: { label: "Contributor", description: "Viewer plus shared content and manual sync triggers." },
    director: { label: "Director", description: "Manages members, approvals and roles below Director." },
    admin: { label: "Admin", description: "Full control, including application settings and admin assignments." },
  } satisfies Record<Role, { label: string; description: string }>,
  datePresets: {
    "7d": "7 days",
    "30d": "30 days",
    "90d": "90 days",
    mtd: "This month",
    lm: "Last month",
    ytd: "Year to date",
  } satisfies Record<DatePresetId, string>,
  dateRange: {
    custom: "Custom range (EVE time)",
    from: "From",
    to: "To",
    apply: "Apply range",
  },
  systemPicker: {
    loading: "Loading systems…",
    noMatches: "No system by that name yet — it is looked up when you scan",
    empty: "The system list is still loading in the background; type the name",
    failed: "Could not load the system list; type the name",
    wormhole: "W-space",
    /** Short tag for a wormhole system's class, read from its region. */
    wormholeClass: {
      c1: "C1",
      c2: "C2",
      c3: "C3",
      c4: "C4",
      c5: "C5",
      c6: "C6",
      thera: "Thera",
      c13: "C13",
      drifter: "Drifter",
    } satisfies Record<WormholeClass, string>,
  },
  multiSelect: {
    all: "All",
    search: (label: string) => `Search ${label.toLowerCase()}…`,
    selectAll: "Select all",
    selectMatches: "Select matches",
    clear: "Clear",
    noMatches: "No matches",
    selected: (count: number) => `${n(count)} selected`,
    apply: (count: number) => (count ? `Apply (${n(count)})` : "Apply"),
  },
  delta: {
    vs: (period: string) => `vs ${period}`,
    noData: (period: string) => `No data for ${period}`,
  },
  table: {
    empty: "Nothing in this period.",
    showFewer: "Show fewer",
    showAll: (count: number) => `Show all ${n(count)}`,
  },
  copy: {
    copy: "Copy",
    copied: "Copied",
    failed: "Copy failed",
    failedHint: "Copying failed — select the text and copy it manually",
  },
  error: {
    title: "Something went wrong",
    unexpected: "An unexpected error occurred.",
    retry: "Try again",
    reference: (digest: string) => `Reference: ${digest}`,
  },
  forbidden: {
    metaTitle: "Access denied",
    title: "You don't have access to this page",
    body: "Your Keystar role doesn't include the permission this page needs. Ask a director or admin if you think this is a mistake.",
    back: "Back to dashboard",
  },
};
