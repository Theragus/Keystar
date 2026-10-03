import { sql } from "drizzle-orm";
import {
  corpWalletBalanceHistory,
  corpWalletDivisions,
  corpWalletJournal,
  corpWalletSyncState,
  corpWalletTransactions,
  eveEntities,
  syncJobs,
  type Db,
} from "@/core/db";
import { isoDate } from "@/lib/dates";

/**
 * Demo data for the corporation wallets: 90 days of journal in three divisions — corporation tax and ESS payouts
 * into the master wallet, monthly office rent, weekly top-ups of the SRP division and its payouts, and market and
 * industry activity in the industry division — plus balances, daily balance history and archive state.
 */

const NPC = [
  { id: 1000125, name: "CONCORD", category: "corporation" },
  { id: 1000035, name: "Caldari Navy", category: "corporation" },
  { id: 1000132, name: "Secure Commerce Commission", category: "corporation" },
];

/** Real type ids (also seeded by the P&L demo) so transactions resolve. */
const SOLD = [
  { typeId: 34, price: 4.1, quantity: [2_000_000, 9_000_000] },
  { typeId: 16272, price: 640, quantity: [20_000, 90_000] },
];

const DIVISION_NAMES: Record<number, string> = { 2: "Ship Replacement", 3: "Industry" };
const START_BALANCE: Record<number, number> = { 1: 4_200_000_000, 2: 650_000_000, 3: 1_100_000_000 };

export async function seedCorpWallet(
  db: Db,
  opts: { corporationId: number; members: number[]; rand: () => number; now: Date },
): Promise<{ entries: number }> {
  const { corporationId, members, rand, now } = opts;
  const pick = <T>(list: T[]) => list[Math.floor(rand() * list.length)];
  const between = (lo: number, hi: number) => lo + rand() * (hi - lo);

  await db.insert(eveEntities).values(NPC).onConflictDoNothing();

  type Entry = typeof corpWalletJournal.$inferInsert;
  const entries: Entry[] = [];
  const transactions: (typeof corpWalletTransactions.$inferInsert)[] = [];
  const add = (division: number, at: Date, refType: string, amount: number, extra: Partial<Entry> = {}) => {
    // Later today hasn't happened yet.
    if (at > now) return;
    entries.push({ corporationId, division, id: 0, date: at, refType, amount: Math.round(amount * 100) / 100, description: "", ...extra });
  };

  const DAYS = 90;
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - DAYS * 86_400_000);
  for (let d = 0; d <= DAYS; d++) {
    const day = start.getTime() + d * 86_400_000;
    const at = (hour: number) => new Date(day + hour * 3_600_000 + Math.floor(rand() * 3_000_000));
    if (day > now.getTime()) break;
    const weekend = [0, 6].includes(new Date(day).getUTCDay());

    // Master wallet: corporation tax on members' ratting, ESS payouts, the odd donation, monthly office rent.
    for (let i = 0, n = Math.round(between(4, weekend ? 14 : 9)); i < n; i++) {
      const member = pick(members);
      add(1, at(between(10, 23)), "bounty_prize_corporation_tax", between(1_500_000, 9_000_000), {
        firstPartyId: 1000125,
        secondPartyId: corporationId,
        contextId: member,
        contextIdType: "character_id",
        description: "Corporation tax on bounty prizes",
      });
    }
    if (rand() < 0.3) {
      add(1, at(between(12, 22)), "ess_escrow_transfer", between(40_000_000, 160_000_000), {
        firstPartyId: 1000125,
        secondPartyId: corporationId,
        description: "ESS escrow payout",
      });
    }
    if (rand() < 0.08) {
      const member = pick(members);
      add(1, at(between(16, 22)), "player_donation", between(50_000_000, 300_000_000), {
        firstPartyId: member,
        secondPartyId: corporationId,
        reason: pick(["for the war chest", "SRP fund", "thanks for the fleet", "o7"]),
        description: "Donation to the corporation",
      });
    }
    if (d % 30 === 4) {
      add(1, at(11), "office_rental_fee", -between(80_000_000, 95_000_000), {
        firstPartyId: corporationId,
        secondPartyId: 1000035,
        contextId: 60003760,
        contextIdType: "station_id",
        description: "Office rental fee",
      });
    }

    // Weekly top-up of the SRP division (both legs) and its payouts to members.
    if (d % 7 === 2) {
      const amount = Math.round(between(150_000_000, 350_000_000) / 1e6) * 1e6;
      const when = at(19);
      const transfer = { firstPartyId: corporationId, secondPartyId: corporationId, reason: "SRP top-up", description: "Division transfer" };
      add(1, when, "corporation_account_withdrawal", -amount, transfer);
      add(2, when, "corporation_account_withdrawal", amount, transfer);
    }
    if (rand() < 0.35) {
      const member = pick(members);
      add(2, at(between(18, 23)), "corporation_account_withdrawal", -between(30_000_000, 140_000_000), {
        firstPartyId: corporationId,
        secondPartyId: member,
        reason: pick(["SRP Hurricane", "SRP Scimitar", "SRP Caracal", "SRP Kikimora"]),
        description: "SRP payout",
      });
    }

    // Industry division: market sales with broker fees and tax, industry job costs.
    for (let i = 0, n = Math.round(between(0, 3)); i < n; i++) {
      const item = pick(SOLD);
      const quantity = Math.round(between(item.quantity[0], item.quantity[1]));
      const unitPrice = Math.round(item.price * between(0.96, 1.04) * 100) / 100;
      const when = at(between(8, 23));
      if (when > now) continue;
      const value = quantity * unitPrice;
      add(3, when, "market_transaction", value, {
        firstPartyId: pick(members),
        secondPartyId: corporationId,
        contextIdType: "market_transaction_id",
        description: "Market: sale",
      });
      transactions.push({
        corporationId,
        division: 3,
        transactionId: 0,
        date: when,
        typeId: item.typeId,
        quantity,
        unitPrice,
        isBuy: false,
        clientId: pick(members),
        locationId: 60003760,
        journalRefId: -1,
      });
      add(3, when, "transaction_tax", -value * 0.036, { firstPartyId: corporationId, secondPartyId: 1000132, description: "Sales tax" });
      add(3, when, "brokers_fee", -value * 0.015, { firstPartyId: corporationId, secondPartyId: 1000132, description: "Broker fee" });
    }
    if (rand() < 0.5) {
      add(3, at(between(9, 20)), "industry_job_tax", -between(3_000_000, 25_000_000), {
        firstPartyId: corporationId,
        secondPartyId: 1000035,
        description: "Industry job tax",
      });
    }
  }

  // Ids in time order, running balances per division, closing balance per day.
  entries.sort((a, b) => a.date!.getTime() - b.date!.getTime());
  const balance = { ...START_BALANCE };
  const history = new Map<string, typeof corpWalletBalanceHistory.$inferInsert>();
  let id = 23_400_000_000;
  for (const e of entries) {
    e.id = id++;
    balance[e.division!] = (balance[e.division!] ?? 0) + (e.amount ?? 0);
    e.balance = Math.round(balance[e.division!] * 100) / 100;
    const date = isoDate(e.date!);
    history.set(`${e.division}-${date}`, { corporationId, division: e.division!, date, balance: e.balance });
  }
  transactions.sort((a, b) => a.date!.getTime() - b.date!.getTime());
  let txId = 6_100_000_000;
  for (const t of transactions) t.transactionId = txId++;

  for (let i = 0; i < entries.length; i += 2000) await db.insert(corpWalletJournal).values(entries.slice(i, i + 2000));
  for (let i = 0; i < transactions.length; i += 2000) await db.insert(corpWalletTransactions).values(transactions.slice(i, i + 2000));
  await db.insert(corpWalletBalanceHistory).values([...history.values()]);

  const synced = new Date(now.getTime() - 20 * 60_000);
  await db.insert(corpWalletDivisions).values(
    [1, 2, 3, 4, 5, 6, 7].map((division) => ({
      corporationId,
      division,
      name: DIVISION_NAMES[division] ?? null,
      balance: Math.round((balance[division] ?? 0) * 100) / 100,
      balanceAt: synced,
    })),
  );
  await db.insert(corpWalletSyncState).values(
    [1, 2, 3, 4, 5, 6, 7].flatMap((division) =>
      (["journal", "transactions"] as const).map((stream) => ({
        corporationId,
        division,
        stream,
        historyStartsAt: division <= 3 ? start : null,
        lastSyncedAt: synced,
      })),
    ),
  );
  await db.insert(syncJobs).values([
    {
      jobKey: "wallet.corporation-wallets",
      ownerType: "corporation",
      ownerId: corporationId,
      lastStatus: "ok",
      lastSummary: "7 divisions, 14 new journal entries, 1 new transaction",
      lastRunAt: synced,
      lastSuccessAt: synced,
      lastDurationMs: 1840,
      nextRunAt: new Date(synced.getTime() + 3_600_000),
    },
    {
      jobKey: "wallet.corporation-divisions",
      ownerType: "corporation",
      ownerId: corporationId,
      lastStatus: "ok",
      lastSummary: "2 renamed wallet divisions",
      lastRunAt: synced,
      lastSuccessAt: synced,
      lastDurationMs: 210,
      nextRunAt: new Date(synced.getTime() + 6 * 3_600_000),
    },
  ]);
  await db.execute(sql`ANALYZE corp_wallet_journal`);
  return { entries: entries.length };
}
