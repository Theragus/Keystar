import { eq, sql } from "drizzle-orm";
import { characters } from "@/core/db/schema/core";
import { ensureTypes } from "@/core/eve/resolver";
import type { JobDefinition } from "@/core/sync/types";
import { WALLET_SCOPE } from "./module";
import { walletTransactions } from "./schema";
import { fetchNewTransactions } from "./transactions";

const CHUNK = 1000;

/**
 * Personal market transactions for characters whose owner opted in to wallet
 * import. The summary deliberately carries no ISK amounts: sync status is
 * visible to admins, wallet contents are not.
 */
export const walletTransactionsJob: JobDefinition = {
  key: "wallet.character-transactions",
  label: "Wallet transactions",
  module: "wallet",
  owner: "character",
  requiredScopes: [WALLET_SCOPE],
  // ESI caches wallet transactions for an hour.
  intervalSeconds: 3600,
  async run({ esi, db, characterId }) {
    const [owner] = await db
      .select({ userId: characters.userId })
      .from(characters)
      .where(eq(characters.characterId, characterId!));
    if (!owner) return { summary: "Character is not linked" };

    const [newest] = await db
      .select({ id: sql<string | null>`max(${walletTransactions.transactionId})` })
      .from(walletTransactions)
      .where(eq(walletTransactions.characterId, characterId!));
    const newestId = newest?.id == null ? null : Number(newest.id);

    const res = await fetchNewTransactions(esi, characterId!, newestId);
    // Corporation-wallet transactions made by this character are out of scope.
    const rows = res.rows
      .filter((t) => t.is_personal)
      .map((t) => ({
        characterId: characterId!,
        transactionId: t.transaction_id,
        userId: owner.userId,
        date: new Date(t.date),
        typeId: t.type_id,
        quantity: t.quantity,
        unitPrice: t.unit_price,
        isBuy: t.is_buy,
        clientId: t.client_id,
        locationId: t.location_id,
        journalRefId: t.journal_ref_id,
      }));
    for (let i = 0; i < rows.length; i += CHUNK) {
      await db
        .insert(walletTransactions)
        .values(rows.slice(i, i + CHUNK))
        .onConflictDoUpdate({
          target: [walletTransactions.characterId, walletTransactions.transactionId],
          set: { userId: sql`excluded.user_id` },
          setWhere: sql`${walletTransactions.userId} IS DISTINCT FROM excluded.user_id`,
        });
    }
    await ensureTypes(rows.map((r) => r.typeId));
    const added = rows.filter((r) => newestId === null || r.transactionId > newestId).length;
    return {
      summary: `${added} new transaction${added === 1 ? "" : "s"}${res.truncated ? " (older ones skipped)" : ""}`,
      nextRunAt: res.expiresAt,
    };
  },
};

export const walletJobs: JobDefinition[] = [walletTransactionsJob];
