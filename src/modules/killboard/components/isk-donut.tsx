"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { useI18n } from "@/i18n/client";
import { KILL_COLOR, LOSS_COLOR } from "../colors";

/** ISK destroyed vs lost, with efficiency in the centre. Labels carry the meaning, not colour alone. */
export function IskDonut({ destroyed, lost }: { destroyed: number; lost: number }) {
  const { t, f } = useI18n();
  const total = destroyed + lost;
  const data = [
    { name: t.killboard.terms.iskDestroyed, value: destroyed, color: KILL_COLOR },
    { name: t.killboard.terms.iskLost, value: lost, color: LOSS_COLOR },
  ];
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[13rem]">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={total > 0 ? data : [{ name: t.killboard.breakdown.noData, value: 1, color: "rgba(255,255,255,0.06)" }]}
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
                      {f.compact(Number(payload[0].value))} ISK · {f.percent(Number(payload[0].value) / total, 1)}
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
          <div className="text-2xl font-semibold tabular-nums">{total > 0 ? f.percent(destroyed / total, 1) : "—"}</div>
          <div className="eve-label text-2xs text-ink-3">{t.killboard.terms.iskEfficiency}</div>
        </div>
      </div>
    </div>
  );
}
