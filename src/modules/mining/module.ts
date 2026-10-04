import { Calculator, CalendarRange, Gem, Pickaxe, ReceiptText, TableProperties } from "lucide-react";
import type { KeystarModule } from "@/core/modules/types";

export const MINING_PERMISSIONS = {
  viewOwn: "mining.view.own",
  viewCorp: "mining.view.corp",
  export: "mining.export",
  pnl: "mining.pnl",
  manageOps: "mining.ops.manage",
} as const;

export const miningModule: KeystarModule = {
  id: "mining",
  name: "Mining",
  description: "Personal and moon-observer mining ledgers with volume, value and member breakdowns.",
  scopes: [
    {
      scope: "esi-industry.read_character_mining.v1",
      level: "character",
      reason: (t) => t.mining.module.scopes.characterMining,
    },
    {
      scope: "esi-industry.read_corporation_mining.v1",
      level: "corporation",
      reason: (t) => t.mining.module.scopes.corporationMining,
      corpRoles: ["Accountant", "Director"],
    },
    {
      scope: "esi-corporations.read_structures.v1",
      level: "corporation",
      reason: (t) => t.mining.module.scopes.structures,
      corpRoles: ["Station_Manager", "Director"],
    },
  ],
  permissions: [
    {
      key: MINING_PERMISSIONS.viewOwn,
      label: (t) => t.mining.module.permissions.viewOwn.label,
      description: (t) => t.mining.module.permissions.viewOwn.description,
      group: (t) => t.mining.module.permissionGroup,
      defaultMinRole: "member",
    },
    {
      key: MINING_PERMISSIONS.viewCorp,
      label: (t) => t.mining.module.permissions.viewCorp.label,
      description: (t) => t.mining.module.permissions.viewCorp.description,
      group: (t) => t.mining.module.permissionGroup,
      defaultMinRole: "viewer",
    },
    {
      key: MINING_PERMISSIONS.export,
      label: (t) => t.mining.module.permissions.export.label,
      description: (t) => t.mining.module.permissions.export.description,
      group: (t) => t.mining.module.permissionGroup,
      defaultMinRole: "viewer",
    },
    {
      key: MINING_PERMISSIONS.pnl,
      label: (t) => t.mining.module.permissions.pnl.label,
      description: (t) => t.mining.module.permissions.pnl.description,
      group: (t) => t.mining.module.permissionGroup,
      defaultMinRole: "member",
    },
    {
      key: MINING_PERMISSIONS.manageOps,
      label: (t) => t.mining.module.permissions.manageOps.label,
      description: (t) => t.mining.module.permissions.manageOps.description,
      group: (t) => t.mining.module.permissionGroup,
      defaultMinRole: "contributor",
    },
  ],
  nav: [
    {
      id: "industry",
      label: (t) => t.mining.module.navSection,
      order: 10,
      tone: "industry",
      items: [
        { href: "/mining", label: (t) => t.mining.module.nav.overview, icon: Pickaxe, anyPermission: ["mining.view.own", "mining.view.corp"] },
        { href: "/mining/ledger", label: (t) => t.mining.module.nav.ledger, icon: TableProperties, anyPermission: ["mining.view.own", "mining.view.corp"] },
        {
          href: "/mining/ops",
          label: (t) => t.mining.module.nav.ops,
          icon: CalendarRange,
          anyPermission: ["mining.view.own", "mining.view.corp", "mining.ops.manage"],
        },
        { href: "/mining/observers", label: (t) => t.mining.module.nav.observers, icon: Gem, anyPermission: ["mining.view.corp"] },
        {
          href: "/mining/estimator",
          label: (t) => t.mining.module.nav.estimator,
          icon: Calculator,
          anyPermission: ["mining.view.own", "mining.view.corp"],
        },
        { href: "/mining/pnl", label: (t) => t.mining.module.nav.pnl, icon: ReceiptText, anyPermission: ["mining.pnl"] },
      ],
    },
  ],
};
