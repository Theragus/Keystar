import { TypeIcon } from "@/components/ui/eve-image";
import type { Messages } from "@/i18n/messages";
import type { Formatter } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { QueueRow } from "../queries";
import { remainingSp, romanLevel } from "../queue";
import { Countdown } from "./countdown";

/** The queue as the game lists it: skill, target level, finish time and time left per entry. */
export function QueueTable({ entries, t, f, now }: { entries: QueueRow[]; t: Messages["skills"]; f: Formatter; now: Date }) {
  return (
    <div className="overflow-x-auto">
      <table className="ks-table">
        <thead>
          <tr>
            <th className="num">{t.table.position}</th>
            <th>{t.table.skill}</th>
            <th>{t.table.level}</th>
            <th>{t.table.trained}</th>
            <th>{t.table.finishes}</th>
            <th className="num">{t.table.timeLeft}</th>
            <th className="num">{t.table.spLeft}</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e, i) => {
            const sp = remainingSp(e, now);
            return (
              <tr key={e.queuePosition} className={cn(i === 0 && e.finishDate && "font-medium")}>
                <td className="num text-ink-3">{i + 1}</td>
                <td>
                  <span className="flex items-center gap-2 whitespace-nowrap">
                    <TypeIcon id={e.skillId} size={22} />
                    <span>
                      {e.skillName ?? e.skillId}
                      {e.groupName && <span className="ml-2 text-2xs text-ink-3">{e.groupName}</span>}
                    </span>
                  </span>
                </td>
                <td className="font-mono">{romanLevel(e.finishedLevel)}</td>
                <td className="font-mono text-ink-3">{e.trainedLevel === null ? "—" : romanLevel(e.trainedLevel)}</td>
                <td className="whitespace-nowrap text-ink-2">{e.finishDate ? f.dateTime(e.finishDate) : "—"}</td>
                <td className="num whitespace-nowrap">{e.finishDate ? <Countdown until={e.finishDate.toISOString()} now={now.toISOString()} /> : "—"}</td>
                <td className="num text-ink-2">{sp === null ? "—" : f.integer(sp)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
