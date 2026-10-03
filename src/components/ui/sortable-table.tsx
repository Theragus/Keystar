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
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: defaultSort, dir: "desc" });
  const [expanded, setExpanded] = useState(false);

  const sorted = useMemo(() => {
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      if (sort.key === "name") return a.name.localeCompare(b.name) * dir;
      const av = a.values[sort.key] ?? -Infinity;
      const bv = b.values[sort.key] ?? -Infinity;
      return av === bv ? a.name.localeCompare(b.name) : (av - bv) * dir;
    });
  }, [rows, sort]);

  if (!rows.length) return <p className="py-6 text-center text-sm text-ink-3">{emptyText ?? t.common.table.empty}</p>;
  const shown = expanded ? sorted : sorted.slice(0, initialRows);

  const header = (key: string, label: string, title?: string, align: "left" | "right" = "right") => {
    const active = sort.key === key;
    const Icon = sort.dir === "asc" ? ArrowUp : ArrowDown;
    return (
      <th
        key={key}
        className={align === "right" ? "text-right" : undefined}
        aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
      >
        <button
          type="button"
          title={title}
          onClick={() =>
            setSort((s) => (s.key === key ? { key, dir: s.dir === "desc" ? "asc" : "desc" } : { key, dir: key === "name" ? "asc" : "desc" }))
          }
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
  };

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
