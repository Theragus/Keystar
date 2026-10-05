import { Telescope, Waypoints } from "lucide-react";
import type { KeystarModule } from "@/core/modules/types";

export const WH_PERMISSIONS = {
  view: "wormholes.view",
  edit: "wormholes.edit",
  manage: "wormholes.manage",
} as const;

export const wormholesModule: KeystarModule = {
  id: "wormholes",
  name: "Wormholes",
  description: "A shared map of the corporation's wormhole chain and a lookup for wormhole systems.",
  scopes: [],
  permissions: [
    {
      key: WH_PERMISSIONS.view,
      label: (t) => t.wormholes.module.permissions.view.label,
      description: (t) => t.wormholes.module.permissions.view.description,
      group: (t) => t.wormholes.module.permissionGroup,
      defaultMinRole: "member",
    },
    {
      key: WH_PERMISSIONS.edit,
      label: (t) => t.wormholes.module.permissions.edit.label,
      description: (t) => t.wormholes.module.permissions.edit.description,
      group: (t) => t.wormholes.module.permissionGroup,
      defaultMinRole: "member",
    },
    {
      key: WH_PERMISSIONS.manage,
      label: (t) => t.wormholes.module.permissions.manage.label,
      description: (t) => t.wormholes.module.permissions.manage.description,
      group: (t) => t.wormholes.module.permissionGroup,
      defaultMinRole: "director",
    },
  ],
  nav: [
    {
      id: "exploration",
      label: (t) => t.wormholes.module.navSection,
      order: 17,
      items: [
        { href: "/wormholes", label: (t) => t.wormholes.module.nav.map, icon: Waypoints, anyPermission: [WH_PERMISSIONS.view] },
        {
          href: "/wormholes/systems",
          label: (t) => t.wormholes.module.nav.lookup,
          icon: Telescope,
          anyPermission: [WH_PERMISSIONS.view],
        },
      ],
    },
  ],
};
