import { describe, expect, it } from "vitest";
import { matchNavItem } from "@/components/shell/nav-match";
import { accessRows, DATA_VISIBILITY, dataVisibility, minRoleFor, scopeGroups } from "@/core/help/access";
import { allPermissions, allScopeRequirements, characterScopes, navSections, optionalScopes } from "@/core/modules/registry";
import { CORE_PERMISSIONS, permissionsForRole, type PermissionDef } from "@/core/rbac/permissions";
import { ROLES, roleAtLeast } from "@/core/rbac/roles";
import { MESSAGES } from "@/i18n/messages";

const t = MESSAGES.en;
const defs: PermissionDef[] = [
  ...CORE_PERMISSIONS,
  { key: "mining.view.corp", label: () => "", description: () => "", group: () => "", defaultMinRole: "viewer" },
  { key: "mining.view.own", label: () => "", description: () => "", group: () => "", defaultMinRole: "member" },
];

describe("the role a page needs", () => {
  it("is the lowest role with any of its permissions", () => {
    expect(minRoleFor(["mining.view.corp"], defs, {})).toBe("viewer");
    expect(minRoleFor(["mining.view.own", "mining.view.corp"], defs, {})).toBe("member");
    expect(minRoleFor(["users.view"], defs, {})).toBe("director");
  });

  it("is every signed-in account without a permission, and nobody for an unknown one", () => {
    expect(minRoleFor(undefined, defs, {})).toBe("guest");
    expect(minRoleFor([], defs, {})).toBe("guest");
    expect(minRoleFor(["no.such.permission"], defs, {})).toBeNull();
  });

  it("follows the overrides in Settings, except for locked permissions", () => {
    expect(minRoleFor(["mining.view.corp"], defs, { "mining.view.corp": "director" })).toBe("director");
    expect(minRoleFor(["mining.view.corp"], defs, { "mining.view.corp": "guest" })).toBe("guest");
    expect(minRoleFor(["app.settings.manage"], defs, { "app.settings.manage": "member" })).toBe("admin");
  });
});

describe("the access table", () => {
  const all = allPermissions();
  const rows = (role: (typeof ROLES)[number], overrides = {}) => {
    const granted = permissionsForRole(role, all, overrides);
    return accessRows(navSections(), t, { defs: all, overrides, canAny: (...ps) => ps.some((p) => granted.has(p)) });
  };

  it("lists every sidebar page with its section and help", () => {
    const hrefs = navSections().flatMap((s) => s.items.map((i) => i.href));
    const table = rows("member");
    expect(table.map((r) => r.href)).toEqual(hrefs);
    for (const row of table) expect(row.label && row.section && row.help).toBeTruthy();
  });

  it.each(ROLES)("agrees with the sidebar for a %s", (role) => {
    for (const row of rows(role)) {
      // Allowed exactly when the role reaches the page's minimum role.
      expect(row.allowed, row.href).toBe(row.minRole !== null && roleAtLeast(role, row.minRole));
    }
  });

  it("marks the pages that only show the viewer's own data", () => {
    const own = rows("member").filter((r) => r.ownDataOnly).map((r) => r.href);
    expect(own).toEqual(expect.arrayContaining(["/mail", "/mining/pnl", "/industry"]));
    expect(own).not.toContain("/mining");
  });

  it("shows what the overrides allow", () => {
    const viewer = rows("viewer", { "wallet.corp.view": "viewer" }).find((r) => r.href === "/finances");
    expect(viewer).toMatchObject({ minRole: "viewer", allowed: true });
  });
});

describe("who else sees your data", () => {
  it("names a known permission for every row", () => {
    const keys = new Set(allPermissions().map((p) => p.key));
    for (const permission of Object.values(DATA_VISIBILITY)) expect(keys).toContain(permission);
  });

  it("reads the role from the effective permission", () => {
    const visibility = Object.fromEntries(dataVisibility(allPermissions(), {}).map((v) => [v.key, v.minRole]));
    expect(visibility).toMatchObject({ account: "director", mining: "viewer", audit: "director", scans: "member" });
    const overridden = Object.fromEntries(dataVisibility(allPermissions(), { "mining.view.corp": "director" }).map((v) => [v.key, v.minRole]));
    expect(overridden.mining).toBe("director");
  });
});

describe("the scopes topic", () => {
  const groups = scopeGroups(allScopeRequirements(), t, () => true);

  it("lists the scopes everyone grants", () => {
    expect(groups.member.map((s) => s.scope).sort()).toEqual(characterScopes());
  });

  it("groups the optional scopes by the page that switches them", () => {
    expect(groups.optional.flatMap((g) => g.scopes.map((s) => s.scope)).sort()).toEqual(optionalScopes());
    expect(new Set(groups.optional.map((g) => g.href)).size).toBe(groups.optional.length);
    const skills = groups.optional.find((g) => g.href === "/skills/settings");
    expect(skills?.scopes).toHaveLength(2);
    expect(skills?.label).toBe(t.skills.module.scopes.queueLabel);
  });

  it("offers the switch only with the permission to use it", () => {
    const none = scopeGroups(allScopeRequirements(), t, () => false);
    expect(none.optional.every((g) => !g.canManage)).toBe(true);
  });

  it("names the in-game roles of corporation scopes", () => {
    const mining = groups.corporation.find((s) => s.scope === "esi-industry.read_corporation_mining.v1");
    expect(mining?.corpRoles).toEqual(["Accountant", "Director"]);
    expect(new Set(groups.corporation.map((s) => s.scope)).size).toBe(groups.corporation.length);
  });
});

describe("this page's help", () => {
  const items = navSections().flatMap((s) => s.items.map((i) => ({ href: i.href })));

  it.each([
    ["/", "/"],
    ["/mining", "/mining"],
    ["/mining/ledger", "/mining/ledger"],
    ["/mining/pnl/settings", "/mining/pnl"],
    ["/industry/settings", "/industry"],
    ["/skills/settings", "/skills"],
    ["/intel/abc123/pilot/42", "/intel"],
    ["/trade/appraisal/AbC123", "/trade/appraisal"],
  ])("explains %s with %s", (pathname, href) => {
    expect(matchNavItem(pathname, items)?.href).toBe(href);
  });

  it("has nothing for pages outside the sidebar", () => {
    expect(matchNavItem("/forbidden", items)).toBeUndefined();
  });
});
