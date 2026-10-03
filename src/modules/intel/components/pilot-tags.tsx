"use client";

import { useState, type ReactNode } from "react";

export function PilotTags({ items }: { items: { id: number; affiliationId: string; color: string; title: string; content: ReactNode }[] }) {
  const [selected, setSelected] = useState<number | null>(null);
  const selectedPilot = items.find(item => item.id === selected);
  return <div className="flex flex-wrap gap-1.5">
    {items.map(item => {
      const highlighted = selectedPilot ? item.affiliationId === selectedPilot.affiliationId : false;
      return <button key={item.id} type="button" aria-pressed={highlighted} title={item.title} onClick={() => setSelected(selected === item.id ? null : item.id)} style={{ backgroundColor: `color-mix(in srgb, ${item.color} ${highlighted ? 32 : 14}%, transparent)`, borderColor: highlighted ? item.color : "transparent", opacity: selectedPilot && !highlighted ? 0.45 : 1 }} className="inline-flex max-w-full cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-[opacity,background-color] focus-visible:outline-2 focus-visible:outline-accent">
        {item.content}
      </button>;
    })}
  </div>;
}
