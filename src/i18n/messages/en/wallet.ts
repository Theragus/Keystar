/** Wallet module: opt-in import of character wallet transactions (used by the mining P&L). */
export const wallet = {
  module: {
    scopes: {
      characterWallet: "Reads market purchases and sales so the mining P&L can count mining costs and sale prices (opt-in).",
    },
    jobs: {
      transactions: "Wallet transactions",
    },
  },
};
