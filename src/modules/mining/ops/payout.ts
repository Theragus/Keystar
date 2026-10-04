import type { MiningOpSplitMode } from "../schema";

/**
 * How a mining op's ore value is paid out. Pure logic. The pool is the ore
 * value at the op's rate (e.g. 90% for a buyback); the corporation keeps its
 * cut and the rest goes to the payees, by their share of the value or in
 * equal parts. A payee is a pilot: all characters of one account together.
 */

export interface PayeeInput {
  payeeCharacterId: number;
  userId: string | null;
  characterIds: number[];
  volume: number;
  /** Ore value at the valuation price, before the rate. */
  value: number;
}

export interface PayoutSettings {
  ratePct: number;
  corpCutPct: number;
  splitMode: MiningOpSplitMode;
}

export type PayeeShare<P extends PayeeInput = PayeeInput> = P & { share: number };

export interface Payout<P extends PayeeInput = PayeeInput> {
  /** Σ value. */
  gross: number;
  /** gross × rate. */
  pool: number;
  corpCut: number;
  /** pool − corp cut, in whole ISK; the shares add up to exactly this. */
  distributed: number;
  shares: PayeeShare<P>[];
}

const clampPct = (v: number) => (Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : 0);

/**
 * Splits `total` whole ISK by weight with the largest-remainder method, so
 * the parts are whole and add up to the total.
 */
export function splitWhole(total: number, weights: number[]): number[] {
  const sum = weights.reduce((s, w) => s + Math.max(0, w), 0);
  if (total <= 0 || sum <= 0) return weights.map(() => 0);
  const exact = weights.map((w) => (total * Math.max(0, w)) / sum);
  const parts = exact.map(Math.floor);
  let left = total - parts.reduce((s, p) => s + p, 0);
  const order = exact.map((e, i) => ({ i, rest: e - Math.floor(e) })).sort((a, b) => b.rest - a.rest || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    parts[i] += 1;
    left -= 1;
  }
  return parts;
}

export function computePayout<P extends PayeeInput>(payees: P[], settings: PayoutSettings): Payout<P> {
  const gross = payees.reduce((s, p) => s + Math.max(0, p.value), 0);
  const pool = (gross * clampPct(settings.ratePct)) / 100;
  const corpCut = (pool * clampPct(settings.corpCutPct)) / 100;
  const distributed = Math.max(0, Math.floor(pool - corpCut));
  const weights = payees.map((p) => (settings.splitMode === "equal" ? 1 : Math.max(0, p.value)));
  // Nobody mined anything valuable: an equal split still works, a contribution split has nothing to share.
  const parts = splitWhole(distributed, weights);
  return {
    gross,
    pool,
    corpCut,
    distributed: parts.reduce((s, p) => s + p, 0),
    shares: payees.map((p, i) => ({ ...p, share: parts[i] })),
  };
}
