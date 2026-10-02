"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Segmented } from "@/components/ui/segmented";
import { compact, integer, shortDate } from "@/lib/format";
import { KILL_COLOR, LOSS_COLOR } from "../colors";
import type { DailyActivity } from "../queries";

const RADIUS = 4;
/** Half of the 2px surface gap between a day's kill and loss bars at the baseline. */
const HALF_GAP = 1;

interface ShapeProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fill?: string;
}

/**
 * Bars grow away from the shared baseline: kills upwards, losses downwards,
 * each with a 4px rounded data-end and square at the baseline.
 */
function makeShape(direction: "up" | "down") {
  function MirroredBar({ x = 0, y = 0, width = 0, height = 0, fill }: ShapeProps) {
    const top = Math.min(y, y + height);
    const h = Math.abs(height) - HALF_GAP;
    if (h <= 0.5 || width <= 0) return null;
    const r = Math.min(RADIUS, width / 2, h);
    if (direction === "up") {
      const bottom = top + h;
      return <path d={`M${x},${bottom} V${top + r} Q${x},${top} ${x + r},${top} H${x + width - r} Q${x + width},${top} ${x + width},${top + r} V${bottom} Z`} fill={fill} />;
    }
    const start = top + HALF_GAP;
    const end = start + h;
    return <path d={`M${x},${start} V${end - r} Q${x},${end} ${x + r},${end} H${x + width - r} Q${x + width},${end} ${x + width},${end - r} V${start} Z`} fill={fill} />;
  }
  return MirroredBar;
}

const KillShape = makeShape("up");
const LossShape = makeShape("down");

function ChartTooltip({ active, payload }: { active?: boolean; payload?: { payload: DailyActivity }[] }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="glass min-w-[190px] rounded-2xl bg-space-800/85 px-4 py-3 text-xs">
      <div className="eve-label mb-2 text-[0.66rem] text-ink-3">{shortDate(row.date)}</div>
      {[
        { label: "Kills", color: KILL_COLOR, n: row.kills, isk: row.destroyed },
        { label: "Losses", color: LOSS_COLOR, n: row.losses, isk: row.lost },
      ].map((s) => (
        <div key={s.label} className="flex items-center gap-2 py-0.5">
          <span className="size-2.5 rounded-[3px]" style={{ background: s.color }} aria-hidden />
          <span className="font-semibold text-ink tabular-nums">{integer(s.n)}</span>
          <span className="text-ink-3">{s.label}</span>
          <span className="ml-auto text-ink-2 tabular-nums">{s.isk ? `${compact(s.isk)} ISK` : ""}</span>
        </div>
      ))}
    </div>
  );
}

/** Daily kills (up) and losses (down) on one axis. */
export function KillsChart({ rows }: { rows: DailyActivity[] }) {
  const [view, setView] = useState<"chart" | "table">("chart");
  const data = rows.map((r) => ({ ...r, lossesNeg: -r.losses }));
  const totals = rows.reduce((t, r) => ({ kills: t.kills + r.kills, losses: t.losses + r.losses }), { kills: 0, losses: 0 });
  const max = Math.max(1, ...rows.map((r) => Math.max(r.kills, r.losses)));

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs" aria-label="Legend">
          <li className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-[3px]" style={{ background: KILL_COLOR }} aria-hidden />
            <span className="text-ink-2">Kills</span>
            <span className="text-ink-3 tabular-nums">{integer(totals.kills)}</span>
          </li>
          <li className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-[3px]" style={{ background: LOSS_COLOR }} aria-hidden />
            <span className="text-ink-2">Losses</span>
            <span className="text-ink-3 tabular-nums">{integer(totals.losses)}</span>
          </li>
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
            <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barCategoryGap="22%" stackOffset="sign">
              <CartesianGrid vertical={false} strokeWidth={1} />
              <XAxis
                dataKey="date"
                tickFormatter={(d: string) => shortDate(d)}
                tickLine={false}
                axisLine={false}
                minTickGap={28}
                tick={{ fontSize: 11 }}
                dy={6}
              />
              <YAxis
                domain={[-max, max]}
                allowDecimals={false}
                tickFormatter={(v: number) => integer(Math.abs(v))}
                tickLine={false}
                axisLine={false}
                width={36}
                tick={{ fontSize: 11 }}
              />
              <ReferenceLine y={0} stroke="var(--axis)" />
              <Tooltip cursor={{ fill: "rgba(255,255,255,0.045)" }} content={<ChartTooltip />} isAnimationActive={false} />
              <Bar dataKey="kills" stackId="day" fill={KILL_COLOR} maxBarSize={24} isAnimationActive={false} shape={<KillShape />} name="Kills" />
              <Bar dataKey="lossesNeg" stackId="day" fill={LOSS_COLOR} maxBarSize={24} isAnimationActive={false} shape={<LossShape />} name="Losses" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="max-h-[300px] overflow-y-auto">
          <table className="ks-table">
            <thead className="sticky top-0 bg-space-800/90 backdrop-blur">
              <tr>
                <th>Date</th>
                <th className="num">Kills</th>
                <th className="num">Losses</th>
                <th className="num">Destroyed</th>
                <th className="num">Lost</th>
              </tr>
            </thead>
            <tbody>
              {[...rows].reverse().map((r) => (
                <tr key={r.date}>
                  <td className="tabular-nums text-ink-2">{r.date}</td>
                  <td className="num">{r.kills || "—"}</td>
                  <td className="num">{r.losses || "—"}</td>
                  <td className="num">{r.destroyed ? compact(r.destroyed) : "—"}</td>
                  <td className="num">{r.lost ? compact(r.lost) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
