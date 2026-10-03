import { ROLE_LEVEL, type Role } from "@/core/rbac/roles";

export interface RolePolicyInput {
  characterId: number;
  corporationId: number;
  allianceId: number | null;
  /** ADMIN_CHARACTER_IDS from the environment. */
  adminCharacterIds: number[];
  /** Whether any user account exists yet (disabled ones included). */
  hasUsers: boolean;
  homeCorporationId: number | null;
  homeAllianceId: number | null;
  autoApproveCorpMembers: boolean;
  autoApproveAllianceMembers: boolean;
}

/**
 * The role a character should have based on configuration alone.
 * - Characters in ADMIN_CHARACTER_IDS are always admins.
 * - If no admin list is configured, the very first user ever becomes admin.
 * - Home corp (and optionally alliance) members are auto-approved as members.
 * - Everyone else starts as a guest awaiting approval.
 */
export function policyRole(input: RolePolicyInput): Role {
  if (input.adminCharacterIds.includes(input.characterId)) return "admin";
  if (!input.hasUsers && input.adminCharacterIds.length === 0) return "admin";
  if (input.autoApproveCorpMembers && input.homeCorporationId && input.corporationId === input.homeCorporationId) {
    return "member";
  }
  if (
    input.autoApproveAllianceMembers &&
    input.homeAllianceId &&
    input.allianceId &&
    input.allianceId === input.homeAllianceId
  ) {
    return "member";
  }
  return "guest";
}

/**
 * On login of an existing user: never demote, but promote when policy now
 * grants more (e.g. a guest who joined the home corp, or a configured admin).
 */
export function reconcileRole(current: Role, policy: Role): Role {
  if (policy === "admin" && current !== "admin") return "admin";
  if (current === "guest" && ROLE_LEVEL[policy] > ROLE_LEVEL[current]) return policy;
  return current;
}
