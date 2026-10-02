import { heatColor } from "../colors";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Kills per weekday and EVE hour (zKillboard's lifetime activity), darker = fewer. */
export function ActivityHeatmap({ heat, peakHours }: { heat: number[][] | null; peakHours: number[] }) {
  if (!heat) return <p className="text-xs text-ink-3">No activity pattern on zKillboard.</p>;
  const max = Math.max(1, ...heat.flat());
  return (
    <div className="overflow-x-auto">
      <table className="border-separate border-spacing-0.5 text-[0.6rem] text-ink-3" aria-label="Kills per weekday and EVE hour">
        <thead>
          <tr>
            <th />
            {Array.from({ length: 24 }, (_, h) => (
              <th key={h} scope="col" className={`w-4 font-normal ${peakHours.includes(h) ? "text-ink" : ""}`}>
                {h % 3 === 0 ? String(h).padStart(2, "0") : ""}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {heat.map((row, d) => (
            <tr key={d}>
              <th scope="row" className="pr-1.5 text-right font-normal">
                {DAYS[d]}
              </th>
              {row.map((v, h) => (
                <td
                  key={h}
                  className="size-4 rounded-sm bg-white/4"
                  style={{ background: v ? heatColor(v / max) : undefined }}
                  title={`${DAYS[d]} ${String(h).padStart(2, "0")}:00 EVE: ${v} kill${v === 1 ? "" : "s"}`}
                />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
