import type { NavSection, ScopeRequirement } from "@/core/modules/types";
import { permissionsForRole, type PermissionDef, type PermissionOverrides } from "@/core/rbac/permissions";
import { ROLES, type Role } from "@/core/rbac/roles";
import type { Messages } from "@/i18n/messages";

/*
 * The help's "Who sees what" and "Scopes" topics, computed from the module manifests and the
 * permission overrides in Settings, so the help can't drift from what Keystar enforces. Pure.
 */

/**
 * The lowest role that sees a nav item: "guest" when it needs no permission (every signed-in
 * account, like the sidebar), null when no role has any of its permissions.
 */
export function minRoleFor(
  anyPermission: readonly string[] | undefined,
  defs: readonly PermissionDef[],
  overrides: PermissionOverrides,
): Role | null {
  if (!anyPermission?.length) return "guest";
  return ROLES.find((role) => anyPermission.some((p) => permissionsForRole(role, defs, overrides).has(p))) ?? null;
}

export interface AccessRow {
  href: string;
  label: string;
  section: string;
  /** The page's help text (NavItem.help). */
  help: string;
  minRole: Role | null;
  /** The viewer may open it (the sidebar's rule). */
  allowed: boolean;
  ownDataOnly: boolean;
}

/** Every page in the sidebar, with the role it needs and whether the viewer has it. */
export function accessRows(
  sections: readonly NavSection[],
  t: Messages,
  opts: { defs: readonly PermissionDef[]; overrides: PermissionOverrides; canAny: (...permissions: string[]) => boolean },
): AccessRow[] {
  return sections.flatMap((section) =>
    section.items.map((item) => ({
      href: item.href,
      label: item.label(t),
      section: section.label(t),
      help: item.help(t),
      minRole: minRoleFor(item.anyPermission, opts.defs, opts.overrides),
      allowed: !item.anyPermission || opts.canAny(...item.anyPermission),
      ownDataOnly: Boolean(item.ownDataOnly),
    })),
  );
}

/** Who else can see a member's data, each by the permission that shows it (the texts are `help.access.visibility`). */
export const DATA_VISIBILITY = {
  account: "users.view",
  mining: "mining.view.corp",
  skills: "skills.view.corp",
  audit: "audit.view",
  scans: "intel.use",
  appraisals: "trade.appraisal",
} as const satisfies Record<string, string>;

export type DataVisibilityKey = keyof typeof DATA_VISIBILITY;

export function dataVisibility(defs: readonly PermissionDef[], overrides: PermissionOverrides): { key: DataVisibilityKey; minRole: Role | null }[] {
  return (Object.keys(DATA_VISIBILITY) as DataVisibilityKey[]).map((key) => ({
    key,
    minRole: minRoleFor([DATA_VISIBILITY[key]], defs, overrides),
  }));
}

export interface ScopeRow {
  scope: string;
  reason: string;
}

export interface ScopeGroups {
  /** Asked from everyone who registers or links a character. */
  member: ScopeRow[];
  /** Opt-in per character, switched on and off on their page. */
  optional: { href: string; label: string; scopes: ScopeRow[]; canManage: boolean }[];
  /** Only for corporation data; useful with one of the in-game roles. */
  corporation: (ScopeRow & { corpRoles: string[] })[];
}

/** The scopes Keystar can ask for, grouped by when it asks. */
export function scopeGroups(reqs: readonly ScopeRequirement[], t: Messages, can: (permission: string) => boolean): ScopeGroups {
  const once = <T extends { scope: string }>(rows: T[]) => rows.filter((r, i) => rows.findIndex((o) => o.scope === r.scope) === i);
  const row = (s: ScopeRequirement): ScopeRow => ({ scope: s.scope, reason: s.reason(t) });

  const optional = new Map<string, ScopeGroups["optional"][number]>();
  for (const s of reqs.filter((r) => r.optional)) {
    const href = s.manageHref ?? "/characters";
    const group = optional.get(href) ?? { href, label: "", scopes: [], canManage: true };
    group.scopes.push(row(s));
    // Named after its first scope ("Skill queue access"); the rows explain each scope.
    group.label ||= s.label?.(t) ?? s.scope;
    group.canManage &&= !s.managePermission || can(s.managePermission);
    optional.set(href, group);
  }

  return {
    member: once(reqs.filter((r) => r.level === "character" && !r.optional).map(row)),
    optional: [...optional.values()],
    corporation: once(reqs.filter((r) => r.level === "corporation").map((s) => ({ ...row(s), corpRoles: s.corpRoles ?? [] }))),
  };
}
