import type { wallet as en } from "../en/wallet";

export const wallet: typeof en = {
  module: {
    scopes: {
      characterWallet:
        "Liest Marktkäufe und -verkäufe, damit die Mining-GuV Mining-Kosten und Verkaufspreise berücksichtigen kann (optional).",
    },
    jobs: {
      transactions: "Wallet-Transaktionen",
    },
  },
};
