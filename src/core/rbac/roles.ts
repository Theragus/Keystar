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

// Labels and descriptions live in the dictionaries: t.common.roles[role].

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
