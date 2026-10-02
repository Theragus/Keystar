import { Activity, Gauge, ScrollText, Settings, ShieldCheck, UserRoundCog, Users } from "lucide-react";
import { CORE_PERMISSIONS } from "@/core/rbac/permissions";
import type { KeystarModule } from "./types";

/** Built-in features: accounts, characters, administration. */
export const coreModule: KeystarModule = {
  id: "core",
  name: "Core",
  description: "Accounts, characters, ESI tokens, roles and administration.",
  scopes: [
    {
      scope: "esi-characters.read_corporation_roles.v1",
      level: "corporation",
      reason: "Detects which of your characters hold Director/Accountant roles so Keystar uses the right token.",
    },
    {
      scope: "esi-corporations.read_corporation_membership.v1",
      level: "corporation",
      reason: "Reads the corporation roster to show members who have not registered yet.",
    },
  ],
  permissions: [...CORE_PERMISSIONS],
  nav: [
    {
      id: "overview",
      label: "Overview",
      order: 0,
      items: [{ href: "/", label: "Dashboard", icon: Gauge }],
    },
    {
      id: "account",
      label: "Account",
      order: 90,
      items: [{ href: "/characters", label: "My Characters", icon: UserRoundCog }],
    },
    {
      id: "admin",
      label: "Administration",
      order: 100,
      items: [
        { href: "/admin/users", label: "Users & Roles", icon: Users, anyPermission: ["users.view"] },
        { href: "/admin/members", label: "Member Audit", icon: ShieldCheck, anyPermission: ["members.audit"] },
        { href: "/admin/sync", label: "Sync Status", icon: Activity, anyPermission: ["sync.view"] },
        { href: "/admin/settings", label: "Settings", icon: Settings, anyPermission: ["app.settings.manage"] },
        { href: "/admin/audit", label: "Audit Log", icon: ScrollText, anyPermission: ["audit.view"] },
      ],
    },
  ],
};
