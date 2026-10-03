"use client";

import { CheckCircle2 } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import type { Role } from "@/core/rbac/roles";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { updateUserRole } from "../actions";

/**
 * Role picker for one row of the users table. The save button only appears once
 * a different role is picked. The form is submitted by hand rather than through
 * `<form action>`, whose automatic reset would put the select back on the role
 * it was first rendered with.
 */
export function RoleSelect({
  userId,
  userName,
  role,
  options,
}: {
  userId: string;
  userName: string | null;
  role: Role;
  /** Roles to list, in order; `assignable: false` shows the current role without offering it. */
  options: { role: Role; assignable: boolean }[];
}) {
  const { t } = useI18n();
  const tu = t.admin.users;
  const { toast } = useToast();
  const [saved, setSaved] = useState(role);
  const [value, setValue] = useState(role);
  const [pending, startTransition] = useTransition();

  // A newer role from the server (after a save or another admin's change) wins.
  const [serverRole, setServerRole] = useState(role);
  if (role !== serverRole) {
    setServerRole(role);
    setSaved(role);
    setValue(role);
  }

  const name = userName ?? tu.unknown;
  const label = (r: Role) => t.common.roles[r].label;
  const canAssign = (r: Role) => options.some((o) => o.role === r && o.assignable);

  const save = (to: Role, from: Role, isUndo = false) =>
    startTransition(async () => {
      let result: Awaited<ReturnType<typeof updateUserRole>> | null = null;
      try {
        result = await updateUserRole(userId, to, from);
      } catch {
        // Signed out or lost the permission mid-session; the message covers both.
      }
      if (!result?.ok) {
        setValue(from);
        toast({
          tone: "critical",
          title: tu.roleChange.failed(name),
          description: tu.roleChange.errors[result?.error ?? "unknown"],
        });
        return;
      }
      const previous = result.from;
      setSaved(to);
      setValue(to);
      toast({
        tone: "good",
        title: isUndo ? tu.roleChange.restored(name, label(to)) : tu.roleChange.changed(name, label(to)),
        description: isUndo ? undefined : tu.roleChange.from(label(previous)),
        action:
          !isUndo && canAssign(previous)
            ? { label: t.common.toast.undo, onClick: () => save(previous, to, true) }
            : undefined,
      });
    });

  const dirty = value !== saved;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (dirty) save(value, saved);
      }}
      className="flex items-center gap-1.5"
    >
      <select
        name="role"
        value={value}
        onChange={(e) => setValue(e.target.value as Role)}
        disabled={pending}
        className={cn(
          "glass-inset h-8 min-w-28 rounded-lg px-2.5 text-xs text-ink disabled:opacity-60",
          dirty && "ring-1 ring-accent/50",
        )}
        aria-label={tu.roleFor(userName)}
      >
        {options.map((o) => (
          <option key={o.role} value={o.role} disabled={!o.assignable}>
            {label(o.role)}
          </option>
        ))}
      </select>
      {/* Hidden rather than removed so the column keeps its width. */}
      <Button
        size="sm"
        variant="primary"
        type="submit"
        title={tu.saveRole}
        aria-label={tu.saveRole}
        disabled={pending}
        className={cn(!dirty && "invisible")}
      >
        <CheckCircle2 className="size-3.5" aria-hidden />
      </Button>
    </form>
  );
}
