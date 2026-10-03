import { sql, type SQL } from "drizzle-orm";
import { getDb } from "@/core/db";
import { utcDayBounds } from "@/lib/dates";
import type { CorpWalletGap, CorpWalletStream } from "../schema";
import { categoryRefTypes, internalTransferSql, isJournalCategory, journalCategorySqlCase, type JournalCategory } from "./classify";
import type { CorpWalletFilters } from "./filters";

/**
 * Data access for the corporation wallet pages. Every query is limited to one corporation (the home corporation);
 * pages check `wallet.corp.view` before calling these.
 */

const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));
const numOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
const str = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));
const toDate = (v: unknown): Date | null =>
  v === null || v === undefined ? null : v instanceof Date ? v : new Date(String(v));

function list(values: (number | string)[]): SQL {
  return sql.join(
    values.map((v) => sql`${v}`),
    sql`, `,
  );
}

const TRANSFER_SQL = sql.raw(
  internalTransferSql({
    refType: "j.ref_type",
    firstPartyId: "j.first_party_id",
    secondPartyId: "j.second_party_id",
    corporationId: "j.corporation_id",
  }),
);
const CATEGORY_SQL = sql.raw(journalCategorySqlCase("j.ref_type"));

function divisionCond(divisions: number[]): SQL {
  return divisions.length ? sql`AND j.division IN (${list(divisions)})` : sql``;
}

export interface DivisionRow {
  division: number;
  /** Custom name; null = default name. */
  name: string | null;
  balance: number | null;
  balanceAt: Date | null;
}

export async function getDivisions(corporationId: number): Promise<DivisionRow[]> {
  const rows = await getDb().execute<Record<string, unknown>>(sql`
    SELECT division, name, balance, balance_at FROM corp_wallet_divisions
    WHERE corporation_id = ${corporationId}
    ORDER BY division`);
  return rows.map((r) => ({
    division: num(r.division),
    name: str(r.name),
    balance: numOrNull(r.balance),
    balanceAt: toDate(r.balance_at),
  }));
}

export interface SyncStateRow {
  division: number;
  stream: CorpWalletStream;
  historyStartsAt: Date | null;
  lastSyncedAt: Date | null;
  gaps: CorpWalletGap[];
}

export async function getSyncState(corporationId: number): Promise<SyncStateRow[]> {
  const rows = await getDb().execute<Record<string, unknown>>(sql`
    SELECT division, stream, history_starts_at, last_synced_at, gaps FROM corp_wallet_sync_state
    WHERE corporation_id = ${corporationId}
    ORDER BY division, stream`);
  return rows.map((r) => ({
    division: num(r.division),
    stream: String(r.stream) as CorpWalletStream,
    historyStartsAt: toDate(r.history_starts_at),
    lastSyncedAt: toDate(r.last_synced_at),
    gaps: Array.isArray(r.gaps) ? (r.gaps as CorpWalletGap[]) : [],
  }));
}

export interface DailyFlowRow {
  date: string;
  division: number;
  /** Positive entries, transfers between divisions excluded. */
  income: number;
  /** Negative entries as a positive number, transfers excluded. */
  expenses: number;
  /** ISK moved into the division from another one of the corporation's divisions. */
  transfersIn: number;
  /** ISK moved out of the division into another one, as a positive number. */
  transfersOut: number;
}

/** Income, expenses and internal transfers per EVE day and division. */
export async function getDailyFlows(corporationId: number, f: CorpWalletFilters): Promise<DailyFlowRow[]> {
  const { start, end } = utcDayBounds(f.from, f.to);
  const rows = await getDb().execute<Record<string, unknown>>(sql`
    SELECT to_char(j.date AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day, j.division,
           COALESCE(SUM(j.amount) FILTER (WHERE j.amount > 0 AND NOT ${TRANSFER_SQL}), 0) AS income,
           COALESCE(-SUM(j.amount) FILTER (WHERE j.amount < 0 AND NOT ${TRANSFER_SQL}), 0) AS expenses,
           COALESCE(SUM(j.amount) FILTER (WHERE j.amount > 0 AND ${TRANSFER_SQL}), 0) AS transfers_in,
           COALESCE(-SUM(j.amount) FILTER (WHERE j.amount < 0 AND ${TRANSFER_SQL}), 0) AS transfers_out
    FROM corp_wallet_journal j
    WHERE j.corporation_id = ${corporationId} AND j.date >= ${start} AND j.date < ${end} ${divisionCond(f.divisions)}
    GROUP BY 1, 2
    ORDER BY 1, 2`);
  return rows.map((r) => ({
    date: String(r.day),
    division: num(r.division),
    income: num(r.income),
    expenses: num(r.expenses),
    transfersIn: num(r.transfers_in),
    transfersOut: num(r.transfers_out),
  }));
}

export interface JournalRow {
  id: number;
  division: number;
  date: string;
  refType: string;
  category: JournalCategory;
  transfer: boolean;
  amount: number | null;
  balance: number | null;
  firstPartyId: number | null;
  firstPartyName: string | null;
  firstPartyCategory: string | null;
  secondPartyId: number | null;
  secondPartyName: string | null;
  secondPartyCategory: string | null;
  reason: string | null;
  description: string;
}

function journalWhere(corporationId: number, f: CorpWalletFilters): SQL {
  const { start, end } = utcDayBounds(f.from, f.to);
  const known = f.categories.filter((c) => c !== "other").flatMap((c) => categoryRefTypes(c as Exclude<JournalCategory, "other">));
  const parts = [
    ...(known.length ? [sql`j.ref_type IN (${list(known)})`] : []),
    ...(f.categories.includes("other") ? [sql`${CATEGORY_SQL} = 'other'`] : []),
  ];
  const category = parts.length ? sql`AND (${sql.join(parts, sql` OR `)})` : sql``;
  const flow =
    f.flow === "income"
      ? sql`AND j.amount > 0 AND NOT ${TRANSFER_SQL}`
      : f.flow === "expense"
        ? sql`AND j.amount < 0 AND NOT ${TRANSFER_SQL}`
        : f.flow === "transfer"
          ? sql`AND ${TRANSFER_SQL}`
          : sql``;
  return sql`j.corporation_id = ${corporationId} AND j.date >= ${start} AND j.date < ${end}
    ${divisionCond(f.divisions)} ${category} ${flow}`;
}

/** One page of the journal, newest first, with party names. */
export async function getJournal(
  corporationId: number,
  f: CorpWalletFilters,
  opts: { limit: number; offset: number },
): Promise<{ rows: JournalRow[]; total: number }> {
  const db = getDb();
  const where = journalWhere(corporationId, f);
  const [rows, count] = await Promise.all([
    db.execute<Record<string, unknown>>(sql`
      SELECT j.id, j.division, j.ref_type, j.amount, j.balance, j.first_party_id, j.second_party_id, j.reason,
             j.description, ${CATEGORY_SQL} AS category, ${TRANSFER_SQL} AS transfer,
             to_char(j.date AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS date_iso,
             p1.name AS first_party_name, p1.category AS first_party_category,
             p2.name AS second_party_name, p2.category AS second_party_category
      FROM corp_wallet_journal j
      LEFT JOIN eve_entities p1 ON p1.id = j.first_party_id
      LEFT JOIN eve_entities p2 ON p2.id = j.second_party_id
      WHERE ${where}
      ORDER BY j.date DESC, j.id DESC
      LIMIT ${opts.limit} OFFSET ${opts.offset}`),
    db.execute<Record<string, unknown>>(sql`SELECT COUNT(*)::int AS n FROM corp_wallet_journal j WHERE ${where}`),
  ]);
  return {
    total: num(count[0]?.n),
    rows: rows.map((r) => ({
      id: num(r.id),
      division: num(r.division),
      date: String(r.date_iso),
      refType: String(r.ref_type),
      category: isJournalCategory(r.category) ? r.category : "other",
      transfer: Boolean(r.transfer),
      amount: numOrNull(r.amount),
      balance: numOrNull(r.balance),
      firstPartyId: numOrNull(r.first_party_id),
      firstPartyName: str(r.first_party_name),
      firstPartyCategory: str(r.first_party_category),
      secondPartyId: numOrNull(r.second_party_id),
      secondPartyName: str(r.second_party_name),
      secondPartyCategory: str(r.second_party_category),
      reason: str(r.reason),
      description: String(r.description ?? ""),
    })),
  };
}
