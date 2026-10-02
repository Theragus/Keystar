import { Swords } from "lucide-react";
import type { KeystarModule } from "@/core/modules/types";

export const KILLBOARD_PERMISSIONS = {
  view: "killboard.view",
  manage: "killboard.manage",
} as const;

export const killboardModule: KeystarModule = {
  id: "killboard",
  name: "Killboard",
  description: "Combat performance of the home corporation from zKillboard, with a weekly situation report.",
  // zKillboard data is public: no ESI scopes or tokens needed.
  scopes: [],
  permissions: [
    {
      key: KILLBOARD_PERMISSIONS.view,
      label: "View killboard",
      description: "See the corporation's kills, losses, ship and pilot statistics and the situation report.",
      group: "Killboard",
      defaultMinRole: "member",
    },
    {
      key: KILLBOARD_PERMISSIONS.manage,
      label: "Manage killboard",
      description: "Rewrite the weekly situation report.",
      group: "Killboard",
      defaultMinRole: "director",
    },
  ],
  nav: [
    {
      id: "combat",
      label: "Combat",
      order: 15,
      items: [{ href: "/killboard", label: "Killboard", icon: Swords, anyPermission: [KILLBOARD_PERMISSIONS.view] }],
    },
  ],
};
