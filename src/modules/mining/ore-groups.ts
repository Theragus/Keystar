import { oreGrade } from "./estimator/parse";
import type { TypeRow } from "./queries";

/** A table row: one type, or one ore family with its grades and variants combined. */
export interface OreRow extends TypeRow {
  key: string;
  typeIds: number[];
}

export const singleOreRow = (r: TypeRow): OreRow => ({ ...r, key: String(r.typeId), typeIds: [r.typeId] });

/** Combines the grades and variants of each ore (Scordite, Scordite II-Grade, …) into one row named after the family. */
export function groupOreTypes(rows: TypeRow[]): OreRow[] {
  const families = new Map<string, { rank: number; first: TypeRow; row: OreRow }>();
  for (const r of rows) {
    const { base, rank } = oreGrade(r.name);
    const key = `${r.oreClass}:${base}`;
    const family = families.get(key);
    if (!family) {
      families.set(key, { rank, first: r, row: { ...r, name: base, key, typeIds: [r.typeId] } });
      continue;
    }
    const row = family.row;
    // The icon is the lowest grade's, i.e. the plain ore.
    if (rank < family.rank) {
      family.rank = rank;
      row.typeId = r.typeId;
    }
    row.typeIds.push(r.typeId);
    row.quantity += r.quantity;
    row.volume += r.volume;
    row.value += r.value;
    row.groupName ??= r.groupName;
  }
  return [...families.values()].map(({ first, row }) =>
    row.typeIds.length > 1
      ? { ...row, unitPrice: row.quantity && row.value ? row.value / row.quantity : 0 }
      : { ...singleOreRow(first), key: row.key },
  );
}

export interface OreMix {
  /** The largest ore families by the metric, largest first. */
  top: OreRow[];
  /** Everything below the cut-off, combined. */
  rest: { amount: number; count: number; typeIds: number[] };
  total: number;
}

/** Ore families ranked by `metric` for the ore mix chart: the top `limit`, then the rest as one bucket. */
export function oreMix(rows: TypeRow[], metric: "value" | "volume" | "quantity", limit = 12): OreMix {
  const ranked = groupOreTypes(rows)
    .filter((r) => r[metric] > 0)
    .sort((a, b) => b[metric] - a[metric] || a.name.localeCompare(b.name));
  // A rest bucket of one family is no shorter than showing it.
  const cut = ranked.length === limit + 1 ? ranked.length : limit;
  const top = ranked.slice(0, cut);
  const others = ranked.slice(cut);
  return {
    top,
    rest: {
      amount: others.reduce((s, r) => s + r[metric], 0),
      count: others.length,
      typeIds: others.flatMap((r) => r.typeIds),
    },
    total: ranked.reduce((s, r) => s + r[metric], 0),
  };
}
