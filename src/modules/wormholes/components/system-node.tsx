"use client";

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { Pin, Star } from "lucide-react";
import { memo } from "react";
import { cn } from "@/lib/utils";
import { NODE_H, NODE_W } from "../layout";
import { shortEffect } from "../presentation";
import { shortClass } from "../static";
import type { MapSystem } from "../state";
import { ClassBadge } from "./class-badge";

export type SystemNodeData = { system: MapSystem; home: boolean; editable: boolean; homeLabel: string };
export type SystemNode = Node<SystemNodeData, "system">;

const handleClass = "!size-2.5 !border-0 !bg-accent/70 opacity-0 transition-opacity group-hover:opacity-100";

/** A fixed-size card, so the layout can space columns for the edge labels. */
export const SystemNodeView = memo(function SystemNodeView({ data, selected }: NodeProps<SystemNode>) {
  const s = data.system;
  return (
    <div
      className={cn(
        "group relative flex flex-col justify-center gap-1 rounded-[10px] border bg-space-800 px-2.5",
        selected ? "border-accent shadow-[0_0_0_2px_rgba(92,200,255,0.35)]" : "border-white/12",
      )}
      style={{ width: NODE_W, height: NODE_H }}
    >
      {s.label && (
        <span className="absolute -top-[18px] left-1 max-w-[190px] truncate rounded-t-md bg-white/8 px-1.5 text-3xs leading-[18px] text-ink-2">
          {s.label}
        </span>
      )}
      <div className="flex min-w-0 items-center gap-2">
        <ClassBadge cls={s.cls} sec={s.sec} />
        <span className="truncate text-xs font-semibold text-ink">{s.name}</span>
        {data.home && <Star className="size-3.5 shrink-0 fill-gold text-gold" aria-label={data.homeLabel} />}
        {s.pinned && <Pin className="ml-auto size-3 shrink-0 text-ink-3" aria-hidden />}
      </div>
      <div className="flex min-w-0 items-center gap-2 text-3xs">
        <span className="truncate text-ink-3">{shortEffect(s.effect) ?? (s.sec === null ? "—" : s.region)}</span>
        {s.statics.length > 0 && (
          <span className="ml-auto shrink-0 font-mono text-ink-2">
            {s.statics.map((st) => `${shortClass(st.dest)}·${st.code}`).join(" ")}
          </span>
        )}
      </div>
      {/* Loose connection mode: either handle can start or end a connection. */}
      <Handle id="l" type="source" position={Position.Left} className={handleClass} isConnectable={data.editable} />
      <Handle id="r" type="source" position={Position.Right} className={handleClass} isConnectable={data.editable} />
    </div>
  );
});
