import { Wrench } from "lucide-react";
import type { KeystarModule } from "@/core/modules/types";

/** Saved fittings of the character (GET /characters/{id}/fittings), opt-in per character. */
export const FITTINGS_SCOPE = "esi-fittings.read_fittings.v1";
export const FITTING_HREF = "/fitting";
export const FITTING_MANAGE_HREF = "/fitting/settings";

export const FITTING_PERMISSIONS = {
  use: "fitting.use",
} as const;

/**
 * Fitting: a ship fitting calculator in the browser (EVEShipFit's dogma engine as WebAssembly with the patched SDE),
 * with the viewer's characters' skills from the skills module and their in-game saved fittings from ESI (opt-in).
 */
export const fittingModule: KeystarModule = {
  id: "fitting",
  name: "Fitting",
  description: "Ship fitting calculator with the characters' skills and their in-game saved fittings.",
  scopes: [
    {
      scope: FITTINGS_SCOPE,
      level: "character",
      optional: true,
      manageHref: FITTING_MANAGE_HREF,
      managePermission: FITTING_PERMISSIONS.use,
      reason: (t) => t.fitting.module.scopes.fittings,
      label: (t) => t.fitting.module.scopes.fittingsLabel,
    },
  ],
  permissions: [
    {
      key: FITTING_PERMISSIONS.use,
      label: (t) => t.fitting.module.permissions.use.label,
      description: (t) => t.fitting.module.permissions.use.description,
      group: (t) => t.fitting.module.permissionGroup,
      defaultMinRole: "member",
    },
  ],
  nav: [
    {
      id: "pilots",
      label: (t) => t.fitting.module.navSection,
      order: 5,
      tone: "pilots",
      items: [
        {
          href: FITTING_HREF,
          label: (t) => t.fitting.module.nav.tool,
          icon: Wrench,
          help: (t) => t.fitting.module.help.tool,
          anyPermission: [FITTING_PERMISSIONS.use],
        },
      ],
    },
  ],
};
