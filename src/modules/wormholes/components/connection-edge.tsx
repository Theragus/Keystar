"use client";

import { BaseEdge, EdgeLabelRenderer, getBezierPath, type Edge, type EdgeProps } from "@xyflow/react";
import { memo } from "react";
import { cn } from "@/lib/utils";
import type { EdgeLook } from "../presentation";

/** `bow`: both ends in one column (a loop between siblings); the edge curves out to the right instead of crossing nodes. */
export type ConnectionEdgeData = { look: EdgeLook; label: string; bow: boolean; onSelect: () => void };

const BOW = 110;
export type ConnectionEdge = Edge<ConnectionEdgeData, "hole">;

/** A wormhole: line style for lifetime and mass, and a label chip in the column gap. */
export const ConnectionEdgeView = memo(function ConnectionEdgeView({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
  data,
}: EdgeProps<ConnectionEdge>) {
  const [bezier, bezierX, bezierY] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  if (!data) return null;
  const [path, labelX, labelY] = data.bow
    ? [
        `M ${sourceX},${sourceY} C ${sourceX + BOW},${sourceY} ${targetX + BOW},${targetY} ${targetX},${targetY}`,
        // Midpoint of that cubic.
        (sourceX + targetX) / 2 + 0.75 * BOW,
        (sourceY + targetY) / 2,
      ]
    : [bezier, bezierX, bezierY];
  const { look } = data;
  return (
    <>
      {selected && <path d={path} fill="none" stroke="#5cc8ff" strokeOpacity={0.25} strokeWidth={12} />}
      <BaseEdge
        id={id}
        path={path}
        interactionWidth={18}
        style={{
          stroke: look.color,
          strokeWidth: look.width,
          strokeDasharray: look.dash,
          strokeLinecap: "round",
          opacity: look.collapsed ? 0.35 : 1,
        }}
      />
      <EdgeLabelRenderer>
        <button
          type="button"
          onClick={data.onSelect}
          className={cn(
            "nodrag nopan pointer-events-auto absolute rounded-full border bg-space-900 px-2.5 py-0.5 font-sans text-2xs font-medium whitespace-nowrap text-ink tabular-nums",
            selected ? "border-accent" : "border-white/12",
            look.collapsed && "opacity-50",
          )}
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            borderColor: selected ? undefined : look.color === "#a3a8b2" ? undefined : look.color,
          }}
        >
          {data.label}
        </button>
      </EdgeLabelRenderer>
    </>
  );
});
