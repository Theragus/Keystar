/**
 * Classification of corporation wallet journal entries. Isomorphic; category labels are in the dictionaries
 * (`t.wallet.corp.categories`). Ref types from the ESI journal enum (162 values at compatibility date 2026-08-18);
 * CCP adds new ones without notice, so anything unknown is "other". Some ESI names are misspelled
 * (`allignment_based_gate_toll`, `sovereignity_bill`, `alliance_maintainance_fee`) and must stay that way.
 */
export const JOURNAL_CATEGORIES = [
  "bounties",
  "corpTax",
  "market",
  "industry",
  "planetary",
  "contracts",
  "missions",
  "rewards",
  "transfers",
  "structures",
  "character",
  "corpAdmin",
  "fines",
  "store",
  "other",
] as const;

export type JournalCategory = (typeof JOURNAL_CATEGORIES)[number];

const CATEGORY_REF_TYPES: Record<Exclude<JournalCategory, "other">, readonly string[]> = {
  bounties: [
    "bounty",
    "bounty_prize",
    "bounty_prizes",
    "bounty_reimbursement",
    "bounty_surcharge",
    "ess_escrow_transfer",
    "npc_bounty_security_tax",
  ],
  corpTax: [
    "bounty_prize_corporation_tax",
    "agent_mission_reward_corporation_tax",
    "agent_mission_time_bonus_reward_corporation_tax",
    "corporate_reward_tax",
    "daily_goal_payouts_tax",
    "freelance_jobs_reward_corporation_tax",
    "project_discovery_tax",
  ],
  market: [
    "market_transaction",
    "market_escrow",
    "brokers_fee",
    "transaction_tax",
    "market_provider_tax",
    "market_fine_paid",
    "market_security_tax",
    "player_trading",
    "item_trader_payment",
    "external_trade_delivery",
    "external_trade_freeze",
    "external_trade_thaw",
  ],
  industry: [
    "manufacturing",
    "copying",
    "researching_material_productivity",
    "researching_time_productivity",
    "researching_technology",
    "reverse_engineering",
    "reaction",
    "industry_job_tax",
    "industry_security_tax",
    "datacore_fee",
    "factory_slot_rental_fee",
    "reprocessing_tax",
  ],
  planetary: ["planetary_import_tax", "planetary_export_tax", "planetary_construction", "skyhook_claim_fee"],
  contracts: [
    "contract_auction_bid",
    "contract_auction_bid_corp",
    "contract_auction_bid_refund",
    "contract_auction_sold",
    "contract_brokers_fee",
    "contract_brokers_fee_corp",
    "contract_collateral",
    "contract_collateral_deposited_corp",
    "contract_collateral_payout",
    "contract_collateral_refund",
    "contract_deposit",
    "contract_deposit_corp",
    "contract_deposit_refund",
    "contract_deposit_sales_tax",
    "contract_price",
    "contract_price_payment_corp",
    "contract_reversal",
    "contract_reward",
    "contract_reward_deposited",
    "contract_reward_deposited_corp",
    "contract_reward_refund",
    "contract_sales_tax",
  ],
  missions: [
    "agent_donation",
    "agent_location_services",
    "agent_miscellaneous",
    "agent_mission_collateral_paid",
    "agent_mission_collateral_refunded",
    "agent_mission_reward",
    "agent_mission_time_bonus_reward",
    "agent_mission_security_tax",
    "agent_security_services",
    "agent_services_rendered",
    "agents_preward",
    "courier_mission_escrow",
    "mission_completion",
    "mission_cost",
    "mission_expiration",
    "mission_reward",
    "lp_store",
  ],
  rewards: [
    "achievement_category_milestone_reward",
    "achievement_milestone_reward",
    "air_career_program_reward",
    "campaign_objective_isk_reward",
    "corporate_reward_payout",
    "daily_challenge_reward",
    "daily_goal_payouts",
    "insurgency_corruption_contribution_reward",
    "insurgency_suppression_contribution_reward",
    "milestone_reward_payment",
    "opportunity_reward",
    "project_discovery_reward",
    "resource_wars_reward",
    "season_challenge_reward",
    "operation_bonus",
    "redeemed_isk_token",
    "project_payouts",
    "freelance_jobs_broadcasting_fee",
    "freelance_jobs_duration_fee",
    "freelance_jobs_escrow_refund",
    "freelance_jobs_reward",
    "freelance_jobs_reward_escrow",
  ],
  transfers: [
    "player_donation",
    "corporation_account_withdrawal",
    "corporation_payment",
    "corporation_bulk_payment",
    "corporation_dividend_payment",
    "corporation_liquidation",
    "shares",
    "inheritance",
    "gm_cash_transfer",
    "gm_plex_fee_refund",
  ],
  structures: [
    "office_rental_fee",
    "docking_fee",
    "sovereignity_bill",
    "infrastructure_hub_maintenance",
    "upkeep_adjustment_fee",
    "structure_gate_jump",
    "acceleration_gate_fee",
    "allignment_based_gate_toll",
    "under_construction",
    "release_of_impounded_property",
    "repair_bill",
    "asset_safety_recovery_tax",
  ],
  character: [
    "insurance",
    "clone_activation",
    "clone_transfer",
    "jump_clone_activation_fee",
    "jump_clone_installation_fee",
    "dna_modification_fee",
    "skill_purchase",
  ],
  corpAdmin: [
    "corporation_registration_fee",
    "corporation_logo_change_cost",
    "alliance_registration_fee",
    "alliance_maintainance_fee",
    "medal_creation",
    "medal_issued",
    "advertisement_listing_fee",
    "war_fee",
    "war_fee_surrender",
    "war_ally_contract",
  ],
  fines: [
    "contraband_fine",
    "security_processing_fee",
    "kill_right_fee",
    "cspa",
    "cspaofflinerefund",
    "duel_wager_escrow",
    "duel_wager_payment",
    "duel_wager_refund",
  ],
  store: [
    "store_purchase",
    "store_purchase_refund",
    "cosmetic_market_component_item_purchase",
    "cosmetic_market_skin_purchase",
    "cosmetic_market_skin_sale",
    "cosmetic_market_skin_sale_broker_fee",
    "cosmetic_market_skin_sale_tax",
    "cosmetic_market_skin_transaction",
    "flux_payout",
    "flux_tax",
    "flux_ticket_repayment",
    "flux_ticket_sale",
  ],
};

const REF_TYPE_CATEGORY = new Map<string, JournalCategory>(
  Object.entries(CATEGORY_REF_TYPES).flatMap(([category, refTypes]) =>
    refTypes.map((r) => [r, category as JournalCategory] as const),
  ),
);

/** Every ref type with a category (tests check it against the ESI enum). */
export const KNOWN_REF_TYPES: readonly string[] = [...REF_TYPE_CATEGORY.keys()];

export function isJournalCategory(value: unknown): value is JournalCategory {
  return typeof value === "string" && (JOURNAL_CATEGORIES as readonly string[]).includes(value);
}

export function journalCategory(refType: string): JournalCategory {
  return REF_TYPE_CATEGORY.get(refType) ?? "other";
}

/** Ref types of a category; "other" has none (it is everything else). */
export function categoryRefTypes(category: Exclude<JournalCategory, "other">): readonly string[] {
  return CATEGORY_REF_TYPES[category];
}

/** SQL CASE equivalent of journalCategory for a ref type column. Ref types are fixed identifiers, never user input. */
export function journalCategorySqlCase(refTypeCol: string): string {
  const whens = Object.entries(CATEGORY_REF_TYPES).map(
    ([category, refTypes]) => `WHEN ${refTypeCol} IN (${refTypes.map((r) => `'${r}'`).join(", ")}) THEN '${category}'`,
  );
  return `CASE ${whens.join(" ")} ELSE 'other' END`;
}

export interface ClassifiableEntry {
  refType: string;
  amount: number | null;
  firstPartyId: number | null;
  secondPartyId: number | null;
}

/**
 * ISK moved between two divisions of the same corporation: a withdrawal from the corporation to itself, booked as
 * a negative entry in one division and a positive one in the other. These are neither income nor expenses.
 */
export function isInternalTransfer(e: ClassifiableEntry, corporationId: number): boolean {
  return (
    e.refType === "corporation_account_withdrawal" &&
    e.firstPartyId === corporationId &&
    e.secondPartyId === corporationId
  );
}

/** SQL twin of isInternalTransfer; the columns are compared with the row's own corporation_id. */
export function internalTransferSql(t: { refType: string; firstPartyId: string; secondPartyId: string; corporationId: string }) {
  return `(${t.refType} = 'corporation_account_withdrawal' AND ${t.firstPartyId} = ${t.corporationId} AND ${t.secondPartyId} = ${t.corporationId})`;
}

export type JournalFlow = "income" | "expense" | "transfer" | "none";

/** Where an entry counts: income, expense, a transfer between own divisions, or nowhere (no amount). */
export function journalFlow(e: ClassifiableEntry, corporationId: number): JournalFlow {
  if (isInternalTransfer(e, corporationId)) return "transfer";
  if (!e.amount) return "none";
  return e.amount > 0 ? "income" : "expense";
}
