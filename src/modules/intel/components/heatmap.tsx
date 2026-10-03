import { getI18n } from "@/i18n/server";
import { heatColor } from "../colors";

/** Kills per weekday and EVE hour (zKillboard's lifetime activity), darker = fewer. */
export async function ActivityHeatmap({ heat, peakHours }: { heat: number[][] | null; peakHours: number[] }) {
  const { t } = await getI18n();
  const h = t.intel.heatmap;
  if (!heat) return <p className="text-xs text-ink-3">{h.none}</p>;
  const max = Math.max(1, ...heat.flat());
  const hour = (value: number) => String(value).padStart(2, "0");
  return (
    <div className="overflow-x-auto">
      <table className="border-separate border-spacing-0.5 text-3xs text-ink-3" aria-label={h.label}>
        <thead>
          <tr>
            <th />
            {Array.from({ length: 24 }, (_, i) => (
              <th key={i} scope="col" className={`w-4 font-normal ${peakHours.includes(i) ? "text-ink" : ""}`}>
                {i % 3 === 0 ? hour(i) : ""}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {heat.map((row, d) => (
            <tr key={d}>
              <th scope="row" className="pr-1.5 text-right font-normal">
                {h.days[d]}
              </th>
              {row.map((v, i) => (
                <td
                  key={i}
                  className="size-4 rounded-sm bg-white/4"
                  style={{ background: v ? heatColor(v / max) : undefined }}
                  title={h.cell(h.days[d], hour(i), v)}
                />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
