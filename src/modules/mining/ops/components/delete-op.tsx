"use client";

import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Delete button that asks first; the action redirects to the op list. */
export function DeleteOpForm({ action, label, confirm }: { action: () => Promise<unknown>; label: string; confirm: string }) {
  return (
    <form
      action={async () => {
        await action();
      }}
      onSubmit={(e) => {
        if (!window.confirm(confirm)) e.preventDefault();
      }}
    >
      <Button type="submit" variant="danger">
        <Trash2 className="size-4" aria-hidden /> {label}
      </Button>
    </form>
  );
}
