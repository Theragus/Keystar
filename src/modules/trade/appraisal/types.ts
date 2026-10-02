/** Appraisal JSON shapes, shared by the server and the UI. Isomorphic. */
export interface AppraisalItem {
  typeId: number;
  name: string;
  quantity: number;
  /** Jita 4-4 unit prices at appraisal time (null: no market). */
  buy: number | null;
  sell: number | null;
  /** Packaged volume per unit, m³. */
  volume: number;
}

export interface AppraisalTotals {
  buy: number;
  sell: number;
  split: number;
  volume: number;
  /** Sum of quantities and number of distinct types. */
  quantity: number;
  types: number;
  /** Types without a Jita price. */
  unpriced: number;
}

export interface UnparsedLine {
  line: number;
  raw: string;
}

export function splitPrice(item: Pick<AppraisalItem, "buy" | "sell">): number | null {
  if (item.buy && item.sell) return (item.buy + item.sell) / 2;
  return item.buy ?? item.sell ?? null;
}

export function totalsOf(items: AppraisalItem[]): AppraisalTotals {
  const t: AppraisalTotals = { buy: 0, sell: 0, split: 0, volume: 0, quantity: 0, types: items.length, unpriced: 0 };
  for (const i of items) {
    t.buy += (i.buy ?? 0) * i.quantity;
    t.sell += (i.sell ?? 0) * i.quantity;
    t.split += (splitPrice(i) ?? 0) * i.quantity;
    t.volume += i.volume * i.quantity;
    t.quantity += i.quantity;
    if (i.buy === null && i.sell === null) t.unpriced += 1;
  }
  return t;
}
