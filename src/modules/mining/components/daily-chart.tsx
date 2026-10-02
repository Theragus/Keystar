"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Segmented } from "@/components/ui/segmented";
import { compact, formatMetric, shortDate } from "@/lib/format";
import { CHART_CLASSES, type ChartClass } from "../class-colors";

export interface DailyChartRow {
  date: string;
  values: Record<ChartClass, number>;
  total: number;
}

type Metric = "value" | "volume" | "quantity";
const GAP = 2;
const RADIUS = 4;

interface ShapeProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fill?: string;
  payload?: Record<string, number | string>;
}

/** Stacked segment: 2px surface gap above it, 4px rounded corners only on the column's top. */
function makeSegmentShape(classId: ChartClass, order: ChartClass[]) {
  function SegmentShape(props: ShapeProps) {
    const { x = 0, y = 0, width = 0, height = 0, fill, payload } = props;
    if (!height || height <= 0) return null;
    const above = order.slice(order.indexOf(classId) + 1);
    const isTop = above.every((c) => !Number(payload?.[c] ?? 0));
    const top = isTop ? y : y + GAP;
    const h = Math.max(0, y + height - top);
    if (h <= 0.5) return null;
    if (!isTop) return <rect x={x} y={top} width={width} height={h} fill={fill} />;
    const r = Math.min(RADIUS, width / 2, h);
    const d = `M${x},${top + h} V${top + r} Q${x},${top} ${x + r},${top} H${x + width - r} Q${x + width},${top} ${x + width},${top + r} V${top + h} Z`;
    return <path d={d} fill={fill} />;
  }
  return SegmentShape;
}

function ChartTooltip({
  active,
  payload,
  metric,
}: {
  active?: boolean;
  payload?: { payload: Record<string, number | string> }[];
  metric: Metric;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  const rows = CHART_CLASSES.filter((c) => Number(row[c.id]) > 0);
  return (
    <div className="glass min-w-[200px] rounded-2xl bg-space-800/85 px-4 py-3 text-xs">
      <div className="eve-label mb-2 text-2xs text-ink-3">{shortDate(String(row.date))}</div>
      {rows.length === 0 && <div className="text-ink-3">No mining</div>}
      {rows.map((c) => (
        <div key={c.id} className="flex items-center gap-2 py-0.5">
          <span className="h-0.5 w-3 rounded-full" style={{ background: c.color }} aria-hidden />
          <span className="font-semibold text-ink tabular-nums">{formatMetric(metric, Number(row[c.id]))}</span>
          <span className="text-ink-3">{c.label}</span>
        </div>
      ))}
      {rows.length > 1 && (
        <div className="mt-1.5 flex items-center gap-2 border-t border-white/10 pt-1.5">
          <span className="font-semibold text-ink tabular-nums">{formatMetric(metric, Number(row.total))}</span>
          <span className="text-ink-3">Total</span>
        </div>
      )}
    </div>
  );
}

export function DailyChart({ rows, metric }: { rows: DailyChartRow[]; metric: Metric }) {
  const [view, setView] = useState<"chart" | "table">("chart");
  const present = CHART_CLASSES.filter((c) => rows.some((r) => r.values[c.id] > 0));
  const order = present.map((c) => c.id);
  const data = rows.map((r) => ({ date: r.date, total: r.total, ...r.values }));
  const sumBy = (id: ChartClass) => rows.reduce((s, r) => s + r.values[id], 0);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        {/* Legend: always present for 2+ series; mirrors the mark (rect for bars). */}
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs" aria-label="Legend">
          {present.map((c) => (
            <li key={c.id} className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-[3px]" style={{ background: c.color }} aria-hidden />
              <span className="text-ink-2">{c.label}</span>
              <span className="text-ink-3 tabular-nums">{formatMetric(metric, sumBy(c.id))}</span>
            </li>
          ))}
        </ul>
        <Segmented
          size="sm"
          label="Chart or table"
          value={view}
          onChange={setView}
          options={[
            { value: "chart", label: "Chart" },
            { value: "table", label: "Table" },
          ]}
        />
      </div>

      {view === "chart" ? (
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barCategoryGap="22%">
              <CartesianGrid vertical={false} strokeWidth={1} />
              <XAxis
                dataKey="date"
                tickFormatter={(d: string) => shortDate(d)}
                tickLine={false}
                axisLine={{ stroke: "var(--axis)" }}
                minTickGap={28}
                tick={{ fontSize: 12 }}
                dy={6}
              />
              <YAxis
                tickFormatter={(v: number) => compact(v, 1)}
                tickLine={false}
                axisLine={false}
                width={52}
                tick={{ fontSize: 12 }}
              />
              <Tooltip
                cursor={{ fill: "rgba(255,255,255,0.045)" }}
                content={<ChartTooltip metric={metric} />}
                isAnimationActive={false}
              />
              {present.map((c) => (
                <Bar
                  key={c.id}
                  dataKey={c.id}
                  stackId="day"
                  fill={c.color}
                  maxBarSize={24}
                  isAnimationActive={false}
                  shape={makeSegmentShape(c.id, order)}
                  name={c.label}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="max-h-[300px] overflow-y-auto">
          <table className="ks-table">
            <thead className="sticky top-0 bg-space-800/90 backdrop-blur">
              <tr>
                <th>Date</th>
                {present.map((c) => (
                  <th key={c.id} className="num">
                    {c.label}
                  </th>
                ))}
                <th className="num">Total</th>
              </tr>
            </thead>
            <tbody>
              {[...rows].reverse().map((r) => (
                <tr key={r.date}>
                  <td className="tabular-nums text-ink-2">{r.date}</td>
                  {present.map((c) => (
                    <td key={c.id} className="num">
                      {r.values[c.id] ? formatMetric(metric, r.values[c.id]) : "—"}
                    </td>
                  ))}
                  <td className="num font-semibold">{formatMetric(metric, r.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
