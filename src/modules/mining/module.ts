import { Calculator, Gem, Pickaxe, TableProperties } from "lucide-react";
import type { KeystarModule } from "@/core/modules/types";

export const MINING_PERMISSIONS = {
  viewOwn: "mining.view.own",
  viewCorp: "mining.view.corp",
  export: "mining.export",
} as const;

export const miningModule: KeystarModule = {
  id: "mining",
  name: "Mining",
  description: "Personal and moon-observer mining ledgers with volume, value and member breakdowns.",
  scopes: [
    {
      scope: "esi-industry.read_character_mining.v1",
      level: "character",
      reason: "Reads your personal mining ledger (all ore, ice, gas and moon mining, last 30 days).",
    },
    {
      scope: "esi-industry.read_corporation_mining.v1",
      level: "corporation",
      reason: "Reads moon-mining observers of corporation refineries.",
      corpRoles: ["Accountant", "Director"],
    },
    {
      scope: "esi-corporations.read_structures.v1",
      level: "corporation",
      reason: "Names refineries in the observer view.",
      corpRoles: ["Station_Manager", "Director"],
    },
  ],
  permissions: [
    {
      key: MINING_PERMISSIONS.viewOwn,
      label: "View own mining",
      description: "See the mining ledger of your own characters.",
      group: "Mining",
      defaultMinRole: "member",
    },
    {
      key: MINING_PERMISSIONS.viewCorp,
      label: "View corporation mining",
      description: "See mining of all members and refinery observers.",
      group: "Mining",
      defaultMinRole: "viewer",
    },
    {
      key: MINING_PERMISSIONS.export,
      label: "Export mining data",
      description: "Download ledgers as CSV.",
      group: "Mining",
      defaultMinRole: "viewer",
    },
  ],
  nav: [
    {
      id: "industry",
      label: "Industry",
      order: 10,
      items: [
        { href: "/mining", label: "Mining Overview", icon: Pickaxe, anyPermission: ["mining.view.own", "mining.view.corp"] },
        { href: "/mining/ledger", label: "Mining Ledger", icon: TableProperties, anyPermission: ["mining.view.own", "mining.view.corp"] },
        { href: "/mining/observers", label: "Moon Observers", icon: Gem, anyPermission: ["mining.view.corp"] },
        {
          href: "/mining/estimator",
          label: "Field Estimator",
          icon: Calculator,
          anyPermission: ["mining.view.own", "mining.view.corp"],
        },
      ],
    },
  ],
};
