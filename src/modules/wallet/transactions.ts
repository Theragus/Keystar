import type { EsiClient } from "@/core/esi/client";

export interface EsiWalletTransaction {
  transaction_id: number;
  date: string;
  type_id: number;
  quantity: number;
  unit_price: number;
  is_buy: boolean;
  is_personal: boolean;
  client_id: number;
  location_id: number;
  journal_ref_id: number;
}

export interface FetchedTransactions {
  rows: EsiWalletTransaction[];
  /** ESI requests made. */
  pages: number;
  /** Stopped at `maxPages` before reaching known (or the oldest) transactions. */
  truncated: boolean;
  expiresAt: Date | null;
}

/**
 * Wallet transactions newer than `newestStoredId`. ESI returns the latest
 * transactions (up to 2500, last 30 days); older ones are paged with
 * `from_id` ("only transactions before this id") until a batch reaches
 * transactions already stored, comes back empty or `maxPages` is hit. Wallet
 * responses bypass the ESI response cache, so deleting imported history
 * leaves no copy behind (the job runs at ESI's hourly cache interval anyway).
 */
export async function fetchNewTransactions(
  esi: EsiClient,
  characterId: number,
  newestStoredId: number | null,
  maxPages = 10,
): Promise<FetchedTransactions> {
  const path = `/characters/${characterId}/wallet/transactions`;
  const first = await esi.get<EsiWalletTransaction[]>(path, { characterId, noCache: true });
  let batch = first.data ?? [];
  const rows = [...batch];
  let pages = 1;
  let truncated = false;
  while (batch.length) {
    const cursor = Math.min(...batch.map((t) => t.transaction_id));
    if (newestStoredId !== null && cursor <= newestStoredId) break;
    if (pages >= maxPages) {
      truncated = true;
      break;
    }
    const res = await esi.get<EsiWalletTransaction[]>(path, { characterId, query: { from_id: cursor }, noCache: true });
    pages++;
    // Guard against a cursor that is ignored: only strictly older rows advance.
    batch = (res.data ?? []).filter((t) => t.transaction_id < cursor);
    rows.push(...batch);
  }
  return { rows, pages, truncated, expiresAt: first.expiresAt };
}
