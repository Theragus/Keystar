import { ROLE_LEVEL, type Role } from "./roles";

/**
 * A permission is a named capability with a default minimum role. Modules
 * contribute their own permissions; admins can raise or lower the minimum role
 * per permission in Settings (except `locked` ones). Isomorphic.
 */
export interface PermissionDef {
  key: string;
  label: string;
  description: string;
  /** Grouping shown in the settings matrix (usually the module name). */
  group: string;
  defaultMinRole: Role;
  /** Locked permissions cannot be overridden (prevents admin lock-out). */
  locked?: boolean;
}

export type PermissionOverrides = Record<string, Role>;

export const CORE_PERMISSIONS = [
  {
    key: "app.settings.manage",
    label: "Manage application settings",
    description: "Change global settings, permission overrides and the home corporation.",
    group: "Core",
    defaultMinRole: "admin",
    locked: true,
  },
  {
    key: "users.view",
    label: "View users",
    description: "See all registered users, their characters and token health.",
    group: "Core",
    defaultMinRole: "director",
  },
  {
    key: "users.manage",
    label: "Manage users",
    description: "Approve guests, change roles (below your own) and disable accounts.",
    group: "Core",
    defaultMinRole: "director",
  },
  {
    key: "members.audit",
    label: "Corporation member audit",
    description: "Compare the in-game roster with registered characters and missing scopes.",
    group: "Core",
    defaultMinRole: "director",
  },
  {
    key: "audit.view",
    label: "View audit log",
    description: "Read the log of administrative actions.",
    group: "Core",
    defaultMinRole: "director",
  },
  {
    key: "sync.view",
    label: "View sync status",
    description: "See background ESI sync jobs and their errors.",
    group: "Core",
    defaultMinRole: "contributor",
  },
  {
    key: "sync.trigger",
    label: "Trigger syncs",
    description: "Queue a background ESI sync job to run immediately.",
    group: "Core",
    defaultMinRole: "contributor",
  },
] as const satisfies readonly PermissionDef[];

export function effectiveMinRole(def: PermissionDef, overrides: PermissionOverrides): Role {
  if (def.locked) return def.defaultMinRole;
  return overrides[def.key] ?? def.defaultMinRole;
}

/** Computes the full set of permission keys granted to `role`. */
export function permissionsForRole(
  role: Role,
  defs: readonly PermissionDef[],
  overrides: PermissionOverrides = {},
): Set<string> {
  const granted = new Set<string>();
  for (const def of defs) {
    if (role === "admin" || ROLE_LEVEL[role] >= ROLE_LEVEL[effectiveMinRole(def, overrides)]) {
      granted.add(def.key);
    }
  }
  return granted;
}
