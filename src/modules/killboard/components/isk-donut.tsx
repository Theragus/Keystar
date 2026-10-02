"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { compact, percent } from "@/lib/format";
import { KILL_COLOR, LOSS_COLOR } from "../colors";

/** ISK destroyed vs lost, with efficiency in the centre. Labels carry the meaning, not colour alone. */
export function IskDonut({ destroyed, lost }: { destroyed: number; lost: number }) {
  const total = destroyed + lost;
  const data = [
    { name: "ISK destroyed", value: destroyed, color: KILL_COLOR },
    { name: "ISK lost", value: lost, color: LOSS_COLOR },
  ];
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[13rem]">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={total > 0 ? data : [{ name: "No data", value: 1, color: "rgba(255,255,255,0.06)" }]}
            dataKey="value"
            innerRadius="68%"
            outerRadius="100%"
            startAngle={90}
            endAngle={-270}
            paddingAngle={total > 0 && lost > 0 && destroyed > 0 ? 2 : 0}
            stroke="none"
            isAnimationActive={false}
          >
            {(total > 0 ? data : [{ color: "rgba(255,255,255,0.06)" }]).map((d, i) => (
              <Cell key={i} fill={d.color} />
            ))}
          </Pie>
          {total > 0 && (
            <Tooltip
              cursor={false}
              content={({ active, payload }) =>
                active && payload?.[0] ? (
                  <div className="glass-chip rounded-md px-2.5 py-1.5 text-xs">
                    <div className="font-medium text-ink">{payload[0].name}</div>
                    <div className="text-ink-2 tabular-nums">
                      {compact(Number(payload[0].value))} ISK · {percent(Number(payload[0].value) / total, 1)}
                    </div>
                  </div>
                ) : null
              }
            />
          )}
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
        <div>
          <div className="text-2xl font-semibold tabular-nums">{total > 0 ? percent(destroyed / total, 1) : "—"}</div>
          <div className="eve-label text-[0.6rem] text-ink-3">ISK efficiency</div>
        </div>
      </div>
    </div>
  );
}
