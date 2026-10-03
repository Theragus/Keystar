"use client";

import { useState } from "react";
import { Bar, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Segmented } from "@/components/ui/segmented";
import type { DateBucket } from "@/lib/dates";
import { useI18n } from "@/i18n/client";
import { CHART_CLASSES, type ChartClass } from "../../class-colors";
import { EXPENSE_COLOR, NET_COLOR } from "../colors";
import { bucketLabel } from "../labels";
import type { PnlBucket } from "../report";
import { SignedIsk } from "./signed-isk";

const GAP = 2;
const RADIUS = 4;

interface ShapeProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fill?: string;
  payload?: Record<string, number | string | boolean>;
}

/** Income segment: 2px gap above it, rounded corners only on the top of the column. */
function makeIncomeShape(classId: ChartClass, order: ChartClass[]) {
  function IncomeShape({ x = 0, y = 0, width = 0, height = 0, fill, payload }: ShapeProps) {
    if (!height || height <= 0) return null;
    const above = order.slice(order.indexOf(classId) + 1);
    const isTop = above.every((c) => !Number(payload?.[c] ?? 0));
    const top = isTop ? y : y + GAP;
    const h = Math.max(0, y + height - top);
    if (h <= 0.5) return null;
    if (!isTop) return <rect x={x} y={top} width={width} height={h} fill={fill} />;
    const r = Math.min(RADIUS, width / 2, h);
    return (
      <path
        d={`M${x},${top + h} V${top + r} Q${x},${top} ${x + r},${top} H${x + width - r} Q${x + width},${top} ${x + width},${top + r} V${top + h} Z`}
        fill={fill}
      />
    );
  }
  return IncomeShape;
}

/** Expenses grow downwards from the baseline with a rounded data end. */
function ExpenseShape({ x = 0, y = 0, width = 0, height = 0, fill }: ShapeProps) {
  const top = Math.min(y, y + height) + GAP / 2;
  const h = Math.abs(height) - GAP / 2;
  if (h <= 0.5 || width <= 0) return null;
  const r = Math.min(RADIUS, width / 2, h);
  const end = top + h;
  return (
    <path
      d={`M${x},${top} V${end - r} Q${x},${end} ${x + r},${end} H${x + width - r} Q${x + width},${end} ${x + width},${end - r} V${top} Z`}
      fill={fill}
    />
  );
}

type Row = Record<string, number | string | boolean>;

/** Round tick step (1, 2, 2.5, 5 × 10ⁿ) for about `count` intervals over `span`. */
function niceStep(span: number, count: number) {
  const raw = Math.max(span, 1) / count;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const n = raw / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * pow;
}

/** Axis from the deepest loss/expense to the highest income, on round ticks. */
function axisTicks(buckets: PnlBucket[]): number[] {
  const up = Math.max(1, ...buckets.map((b) => Math.max(b.income, b.net)));
  const down = Math.max(0, ...buckets.map((b) => Math.max(b.expenses, -b.net)));
  const step = niceStep(Math.max(up, down), 3);
  const ticks: number[] = [];
  for (let v = -Math.ceil(down / step) * step; v <= Math.ceil(up / step) * step + step / 2; v += step) ticks.push(v);
  return ticks;
}

function ChartTooltip({ active, payload, bucket }: { active?: boolean; payload?: { payload: Row }[]; bucket: DateBucket }) {
  const { t, f } = useI18n();
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  const classes = CHART_CLASSES.filter((c) => Number(row[c.id]) > 0);
  return (
    <div className="glass min-w-[220px] rounded-2xl bg-space-800/85 px-4 py-3 text-xs">
      <div className="eve-label mb-2 text-2xs text-ink-3">
        {bucketLabel({ start: String(row.start), end: String(row.end) }, bucket, f, true)}
        {row.partial ? ` · ${t.pnl.chart.partial}` : ""}
      </div>
      {classes.map((c) => (
        <div key={c.id} className="flex items-center gap-2 py-0.5">
          <span className="size-2.5 rounded-[3px]" style={{ background: c.color }} aria-hidden />
          <span className="text-ink-3">{t.mining.chartClasses[c.id]}</span>
          <span className="ml-auto font-semibold text-ink tabular-nums">{f.compact(Number(row[c.id]))}</span>
        </div>
      ))}
      <div className="flex items-center gap-2 py-0.5">
        <span className="size-2.5 rounded-[3px]" style={{ background: EXPENSE_COLOR }} aria-hidden />
        <span className="text-ink-3">{t.pnl.chart.expenses}</span>
        <span className="ml-auto font-semibold text-ink tabular-nums">
          {Number(row.expenses) ? `−${f.compact(Number(row.expenses))}` : "0"}
        </span>
      </div>
      <div className="mt-1.5 flex items-center gap-2 border-t border-surface-contrast/10 pt-1.5">
        <span className="h-0.5 w-3 rounded-full" style={{ background: NET_COLOR }} aria-hidden />
        <span className="text-ink-3">{t.pnl.chart.netShort}</span>
        <span className="ml-auto">
          <SignedIsk value={Number(row.net)} />
        </span>
      </div>
    </div>
  );
}

/** Income stacked up by resource, expenses down, net profit as a line. */
export function PnlChart({ buckets, bucket }: { buckets: PnlBucket[]; bucket: DateBucket }) {
  const { t, f } = useI18n();
  const [view, setView] = useState<"chart" | "table">("chart");
  const present = CHART_CLASSES.filter((c) => buckets.some((b) => b.incomeByClass[c.id] > 0));
  const order = present.map((c) => c.id);
  const data: Row[] = buckets.map((b) => ({
    start: b.start,
    end: b.end,
    partial: b.partial,
    ...b.incomeByClass,
    income: b.income,
    expenses: b.expenses,
    expensesNeg: -b.expenses,
    net: b.net,
  }));
  const ticks = axisTicks(buckets);
  const totals = buckets.reduce(
    (sum, b) => ({ income: sum.income + b.income, expenses: sum.expenses + b.expenses }),
    { income: 0, expenses: 0 },
  );

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs" aria-label={t.pnl.chart.legend}>
          {present.map((c) => (
            <li key={c.id} className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-[3px]" style={{ background: c.color }} aria-hidden />
              <span className="text-ink-2">{t.mining.chartClasses[c.id]}</span>
            </li>
          ))}
          <li className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-[3px]" style={{ background: EXPENSE_COLOR }} aria-hidden />
            <span className="text-ink-2">{t.pnl.chart.expenses}</span>
            <span className="text-ink-3 tabular-nums">{f.compact(totals.expenses)}</span>
          </li>
          <li className="flex items-center gap-1.5">
            <span className="h-0.5 w-3 rounded-full" style={{ background: NET_COLOR }} aria-hidden />
            <span className="text-ink-2">{t.pnl.chart.net}</span>
          </li>
        </ul>
        <Segmented
          size="sm"
          label={t.pnl.chart.view}
          value={view}
          onChange={setView}
          options={[
            { value: "chart", label: t.pnl.chart.chart },
            { value: "table", label: t.pnl.chart.table },
          ]}
        />
      </div>

      {view === "chart" ? (
        <div className="h-[320px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barCategoryGap="22%" stackOffset="sign">
              <CartesianGrid vertical={false} strokeWidth={1} />
              <XAxis
                dataKey="start"
                tickFormatter={(d: string) => bucketLabel({ start: d, end: d }, bucket, f)}
                tickLine={false}
                axisLine={false}
                minTickGap={28}
                tick={{ fontSize: 12 }}
                dy={6}
              />
              <YAxis
                domain={[ticks[0], ticks[ticks.length - 1]]}
                ticks={ticks}
                tickFormatter={(v: number) => (v < 0 ? `−${f.compact(-v, 1)}` : f.compact(v, 1))}
                tickLine={false}
                axisLine={false}
                width={f.locale === "de" ? 80 : 60}
                tick={{ fontSize: 12 }}
              />
              <ReferenceLine y={0} stroke="var(--axis)" />
              <Tooltip
                cursor={{ fill: "var(--chart-cursor)" }}
                content={<ChartTooltip bucket={bucket} />}
                isAnimationActive={false}
              />
              {present.map((c) => {
                const Shape = makeIncomeShape(c.id, order);
                return (
                  <Bar
                    key={c.id}
                    dataKey={c.id}
                    stackId="pnl"
                    fill={c.color}
                    maxBarSize={28}
                    isAnimationActive={false}
                    shape={<Shape />}
                    name={t.mining.chartClasses[c.id]}
                  />
                );
              })}
              <Bar
                dataKey="expensesNeg"
                stackId="pnl"
                fill={EXPENSE_COLOR}
                maxBarSize={28}
                isAnimationActive={false}
                shape={<ExpenseShape />}
                name={t.pnl.chart.expenses}
              />
              <Line
                dataKey="net"
                type="monotone"
                stroke={NET_COLOR}
                strokeWidth={2}
                dot={buckets.length <= 16 ? { r: 3, fill: NET_COLOR, strokeWidth: 0 } : false}
                isAnimationActive={false}
                name={t.pnl.chart.net}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="max-h-[320px] overflow-y-auto">
          <table className="ks-table">
            <thead className="sticky top-0 bg-space-800/90 backdrop-blur">
              <tr>
                <th>{t.pnl.buckets[bucket]}</th>
                <th className="num">{t.pnl.chart.income}</th>
                <th className="num">{t.pnl.chart.expenses}</th>
                <th className="num">{t.pnl.chart.netShort}</th>
              </tr>
            </thead>
            <tbody>
              {[...buckets].reverse().map((b) => (
                <tr key={b.start}>
                  <td className="text-ink-2 tabular-nums">
                    {bucketLabel(b, bucket, f, true)}
                    {b.partial && <span className="ml-1.5 text-2xs text-ink-3">{t.pnl.chart.partial}</span>}
                  </td>
                  <td className="num">{b.income ? f.compact(b.income) : "—"}</td>
                  <td className="num">{b.expenses ? f.compact(b.expenses) : "—"}</td>
                  <td className="num">
                    <SignedIsk value={b.net} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
