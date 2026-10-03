import type { KeystarModule } from "@/core/modules/types";

export const WALLET_SCOPE = "esi-wallet.read_character_wallet.v1";

/**
 * Raw character wallet data. Wallet access is sensitive, so the scope is
 * opt-in per character (enabled from the mining P&L) rather than requested
 * from every member. Pages that use the data live in the modules that need it.
 */
export const walletModule: KeystarModule = {
  id: "wallet",
  name: "Wallet",
  description: "Character wallet transactions, imported only for characters whose owner opts in.",
  scopes: [
    {
      scope: WALLET_SCOPE,
      level: "character",
      optional: true,
      reason: (t) => t.wallet.module.scopes.characterWallet,
    },
  ],
  permissions: [],
  nav: [],
};
