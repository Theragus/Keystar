"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { useMemo, useState } from "react";
import { Portrait, TypeIcon } from "@/components/ui/eve-image";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { DeltaChip } from "./deltas";

/**
 * Client-side sortable table. Columns are described as data
 * (not render functions) so server components can pass them in.
 */
export type CellFormat = "int" | "isk" | "unitIsk" | "signedIsk" | "pct" | "delta" | "deltaInverse" | "ratio" | "m3";

export interface Column {
  key: string;
  label: string;
  format: CellFormat;
  /** For "ratio": the key of the denominator shown after the slash. */
  ratioKey?: string;
  title?: string;
}

export interface EntityRow {
  id: number;
  name: string;
  /** Character portrait or item icon. */
  image: "portrait" | "type";
  href: string;
  values: Record<string, number | null>;
}

function Cell({ row, col }: { row: EntityRow; col: Column }) {
  const { f } = useI18n();
  const v = row.values[col.key];
  if (v === null || v === undefined) return <span className="text-ink-3">—</span>;
  switch (col.format) {
    case "int":
      return <>{f.integer(v)}</>;
    case "isk":
      return <span className="text-ink-2">{v ? f.compact(v) : "0"}</span>;
    case "unitIsk":
      return <span className="text-ink-2">{f.unitPrice(v).replace(" ISK", "")}</span>;
    case "signedIsk":
      return (
        <span className={cn("font-semibold", v > 0 ? "text-good-text" : v < 0 ? "text-critical-text" : "text-ink-2")}>
          {v > 0 ? "+" : v < 0 ? "−" : ""}
          {f.compact(Math.abs(v))}
        </span>
      );
    case "pct":
      return <>{f.percent(v, 1)}</>;
    case "m3":
      return <span className="text-ink-2">{f.compact(v)} m³</span>;
    case "delta":
      return <DeltaChip value={v} />;
    case "deltaInverse":
      return <DeltaChip value={v} upIsGood={false} />;
    case "ratio":
      return (
        <>
          {f.integer(v)}
          <span className="text-ink-3">/{f.integer(row.values[col.ratioKey ?? ""] ?? 0)}</span>
        </>
      );
  }
}

export type SortDir = "asc" | "desc";
export interface SortState {
  key: string;
  dir: SortDir;
}

type SortValue = number | string | null | undefined;

/**
 * Compares two cell values for sorting: strings by locale, numbers
 * numerically; a missing value sorts last in either direction. Returns 0
 * for a tie so the caller can fall back to another key.
 */
export function compareSortValues(a: SortValue, b: SortValue, dir: SortDir): number {
  const sign = dir === "asc" ? 1 : -1;
  if (typeof a === "string" || typeof b === "string") return String(a ?? "").localeCompare(String(b ?? "")) * sign;
  if (a == null || b == null) return a == null ? (b == null ? 0 : 1) : -1;
  return a === b ? 0 : (a - b) * sign;
}

/**
 * Sort state plus the sorted rows, for tables that render their own cells.
 * `value` maps a row and a column key to what it sorts by (see
 * `compareSortValues`); ties fall back to `name`. A newly picked column
 * starts descending, except "name".
 */
export function useSortedRows<T>(
  rows: T[],
  defaultSort: string,
  value: (row: T, key: string) => SortValue,
  name: (row: T) => string,
) {
  const [sort, setSort] = useState<SortState>({ key: defaultSort, dir: "desc" });
  const sorted = useMemo(
    () =>
      [...rows].sort(
        (a, b) => compareSortValues(value(a, sort.key), value(b, sort.key), sort.dir) || name(a).localeCompare(name(b)),
      ),
    [rows, sort, value, name],
  );
  const toggle = (key: string) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "desc" ? "asc" : "desc" } : { key, dir: key === "name" ? "asc" : "desc" }));
  return { sorted, sort, toggle };
}

/** A column header that sorts its table on click; marks the active column with `aria-sort` and an arrow. */
export function SortHeader({
  sortKey,
  label,
  title,
  sort,
  onSort,
  align = "right",
}: {
  sortKey: string;
  label: string;
  title?: string;
  sort: SortState;
  onSort: (key: string) => void;
  align?: "left" | "right";
}) {
  const active = sort.key === sortKey;
  const Icon = sort.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th
      className={align === "right" ? "text-right" : undefined}
      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        title={title}
        onClick={() => onSort(sortKey)}
        className={cn(
          "inline-flex items-center gap-1 whitespace-nowrap uppercase hover:text-ink",
          active && "text-ink",
          align === "right" && "flex-row-reverse",
        )}
      >
        {label}
        {active && <Icon className="size-3" aria-hidden />}
      </button>
    </th>
  );
}

const entityValue = (r: EntityRow, key: string) => (key === "name" ? r.name : r.values[key]);
const entityName = (r: EntityRow) => r.name;

export function SortableTable({
  columns,
  rows,
  defaultSort,
  entityLabel,
  initialRows = 12,
  emptyText,
}: {
  columns: Column[];
  rows: EntityRow[];
  defaultSort: string;
  entityLabel: string;
  initialRows?: number;
  emptyText?: string;
}) {
  const { t } = useI18n();
  const { sorted, sort, toggle } = useSortedRows(rows, defaultSort, entityValue, entityName);
  const [expanded, setExpanded] = useState(false);

  if (!rows.length) return <p className="py-6 text-center text-sm text-ink-3">{emptyText ?? t.common.table.empty}</p>;
  const shown = expanded ? sorted : sorted.slice(0, initialRows);

  const header = (key: string, label: string, title?: string, align: "left" | "right" = "right") => (
    <SortHeader key={key} sortKey={key} label={label} title={title} align={align} sort={sort} onSort={toggle} />
  );

  return (
    <div>
      <div className="-mx-2 overflow-x-auto">
        <table className="ks-table">
          <thead>
            <tr>
              {header("name", entityLabel, undefined, "left")}
              {columns.map((c) => header(c.key, c.label, c.title))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id}>
                <td>
                  <a
                    href={r.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex min-w-0 items-center gap-2.5 hover:text-accent"
                  >
                    {r.image === "portrait" ? <Portrait id={r.id} size={24} /> : <TypeIcon id={r.id} size={24} />}
                    <span className="truncate font-medium">{r.name}</span>
                  </a>
                </td>
                {columns.map((c) => (
                  <td key={c.key} className="text-right whitespace-nowrap tabular-nums">
                    <Cell row={r} col={c} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > initialRows && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="mt-3 text-xs font-medium text-accent hover:underline"
        >
          {expanded ? t.common.table.showFewer : t.common.table.showAll(rows.length)}
        </button>
      )}
    </div>
  );
}
