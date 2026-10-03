import { and, eq, sql } from "drizzle-orm";
import type { Db } from "@/core/db";
import { ensureNames, ensureTypes } from "@/core/eve/resolver";
import type { JobDefinition } from "@/core/sync/types";
import { isoDate } from "@/lib/dates";
import { CORP_DIVISIONS_SCOPE, CORP_WALLET_SCOPE } from "../module";
import {
  corpWalletBalanceHistory,
  corpWalletDivisions,
  corpWalletJournal,
  corpWalletSyncState,
  corpWalletTransactions,
  type CorpWalletGap,
  type CorpWalletStream,
} from "../schema";
import { WALLET_DIVISIONS } from "./divisions";
import { detectGap, fetchNewCorpTransactions, fetchNewJournal } from "./fetch";

const CHUNK = 1000;

interface StreamState {
  newestId: number | null;
  newestAt: Date | null;
  lastSyncedAt: Date | null;
}

async function streamState(db: Db, corporationId: number, division: number, stream: CorpWalletStream): Promise<StreamState> {
  const table = stream === "journal" ? corpWalletJournal : corpWalletTransactions;
  const idCol = stream === "journal" ? corpWalletJournal.id : corpWalletTransactions.transactionId;
  const [[newest], [state]] = await Promise.all([
    db
      .select({ id: sql<string | null>`max(${idCol})`, at: sql<string | null>`max(${table.date})` })
      .from(table)
      .where(and(eq(table.corporationId, corporationId), eq(table.division, division))),
    db
      .select({ lastSyncedAt: corpWalletSyncState.lastSyncedAt })
      .from(corpWalletSyncState)
      .where(
        and(
          eq(corpWalletSyncState.corporationId, corporationId),
          eq(corpWalletSyncState.division, division),
          eq(corpWalletSyncState.stream, stream),
        ),
      ),
  ]);
  return {
    newestId: newest?.id == null ? null : Number(newest.id),
    newestAt: newest?.at == null ? null : new Date(newest.at),
    lastSyncedAt: state?.lastSyncedAt ?? null,
  };
}

/** Records that a stream was imported at `fetchedAt`: where its history starts and any gap this import found. */
async function recordSync(
  tx: Pick<Db, "insert">,
  key: { corporationId: number; division: number; stream: CorpWalletStream },
  fetchedAt: Date,
  oldestFetchedAt: Date | null,
  gap: { from: Date; to: Date } | null,
) {
  const gaps: CorpWalletGap[] = gap
    ? [{ from: gap.from.toISOString(), to: gap.to.toISOString(), detectedAt: fetchedAt.toISOString() }]
    : [];
  await tx
    .insert(corpWalletSyncState)
    .values({ ...key, historyStartsAt: oldestFetchedAt, lastSyncedAt: fetchedAt, gaps })
    .onConflictDoUpdate({
      target: [corpWalletSyncState.corporationId, corpWalletSyncState.division, corpWalletSyncState.stream],
      set: {
        historyStartsAt: sql`LEAST(${corpWalletSyncState.historyStartsAt}, excluded.history_starts_at)`,
        lastSyncedAt: sql`excluded.last_synced_at`,
        gaps: sql`${corpWalletSyncState.gaps} || excluded.gaps`,
      },
    });
}

/**
 * Balances, journal and market transactions of every division of the home corporation. ESI only keeps about 30 days
 * (and at most 10,000 journal entries) per division, so every run appends what is new to the archive; when an import
 * no longer reaches what is stored — no token with the Accountant role for a month, say — the hole is recorded as a
 * gap instead of silently ignored. The summary deliberately carries no ISK amounts: sync status is visible to admins
 * who may not be allowed to see the corporation's finances.
 */
export const corporationWalletsJob: JobDefinition = {
  key: "wallet.corporation-wallets",
  label: (t) => t.wallet.module.jobs.corporationWallets,
  module: "wallet",
  owner: "corporation",
  requiredScopes: [CORP_WALLET_SCOPE],
  preferredCorpRoles: ["Accountant", "Junior_Accountant"],
  // Journal and transactions are cached for an hour; balances for five minutes.
  intervalSeconds: 3600,
  async run({ esi, db, ownerId: corporationId, characterId }) {
    const now = new Date();
    const balances = await esi.get<{ division: number; balance: number }[]>(`/corporations/${corporationId}/wallets`, {
      characterId: characterId!,
      noCache: true,
    });
    const divisions = (balances.data ?? []).filter((d) => (WALLET_DIVISIONS as readonly number[]).includes(d.division));
    if (divisions.length) {
      await db
        .insert(corpWalletDivisions)
        .values(divisions.map((d) => ({ corporationId, division: d.division, balance: d.balance, balanceAt: now })))
        .onConflictDoUpdate({
          target: [corpWalletDivisions.corporationId, corpWalletDivisions.division],
          set: { balance: sql`excluded.balance`, balanceAt: sql`excluded.balance_at`, updatedAt: now },
        });
      await db
        .insert(corpWalletBalanceHistory)
        .values(divisions.map((d) => ({ corporationId, division: d.division, date: isoDate(now), balance: d.balance })))
        .onConflictDoUpdate({
          target: [corpWalletBalanceHistory.corporationId, corpWalletBalanceHistory.division, corpWalletBalanceHistory.date],
          set: { balance: sql`excluded.balance`, updatedAt: now },
        });
    }

    let journalAdded = 0;
    let transactionsAdded = 0;
    const gapDivisions = new Set<number>();
    const truncatedDivisions = new Set<number>();
    const partyIds = new Set<number>();
    const typeIds = new Set<number>();
    let nextRunAt: Date | null = null;

    for (const { division } of divisions) {
      // Journal
      const journalState = await streamState(db, corporationId, division, "journal");
      const fetchedAt = new Date();
      const journal = await fetchNewJournal(esi, corporationId, division, characterId!, journalState.newestId);
      const journalRows = journal.rows.map((e) => ({
        corporationId,
        division,
        id: e.id,
        date: new Date(e.date),
        refType: e.ref_type,
        amount: e.amount ?? null,
        balance: e.balance ?? null,
        firstPartyId: e.first_party_id ?? null,
        secondPartyId: e.second_party_id ?? null,
        contextId: e.context_id ?? null,
        contextIdType: e.context_id_type ?? null,
        reason: e.reason || null,
        description: e.description ?? "",
        tax: e.tax ?? null,
        taxReceiverId: e.tax_receiver_id ?? null,
      }));
      const oldestJournal = journalRows.length ? new Date(Math.min(...journalRows.map((r) => r.date.getTime()))) : null;
      const journalGap = detectGap({
        lastSyncedAt: journalState.lastSyncedAt,
        newestStoredAt: journalState.newestAt,
        oldestFetchedAt: oldestJournal,
        overlapped: journal.overlapped,
        truncated: journal.truncated,
        now: fetchedAt,
      });
      await db.transaction(async (tx) => {
        for (let i = 0; i < journalRows.length; i += CHUNK) {
          await tx.insert(corpWalletJournal).values(journalRows.slice(i, i + CHUNK)).onConflictDoNothing();
        }
        await recordSync(tx, { corporationId, division, stream: "journal" }, fetchedAt, oldestJournal, journalGap);
      });
      journalAdded += journalRows.filter((r) => journalState.newestId === null || r.id > journalState.newestId).length;
      if (journalGap) gapDivisions.add(division);
      if (journal.truncated) truncatedDivisions.add(division);
      for (const r of journalRows) {
        for (const id of [r.firstPartyId, r.secondPartyId, r.taxReceiverId]) if (id) partyIds.add(id);
      }
      if (journal.expiresAt && (!nextRunAt || journal.expiresAt < nextRunAt)) nextRunAt = journal.expiresAt;

      // Market transactions
      const txState = await streamState(db, corporationId, division, "transactions");
      const txFetchedAt = new Date();
      const transactions = await fetchNewCorpTransactions(esi, corporationId, division, characterId!, txState.newestId);
      const txRows = transactions.rows.map((t) => ({
        corporationId,
        division,
        transactionId: t.transaction_id,
        date: new Date(t.date),
        typeId: t.type_id,
        quantity: t.quantity,
        unitPrice: t.unit_price,
        isBuy: t.is_buy,
        clientId: t.client_id,
        locationId: t.location_id,
        journalRefId: t.journal_ref_id,
      }));
      const oldestTx = txRows.length ? new Date(Math.min(...txRows.map((r) => r.date.getTime()))) : null;
      const txGap = detectGap({
        lastSyncedAt: txState.lastSyncedAt,
        newestStoredAt: txState.newestAt,
        oldestFetchedAt: oldestTx,
        overlapped: transactions.overlapped,
        truncated: transactions.truncated,
        now: txFetchedAt,
      });
      await db.transaction(async (tx) => {
        for (let i = 0; i < txRows.length; i += CHUNK) {
          await tx.insert(corpWalletTransactions).values(txRows.slice(i, i + CHUNK)).onConflictDoNothing();
        }
        await recordSync(tx, { corporationId, division, stream: "transactions" }, txFetchedAt, oldestTx, txGap);
      });
      transactionsAdded += txRows.filter((r) => txState.newestId === null || r.transactionId > txState.newestId).length;
      if (txGap) gapDivisions.add(division);
      for (const r of txRows) {
        typeIds.add(r.typeId);
        partyIds.add(r.clientId);
      }
    }

    await ensureNames(partyIds);
    await ensureTypes(typeIds);

    const notes = [
      gapDivisions.size ? `history gap in division ${[...gapDivisions].join(", ")}` : null,
      truncatedDivisions.size ? `older entries skipped in division ${[...truncatedDivisions].join(", ")}` : null,
    ].filter(Boolean);
    return {
      summary:
        `${divisions.length} divisions, ${journalAdded} new journal entr${journalAdded === 1 ? "y" : "ies"}, ` +
        `${transactionsAdded} new transaction${transactionsAdded === 1 ? "" : "s"}${notes.length ? ` (${notes.join("; ")})` : ""}`,
      nextRunAt,
    };
  },
};

/**
 * Custom wallet division names. ESI only lists divisions that were renamed (and needs a Director); the others keep
 * their default name, which the pages take from the dictionaries.
 */
export const corporationDivisionsJob: JobDefinition = {
  key: "wallet.corporation-divisions",
  label: (t) => t.wallet.module.jobs.corporationDivisions,
  module: "wallet",
  owner: "corporation",
  requiredScopes: [CORP_DIVISIONS_SCOPE],
  intervalSeconds: 6 * 3600,
  async run({ esi, db, ownerId: corporationId, characterId }) {
    const res = await esi.get<{ wallet?: { division?: number; name?: string }[] }>(
      `/corporations/${corporationId}/divisions`,
      { characterId: characterId! },
    );
    const names = new Map<number, string>();
    for (const d of res.data?.wallet ?? []) {
      const name = d.name?.trim();
      if (d.division && name) names.set(d.division, name);
    }
    await db
      .insert(corpWalletDivisions)
      .values(WALLET_DIVISIONS.map((division) => ({ corporationId, division, name: names.get(division) ?? null })))
      .onConflictDoUpdate({
        target: [corpWalletDivisions.corporationId, corpWalletDivisions.division],
        set: { name: sql`excluded.name`, updatedAt: new Date() },
      });
    return { summary: `${names.size} renamed wallet division${names.size === 1 ? "" : "s"}`, nextRunAt: res.expiresAt };
  },
};
