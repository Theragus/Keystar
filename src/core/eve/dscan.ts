/**
 * Directional scanner copies: one line per object,
 * "<type id>\t<name>\t<type name>\t<distance>" (distance is "-" off grid).
 * Isomorphic.
 */
export interface DscanLine {
  typeId: number;
  name: string;
  typeName: string;
  distance: string;
}

export function parseDscanLine(line: string): DscanLine | null {
  const cells = line.split("\t").map((c) => c.trim());
  if (cells.length < 3 || !/^\d+$/.test(cells[0]) || !cells[2]) return null;
  const typeId = Number(cells[0]);
  if (!Number.isSafeInteger(typeId) || typeId <= 0) return null;
  return { typeId, name: cells[1] ?? "", typeName: cells[2], distance: cells[3] ?? "" };
}

/** Counts per type of everything on a d-scan. */
export function countDscan(text: string): { entries: { typeId: number; typeName: string; count: number }[]; lines: number } {
  const byType = new Map<number, { typeId: number; typeName: string; count: number }>();
  let lines = 0;
  for (const raw of text.split(/\r?\n/)) {
    const line = parseDscanLine(raw.replace(/ /g, " "));
    if (!line) continue;
    lines++;
    const e = byType.get(line.typeId) ?? { typeId: line.typeId, typeName: line.typeName, count: 0 };
    e.count++;
    byType.set(line.typeId, e);
  }
  return { entries: [...byType.values()].sort((a, b) => b.count - a.count || a.typeName.localeCompare(b.typeName)), lines };
}
