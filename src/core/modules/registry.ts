import { killboardModule } from "@/modules/killboard/module";
import { miningModule } from "@/modules/mining/module";
import type { PermissionDef } from "@/core/rbac/permissions";
import { coreModule } from "./core-module";
import type { KeystarModule, NavSection, ScopeRequirement } from "./types";

/**
 * Every enabled module. To add a feature (skills, assets, wallets …) create
 * src/modules/<name>/module.ts and list it here; register its jobs in
 * src/modules/jobs.ts. See docs/modules.md.
 */
export const MODULES: KeystarModule[] = [coreModule, miningModule, killboardModule];

export function allPermissions(): PermissionDef[] {
  return MODULES.flatMap((m) => m.permissions);
}

export function allScopeRequirements(): (ScopeRequirement & { module: string })[] {
  return MODULES.flatMap((m) => m.scopes.map((s) => ({ ...s, module: m.name })));
}

/** Scopes every member grants when linking a character. */
export function characterScopes(): string[] {
  return [...new Set(allScopeRequirements().filter((s) => s.level === "character").map((s) => s.scope))].sort();
}

/** Character scopes plus corporation-level scopes for directors/accountants. */
export function corporationScopes(): string[] {
  return [...new Set(allScopeRequirements().map((s) => s.scope))].sort();
}

export function navSections(): NavSection[] {
  const byId = new Map<string, NavSection>();
  for (const m of MODULES) {
    for (const section of m.nav) {
      const existing = byId.get(section.id);
      if (existing) existing.items.push(...section.items);
      else byId.set(section.id, { ...section, items: [...section.items] });
    }
  }
  return [...byId.values()].sort((a, b) => a.order - b.order);
}
