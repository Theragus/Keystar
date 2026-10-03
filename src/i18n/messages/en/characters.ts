import { FORMATTERS } from "@/lib/format";

const n = FORMATTERS.en.integer;

/** My Characters page: linked characters, their ESI tokens and background syncs. */
export const characters = {
  metaTitle: "My characters",
  header: {
    eyebrow: "Account",
    title: "My Characters",
    description: "Link every character you play. Keystar only reads data through the ESI scopes listed here.",
    link: "Link a character",
  },
  card: {
    main: "Main",
    noToken: "No ESI token",
    tokenRevoked: "Token revoked",
    scopesMissing: (count: number) => `${n(count)} scope${count > 1 ? "s" : ""} missing`,
    esiActive: "ESI active",
    corporationFallback: (id: number) => `Corporation ${id}`,
    reauthorise: "Re-authorise",
    syncNow: "Sync now",
    syncNowHint: "Queue all syncs for this character now",
    makeMain: "Make main",
    remove: "Remove",
    removeHint: "Unlink and revoke this character's token",
    scopes: "Scopes",
    granted: "granted",
    missing: "missing",
    corporationScopes: (count: number) => `+ ${n(count)} corporation scope(s)`,
    backgroundSync: "Background sync",
    noJobs: "No sync jobs yet — they appear within a minute of granting scopes.",
    tokenRefreshed: (when: string) => `Token refreshed ${when}`,
  },
  corporationAccess: {
    title: "Corporation access",
    subtitle: "For directors, accountants and station managers",
    intro:
      "Corporation data such as moon-mining observers comes from one member's token who holds the right in-game role. Link that character with the additional corporation scopes:",
    link: "Link with corporation access",
  },
  privacy: {
    title: "Privacy",
    subtitle: "What Keystar stores",
    encrypted: "Refresh tokens are encrypted with AES-256-GCM before they touch the database.",
    readOnly: "Only read scopes are requested; Keystar cannot act in game.",
    removal: "Removing a character deletes its token and revokes it with CCP. Mining history stays with the corp.",
    revoke: "You can revoke access any time under Third-Party Applications on the EVE Online website.",
  },
};
