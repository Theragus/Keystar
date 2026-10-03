"use client";

import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { edgeLook } from "../presentation";
import { timeLeft } from "../lifetime";
import type { WormholeType } from "../static";
import { connectionSize, type MapState } from "../state";
import { ClassBadge } from "./class-badge";
import type { Selection } from "./map-view";

/** The map as a table, soonest to collapse first. Also the view for small screens and screen readers. */
export function ListView({
  state,
  types,
  now,
  selection,
  onSelect,
}: {
  state: MapState;
  types: Record<string, WormholeType>;
  now: number;
  selection: Selection;
  onSelect: (selection: Selection) => void;
}) {
  const { t } = useI18n();
  const tw = t.wormholes;
  const byId = new Map(state.systems.map((s) => [s.id, s]));
  const rows = [...state.connections].sort((x, y) => x.expiresBy.localeCompare(y.expiresBy));
  if (!rows.length) return <p className="p-5 text-sm text-ink-3">{tw.list.empty}</p>;
  return (
    <div className="h-full overflow-auto">
      <table className="ks-table">
        <thead>
          <tr>
            <th>{tw.list.from}</th>
            <th>{tw.list.to}</th>
            <th>{tw.list.type}</th>
            <th>{tw.list.timeLeft}</th>
            <th>{tw.list.lifetime}</th>
            <th>{tw.list.mass}</th>
            <th>{tw.list.size}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => {
            const [from, to] = c.typeSide === "b" ? [byId.get(c.b), byId.get(c.a)] : [byId.get(c.a), byId.get(c.b)];
            const look = edgeLook(c, now);
            const left = Math.floor(timeLeft(c.expiresBy, new Date(now)) / 60_000);
            const size = connectionSize(c, types);
            const selected = selection?.kind === "connection" && selection.id === c.id;
            return (
              <tr
                key={c.id}
                onClick={() => onSelect({ kind: "connection", id: c.id })}
                className={cn("cursor-pointer", selected && "bg-white/6", look.collapsed && "opacity-50")}
              >
                {[from, to].map((s, i) => (
                  <td key={i}>
                    {s &&
                      (i === 0 ? (
                        // The row is clickable for the mouse; this button makes it reachable by keyboard and screen readers.
                        <button
                          type="button"
                          aria-pressed={selected}
                          aria-label={`${s.name} ↔ ${to?.name ?? ""}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelect({ kind: "connection", id: c.id });
                          }}
                          className="flex items-center gap-2 rounded-md text-left focus-visible:outline-2 focus-visible:outline-accent"
                        >
                          <ClassBadge cls={s.cls} sec={s.sec} />
                          <span className="text-ink">{s.name}</span>
                        </button>
                      ) : (
                        <span className="flex items-center gap-2">
                          <ClassBadge cls={s.cls} sec={s.sec} />
                          <span className="text-ink">{s.name}</span>
                        </span>
                      ))}
                  </td>
                ))}
                <td className="font-mono">{c.type ?? "?"}</td>
                <td className="font-mono tabular-nums">{tw.timeLeft(left)}</td>
                <td className={cn(look.band !== "fresh" && look.band !== "lt1d" && "text-warning")}>{tw.life[look.band]}</td>
                <td className={cn(c.mass === "critical" && "text-critical-text")}>{tw.mass[c.mass]}</td>
                <td title={size ? tw.sizes[size] : undefined}>{size ?? "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
