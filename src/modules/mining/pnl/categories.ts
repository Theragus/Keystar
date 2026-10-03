/**
 * Mining expense categories and the auto-tagging of wallet purchases by item
 * type/group. Isomorphic. Group and type ids from ESI /universe/groups and
 * /universe/types (checked against Tranquility).
 */
export const EXPENSE_CATEGORIES = ["crystals", "fuel", "bursts", "drones", "ships", "subscription", "other"] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const EXPENSE_CATEGORY_META: Record<ExpenseCategory, { label: string; hint: string }> = {
  crystals: { label: "Mining crystals", hint: "Mining and Mercoxit mining crystals" },
  fuel: { label: "Fuel", hint: "Heavy Water for Orca / Rorqual industrial cores" },
  bursts: { label: "Burst charges", hint: "Mining Foreman burst charges" },
  drones: { label: "Mining drones", hint: "Mining, ice and excavator drones" },
  ships: { label: "Ships & fittings", hint: "Mining hulls, mining modules, rigs, compressors" },
  subscription: { label: "PLEX / Omega", hint: "Game time for mining alts" },
  other: { label: "Other", hint: "Anything else you count as a mining cost" },
};

/** Types in generic groups (Venture is a "Frigate", Pioneer a "Destroyer"); checked before groups. */
const TYPE_CATEGORIES: Record<number, ExpenseCategory> = {
  16272: "fuel", // Heavy Water
  32880: "ships", // Venture
  89240: "ships", // Pioneer
  89647: "ships", // Pioneer Consortium Issue
};

const GROUP_CATEGORIES: Record<number, ExpenseCategory> = {
  482: "crystals", // Mining Crystal
  663: "crystals", // Mercoxit Mining Crystal
  1771: "bursts", // Mining Foreman Burst Charges
  101: "drones", // Mining Drone
  463: "ships", // Mining Barge
  543: "ships", // Exhumer
  941: "ships", // Industrial Command Ship
  883: "ships", // Capital Industrial Ship
  1283: "ships", // Expedition Frigate
  54: "ships", // Mining Laser
  464: "ships", // Strip Miner
  483: "ships", // Frequency Mining Laser
  546: "ships", // Mining Upgrade
  737: "ships", // Gas Cloud Scoops
  4138: "ships", // Gas Cloud Harvesters
  904: "ships", // Rig Mining
  4174: "ships", // Compressors
  49: "ships", // Mining Survey Chipset
};

export function isExpenseCategory(value: unknown): value is ExpenseCategory {
  return typeof value === "string" && (EXPENSE_CATEGORIES as readonly string[]).includes(value);
}

/** Category a purchase is auto-tagged with, or null when it isn't an obvious mining cost. */
export function classifyPurchase(typeId: number, groupId: number | null | undefined): ExpenseCategory | null {
  return TYPE_CATEGORIES[typeId] ?? (groupId == null ? null : (GROUP_CATEGORIES[groupId] ?? null));
}

/** SQL CASE equivalent of classifyPurchase (NULL when untagged). */
export function purchaseCategorySqlCase(typeCol: string, groupCol: string): string {
  const types = Object.entries(TYPE_CATEGORIES).map(([id, c]) => `WHEN ${typeCol} = ${id} THEN '${c}'`);
  const groups = Object.entries(GROUP_CATEGORIES).map(([id, c]) => `WHEN ${groupCol} = ${id} THEN '${c}'`);
  return `CASE ${[...types, ...groups].join(" ")} ELSE NULL END`;
}

export type ExpenseStatus = "counted" | "suggested" | "excluded" | "untagged";

export const EXPENSE_STATUS_META: Record<ExpenseStatus, { label: string; hint: string }> = {
  counted: { label: "Counted", hint: "Included in your expenses" },
  suggested: { label: "Suggested", hint: "Tagged as a mining cost, waiting for you to include it" },
  excluded: { label: "Excluded", hint: "You excluded it" },
  untagged: { label: "Other purchases", hint: "Not recognised as a mining cost; tag it to count it" },
};

/**
 * Effective state of a wallet purchase. Mirrors the SQL in pnl/queries.ts:
 * your category wins over the auto-tag; your include/exclude wins over the
 * character's "count automatically" switch, which only covers tagged purchases.
 */
export function expenseStatus(input: {
  autoCategory: ExpenseCategory | null;
  overrideCategory: ExpenseCategory | null;
  overrideIncluded: boolean | null;
  autoInclude: boolean;
}): { category: ExpenseCategory | null; included: boolean; status: ExpenseStatus } {
  const category = input.overrideCategory ?? input.autoCategory;
  const included = input.overrideIncluded ?? (input.autoCategory !== null && input.autoInclude);
  const status: ExpenseStatus = included
    ? "counted"
    : input.overrideIncluded === false
      ? "excluded"
      : category === null
        ? "untagged"
        : "suggested";
  return { category, included, status };
}
