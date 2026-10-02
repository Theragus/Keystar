/**
 * Keystar's in-app roles. They are loosely modelled on EVE corp roles but are
 * independent of them: they control what a user can see and do in Keystar.
 *
 * Roles are strictly hierarchical — every role includes everything the roles
 * below it can do. This file is isomorphic (safe for client components).
 */
export const ROLES = ["guest", "member", "viewer", "contributor", "director", "admin"] as const;

export type Role = (typeof ROLES)[number];

export const ROLE_LEVEL: Record<Role, number> = {
  guest: 0,
  member: 10,
  viewer: 20,
  contributor: 30,
  director: 40,
  admin: 50,
};

export const ROLE_META: Record<Role, { label: string; description: string }> = {
  guest: {
    label: "Guest",
    description: "Signed in but not approved yet. Can only manage their own characters.",
  },
  member: {
    label: "Member",
    description: "Sees data from their own characters and ESI tokens only.",
  },
  viewer: {
    label: "Viewer",
    description: "Read-only access to all corporation data.",
  },
  contributor: {
    label: "Contributor",
    description: "Viewer plus shared content and manual sync triggers.",
  },
  director: {
    label: "Director",
    description: "Manages members, approvals and roles below Director.",
  },
  admin: {
    label: "Admin",
    description: "Full control, including application settings and admin assignments.",
  },
};

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export function roleAtLeast(role: Role, minimum: Role): boolean {
  return ROLE_LEVEL[role] >= ROLE_LEVEL[minimum];
}

/**
 * Whether `actor` may change the role of / disable a user that currently has
 * `target`. Admins can manage anyone; others only users strictly below them.
 */
export function canManageRole(actor: Role, target: Role): boolean {
  if (actor === "admin") return true;
  return ROLE_LEVEL[actor] > ROLE_LEVEL[target];
}

/** Roles `actor` may hand out. Admins may grant any role, others only lower ones. */
export function assignableRoles(actor: Role): Role[] {
  if (actor === "admin") return [...ROLES];
  return ROLES.filter((r) => ROLE_LEVEL[r] < ROLE_LEVEL[actor]);
}
