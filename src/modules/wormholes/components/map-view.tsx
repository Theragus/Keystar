"use client";

import "@xyflow/react/dist/style.css";
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  MiniMap,
  ReactFlow,
  type NodeChange,
  type OnConnect,
} from "@xyflow/react";
import { useCallback, useMemo, useState } from "react";
import type { Messages } from "@/i18n/messages";
import { classBadgeStyle } from "../class-colors";
import { NODE_H, NODE_W, spanningTree, type Point } from "../layout";
import { connectionLabel, edgeLook } from "../presentation";
import type { WormholeType } from "../static";
import type { MapState } from "../state";
import { ConnectionEdgeView, type ConnectionEdge } from "./connection-edge";
import { SystemNodeView, type SystemNode } from "./system-node";

export type Selection = { kind: "system"; id: number } | { kind: "connection"; id: string } | null;

const nodeTypes = { system: SystemNodeView };
const edgeTypes = { hole: ConnectionEdgeView };
const FIT = { padding: 0.2, maxZoom: 1 };

export interface MapViewProps {
  state: MapState;
  types: Record<string, WormholeType>;
  now: number;
  selection: Selection;
  editable: boolean;
  tw: Messages["wormholes"];
  onSelect: (selection: Selection) => void;
  onMove: (moves: { id: number; x: number; y: number }[]) => void;
  onConnect: (from: number, to: number) => void;
  /** Hands the shell a way to fit the view (toolbar button, F key). */
  onReady: (fit: () => void) => void;
}

/** The chain canvas: pan, zoom, drag systems, drag between systems to connect them. */
export default function MapView({
  state,
  types,
  now,
  selection,
  editable,
  tw,
  onSelect,
  onMove,
  onConnect,
  onReady,
}: MapViewProps) {
  // Positions of systems while they are being dragged; a poll arriving mid-drag can't move them.
  const [dragging, setDragging] = useState<Map<number, Point>>(() => new Map());

  const span = useMemo(() => spanningTree(state.systems, state.connections, state.home), [state]);

  const position = useCallback(
    (id: number): Point => {
      const s = state.systems.find((x) => x.id === id);
      return dragging.get(id) ?? { x: s?.x ?? 0, y: s?.y ?? 0 };
    },
    [state.systems, dragging],
  );

  const nodes = useMemo<SystemNode[]>(
    () =>
      state.systems.map((s) => ({
        id: String(s.id),
        type: "system",
        position: position(s.id),
        width: NODE_W,
        height: NODE_H,
        draggable: editable,
        selected: selection?.kind === "system" && selection.id === s.id,
        data: { system: s, home: s.id === state.home, editable, homeLabel: tw.panel.home },
      })),
    [state.systems, state.home, position, editable, selection, tw],
  );

  const edges = useMemo<ConnectionEdge[]>(
    () =>
      state.connections.map((c) => {
        // Drawn parent → child along the tree from home; loops left to right.
        const [source, target] =
          span.parent.get(c.b) === c.a
            ? [c.a, c.b]
            : span.parent.get(c.a) === c.b
              ? [c.b, c.a]
              : position(c.a).x <= position(c.b).x
                ? [c.a, c.b]
                : [c.b, c.a];
        const dx = position(target).x - position(source).x;
        // Same column (a loop between siblings): bow out to the right instead of cutting across nodes.
        const sameColumn = Math.abs(dx) < NODE_W;
        return {
          id: c.id,
          type: "hole",
          source: String(source),
          target: String(target),
          sourceHandle: sameColumn || dx >= 0 ? "r" : "l",
          targetHandle: sameColumn || dx < 0 ? "r" : "l",
          selected: selection?.kind === "connection" && selection.id === c.id,
          data: {
            look: edgeLook(c, now),
            bow: sameColumn,
            label: connectionLabel(c, types, now, tw),
            onSelect: () => onSelect({ kind: "connection", id: c.id }),
          },
        };
      }),
    [state.connections, span, position, selection, now, types, tw, onSelect],
  );

  const onNodesChange = useCallback((changes: NodeChange<SystemNode>[]) => {
    const moved = changes.flatMap((c) => (c.type === "position" && c.position ? [{ id: Number(c.id), p: c.position }] : []));
    if (!moved.length) return;
    setDragging((prev) => {
      const next = new Map(prev);
      for (const m of moved) next.set(m.id, m.p);
      return next;
    });
  }, []);

  const connect = useCallback<OnConnect>(
    (c) => {
      if (c.source && c.target && c.source !== c.target) onConnect(Number(c.source), Number(c.target));
    },
    [onConnect],
  );

  return (
    <ReactFlow<SystemNode, ConnectionEdge>
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      colorMode="dark"
      connectionMode={ConnectionMode.Loose}
      nodesDraggable={editable}
      nodesConnectable={editable}
      deleteKeyCode={null}
      multiSelectionKeyCode={null}
      selectionKeyCode={null}
      snapToGrid
      snapGrid={[20, 20]}
      minZoom={0.2}
      maxZoom={2}
      fitView
      fitViewOptions={FIT}
      onInit={(flow) => onReady(() => void flow.fitView({ ...FIT, duration: 300 }))}
      onNodesChange={onNodesChange}
      onNodeDragStop={(_event, _node, dragged) => {
        onMove(dragged.map((n) => ({ id: Number(n.id), x: n.position.x, y: n.position.y })));
        setDragging(new Map());
      }}
      onConnect={connect}
      onNodeClick={(_event, node) => onSelect({ kind: "system", id: Number(node.id) })}
      onEdgeClick={(_event, edge) => onSelect({ kind: "connection", id: edge.id })}
      onPaneClick={() => onSelect(null)}
      className="wh-map"
    >
      <Background variant={BackgroundVariant.Dots} gap={20} size={1.2} />
      <Controls showInteractive={false} position="bottom-left" />
      <MiniMap
        pannable
        zoomable
        position="bottom-right"
        nodeColor={(n) => {
          const s = (n as SystemNode).data.system;
          return classBadgeStyle(s.cls, s.sec).background;
        }}
        style={{ width: 160, height: 110 }}
      />
    </ReactFlow>
  );
}
