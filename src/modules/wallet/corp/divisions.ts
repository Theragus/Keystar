import type { Messages } from "@/i18n/messages";

/** Wallet divisions of every corporation (1 = master wallet). Isomorphic. */
export const WALLET_DIVISIONS = [1, 2, 3, 4, 5, 6, 7] as const;

/** A division's custom name, or its default name in the viewer's language. */
export function divisionName(t: Messages, division: number, name: string | null | undefined): string {
  return name?.trim() || t.wallet.corp.defaultDivisionName(division);
}
