"use client";

import { Layers } from "lucide-react";
import Link from "next/link";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { TypeIcon } from "@/components/ui/eve-image";
import { Panel } from "@/components/ui/glass";
import { SortHeader, useSortedRows } from "@/components/ui/sortable-table";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { oreClassColor } from "../class-colors";
import { miningQueryString, type MiningFilters } from "../filters";
import { groupOreTypes, singleOreRow, type OreRow } from "../ore-groups";
import type { TypeRow } from "../queries";

const rowName = (r: OreRow) => r.name;

/** Ore breakdown panel: sortable by any column, ore types grouped by family unless switched off. */
export function OreBreakdown({
  rows,
  filters,
  title,
  subtitle,
  className,
  emptyText,
}: {
  rows: TypeRow[];
  filters: MiningFilters;
  title: ReactNode;
  subtitle?: ReactNode;
  className?: string;
  emptyText: string;
}) {
  const { t, f } = useI18n();
  const m = t.mining.breakdowns;
  const metric = filters.metric;
  const [grouped, setGrouped] = useState(true);
  const shown = useMemo(() => (grouped ? groupOreTypes(rows) : rows.map(singleOreRow)), [rows, grouped]);
  const total = rows.reduce((s, r) => s + r[metric], 0);
  // Share is the row's metric over the total, so it sorts by the metric itself.
  const value = useCallback(
    (r: OreRow, key: string) => {
      switch (key) {
        case "name":
          return r.name;
        case "share":
          return r[metric];
        case "unitPrice":
          return r.unitPrice || null;
        default:
          return r[key as "quantity" | "volume" | "value"];
      }
    },
    [metric],
  );
  const { sorted, sort, toggle } = useSortedRows(shown, "share", value, rowName);
  const header = (key: string, label: string, align?: "left") => (
    <SortHeader sortKey={key} label={label} align={align} sort={sort} onSort={toggle} />
  );

  const groupToggle = rows.length > 0 && (
    <button
      type="button"
      onClick={() => setGrouped((g) => !g)}
      aria-pressed={grouped}
      title={m.groupOresHint}
      className={cn(
        "flex h-8 items-center gap-1.5 rounded-md border border-surface-contrast/[0.08] bg-surface-contrast/[0.03] px-2.5 text-xs transition hover:text-ink",
        grouped ? "text-ink" : "text-ink-3",
      )}
    >
      <Layers className={cn("size-3.5", grouped && "text-accent")} aria-hidden />
      {m.groupOres}
    </button>
  );

  return (
    <Panel className={className} title={title} subtitle={subtitle} actions={groupToggle}>
      {rows.length ? (
        <div className="max-h-[700px] overflow-y-auto">
          <table className="ks-table">
            <thead className="sticky top-0 z-10 bg-space-800/90 backdrop-blur">
              <tr>
                {header("name", t.mining.columns.ore, "left")}
                {header("quantity", t.mining.columns.units)}
                {header("volume", t.mining.columns.volume)}
                {header("unitPrice", t.mining.columns.unitPrice)}
                {header("value", t.mining.columns.value)}
                {header("share", t.mining.columns.share)}
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.key}>
                  <td>
                    <Link
                      href={`?${miningQueryString(filters, { types: r.typeIds, page: 1 })}`}
                      scroll={false}
                      className="flex items-center gap-2.5 hover:text-accent"
                    >
                      <TypeIcon id={r.typeId} size={26} />
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{r.name}</span>
                        <span className="flex items-center gap-1.5 text-2xs text-ink-3">
                          <span className="size-1.5 rounded-full" style={{ background: oreClassColor(r.oreClass) }} aria-hidden />
                          {t.eve.oreClasses[r.oreClass].short}
                          {r.typeIds.length > 1 ? ` · ${m.variants(r.typeIds.length)}` : r.groupName && ` · ${r.groupName}`}
                        </span>
                      </span>
                    </Link>
                  </td>
                  <td className="num">{f.integer(r.quantity)}</td>
                  <td className="num">{f.volume(r.volume)}</td>
                  <td className="num text-ink-2" title={r.typeIds.length > 1 ? m.averagePrice : undefined}>
                    {r.unitPrice ? f.unitPrice(r.unitPrice) : "—"}
                  </td>
                  <td className="num font-semibold">{f.isk(r.value)}</td>
                  <td className="num text-ink-3">{total ? f.percent(r[metric] / total) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="py-8 text-center text-sm text-ink-3">{emptyText}</p>
      )}
    </Panel>
  );
}
