/** Grouping logic behind MultiSelect's foldable families (an ore and its grades), kept apart so it can be tested. */

export interface FamilyOption {
  value: number | string;
  group?: string;
  family?: { key: string; label: string };
}

export type OptionEntry<T> = { kind: "option"; option: T } | { kind: "family"; key: string; label: string; options: T[] };

/** Families with more than one option, keyed by family key. */
export function familiesOf<T extends FamilyOption>(options: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const o of options) {
    if (!o.family) continue;
    const members = map.get(o.family.key);
    if (members) members.push(o);
    else map.set(o.family.key, [o]);
  }
  for (const [key, members] of map) if (members.length < 2) map.delete(key);
  return map;
}

/**
 * The listed options by group, each family folded into one row. A family folds only while all of
 * its members are listed: a search that matched some grades ("II-Grade") lists those under their own names.
 */
export function groupEntries<T extends FamilyOption>(listed: T[], families: Map<string, T[]>): [string, OptionEntry<T>[]][] {
  const groups = new Map<string, OptionEntry<T>[]>();
  const rows = new Map<string, Extract<OptionEntry<T>, { kind: "family" }>>();
  for (const o of listed) {
    const g = o.group ?? "";
    let entries = groups.get(g);
    if (!entries) groups.set(g, (entries = []));
    if (!o.family || !families.has(o.family.key)) {
      entries.push({ kind: "option", option: o });
      continue;
    }
    const id = `${g}\u0000${o.family.key}`;
    const row = rows.get(id);
    if (row) row.options.push(o);
    else {
      const created = { kind: "family" as const, key: o.family.key, label: o.family.label, options: [o] };
      rows.set(id, created);
      entries.push(created);
    }
  }
  return [...groups].map(([g, entries]) => [
    g,
    entries.flatMap((e): OptionEntry<T>[] =>
      e.kind === "family" && e.options.length < (families.get(e.key)?.length ?? 0)
        ? e.options.map((option) => ({ kind: "option", option }))
        : [e],
    ),
  ]);
}

/** Families with some but not all members selected. */
export function partlyPicked<T extends FamilyOption>(families: Map<string, T[]>, selected: (number | string)[]): Set<string> {
  const keys = new Set<string>();
  for (const [key, members] of families) {
    const picked = members.filter((o) => selected.includes(o.value)).length;
    if (picked > 0 && picked < members.length) keys.add(key);
  }
  return keys;
}

/** The family's label when the selection is exactly one whole family, so the chip can read "Scordite". */
export function selectedFamilyLabel<T extends FamilyOption>(
  families: Map<string, T[]>,
  selected: (number | string)[],
): string | undefined {
  for (const members of families.values()) {
    if (members.length === selected.length && members.every((o) => selected.includes(o.value))) return members[0].family?.label;
  }
  return undefined;
}
