import { Radar } from "lucide-react";
import type { KeystarModule } from "@/core/modules/types";

export const INTEL_PERMISSIONS = {
  use: "intel.use",
  ai: "intel.ai",
  manage: "intel.manage",
} as const;

export const intelModule: KeystarModule = {
  id: "intel",
  name: "Threat intel",
  description: "Threat assessment for pasted pilot lists from zKillboard, the corporation's own fights and its standings.",
  scopes: [],
  permissions: [
    {
      key: INTEL_PERMISSIONS.use,
      label: "Use threat intel",
      description: "Scan pilot lists, open shared scans and see the recently seen hostiles feed.",
      group: "Threat intel",
      defaultMinRole: "member",
    },
    {
      key: INTEL_PERMISSIONS.ai,
      label: "Use Claude for intel",
      description: "Have Claude write scan briefings, pilot dossiers and d-scan reads (uses the instance's API key).",
      group: "Threat intel",
      defaultMinRole: "member",
    },
    {
      key: INTEL_PERMISSIONS.manage,
      label: "Manage threat intel",
      description: "Delete any scan.",
      group: "Threat intel",
      defaultMinRole: "director",
    },
  ],
  nav: [
    {
      id: "combat",
      label: "Combat",
      order: 15,
      items: [{ href: "/intel", label: "Threat Intel", icon: Radar, anyPermission: [INTEL_PERMISSIONS.use] }],
    },
  ],
};
