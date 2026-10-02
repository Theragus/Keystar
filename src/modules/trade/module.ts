import { Scale } from "lucide-react";
import type { KeystarModule } from "@/core/modules/types";

export const TRADE_PERMISSIONS = {
  appraisal: "trade.appraisal",
} as const;

export const tradeModule: KeystarModule = {
  id: "trade",
  name: "Trade",
  description: "Appraise pasted items (cargo, contracts, fits, d-scan) at Jita 4-4 prices and share the result.",
  // Market prices are public: no ESI scopes needed.
  scopes: [],
  permissions: [
    {
      key: TRADE_PERMISSIONS.appraisal,
      label: "Use appraisals",
      description: "Appraise items at Jita prices and open appraisal links shared by others.",
      group: "Trade",
      defaultMinRole: "member",
    },
  ],
  nav: [
    {
      id: "trade",
      label: "Trade",
      order: 20,
      items: [{ href: "/trade/appraisal", label: "Appraisal", icon: Scale, anyPermission: [TRADE_PERMISSIONS.appraisal] }],
    },
  ],
};
