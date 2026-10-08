import { useState, type DragEvent } from "react";
import { DRAG_MIME } from "./shared";

function droppedTypeId(e: DragEvent): number | null {
  const id = Number(e.dataTransfer.getData(DRAG_MIME));
  return Number.isFinite(id) && id > 0 ? id : null;
}

/** Drag-and-drop handlers for a slot: accepts items dragged from the browser and reports hovering. */
export function useDropTarget(onDropType: (typeId: number) => void) {
  const [over, setOver] = useState(false);
  return {
    over,
    handlers: {
      onDragOver: (ev: DragEvent) => {
        if (!ev.dataTransfer.types.includes(DRAG_MIME)) return;
        ev.preventDefault();
        ev.dataTransfer.dropEffect = "copy";
        if (!over) setOver(true);
      },
      onDragLeave: () => setOver(false),
      onDrop: (ev: DragEvent) => {
        ev.preventDefault();
        setOver(false);
        const id = droppedTypeId(ev);
        if (id) onDropType(id);
      },
    },
  };
}
