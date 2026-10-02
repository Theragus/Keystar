import type { LucideIcon } from "lucide-react";
import type { PermissionDef } from "@/core/rbac/permissions";

/**
 * The contract every Keystar feature module implements. A module declares
 * what it needs (ESI scopes, permissions) and what it offers (navigation).
 * Background jobs live separately in the module's `jobs.ts` so the web bundle
 * never pulls in worker code — see src/core/sync/types.ts.
 */
export interface ScopeRequirement {
  scope: string;
  /**
   * `character`: requested from every member when they link a character.
   * `corporation`: only requested when a director/officer links a character
   * for corporation data; usually needs an in-game corp role as well.
   */
  level: "character" | "corporation";
  reason: string;
  /** In-game corporation roles that make this scope useful (any of). */
  corpRoles?: string[];
}

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Visible if the user has any of these permissions (omit = always visible). */
  anyPermission?: string[];
}

export interface NavSection {
  id: string;
  label: string;
  order: number;
  items: NavItem[];
}

export interface KeystarModule {
  id: string;
  name: string;
  description: string;
  scopes: ScopeRequirement[];
  permissions: PermissionDef[];
  nav: NavSection[];
}
