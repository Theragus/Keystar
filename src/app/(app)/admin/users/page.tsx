import { sql } from "drizzle-orm";
import { ArrowRight, Ban, CheckCircle2, UserCheck } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { Badge, RoleBadge, StatusBadge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Portrait } from "@/components/ui/eve-image";
import { Glass, Panel } from "@/components/ui/glass";
import { requirePermission } from "@/core/auth/dal";
import { getDb } from "@/core/db";
import { characterScopes } from "@/core/modules/registry";
import { assignableRoles, canManageRole, isRole, ROLE_META, ROLES, type Role } from "@/core/rbac/roles";
import { relativeTime } from "@/lib/format";
import { zkillCharacter } from "@/modules/killboard/links";
import { approveUser, setUserDisabled, updateUserRole } from "../actions";

export const metadata = { title: "Users & roles" };

interface UserRow {
  id: string;
  role: Role;
  is_disabled: boolean;
  last_login_at: string | null;
  created_at: string;
  main_id: string | null;
  main_name: string | null;
  corp_ticker: string | null;
  characters: { id: number; name: string; status: string | null; scopes: string[] | null }[];
}

export default async function UsersPage({ searchParams }: PageProps<"/admin/users">) {
  const actor = await requirePermission("users.view");
  const canManage = actor.can("users.manage");
  const canAudit = actor.can("members.audit");
  const roleParam = (await searchParams).role;
  const roleFilter = isRole(roleParam) ? roleParam : null;
  const required = characterScopes();

  const rows = await getDb().execute<Record<string, unknown>>(sql`
    SELECT u.id, u.role, u.is_disabled, u.last_login_at, u.created_at,
           mc.character_id::text AS main_id, mc.name AS main_name, co.ticker AS corp_ticker,
           COALESCE(json_agg(json_build_object('id', c.character_id, 'name', c.name, 'status', t.status, 'scopes', t.scopes)
             ORDER BY c.name) FILTER (WHERE c.character_id IS NOT NULL), '[]') AS characters
    FROM users u
    LEFT JOIN characters mc ON mc.character_id = u.main_character_id
    LEFT JOIN eve_corporations co ON co.corporation_id = mc.corporation_id
    LEFT JOIN characters c ON c.user_id = u.id
    LEFT JOIN esi_tokens t ON t.character_id = c.character_id
    GROUP BY u.id, mc.character_id, mc.name, co.ticker
    ORDER BY (u.role = 'guest') DESC, u.last_login_at DESC NULLS LAST`);
  const users = rows as unknown as UserRow[];
  const pending = users.filter((u) => u.role === "guest" && !u.is_disabled);
  const assignable = assignableRoles(actor.role);
  // Role cards filter the table; counts and the approval queue always cover everyone.
  const shown = roleFilter ? users.filter((u) => u.role === roleFilter) : users;
  const manageable = (u: UserRow) => canManage && u.id !== actor.id && canManageRole(actor.role, u.role);
  const showActions = shown.some(manageable);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Administration"
        title="Users & Roles"
        description="Keystar roles control what each account can see and change. They are independent of in-game corporation roles."
        actions={
          actor.can("app.settings.manage") ? (
            <ButtonLink href="/admin/settings#permissions" size="sm">
              Role permissions <ArrowRight className="size-3.5" aria-hidden />
            </ButtonLink>
          ) : undefined
        }
      />

      <div className="grid gap-4 lg:grid-cols-3 xl:grid-cols-6">
        {[...ROLES].reverse().map((r) => {
          const count = users.filter((u) => u.role === r).length;
          const active = roleFilter === r;
          const body = (
            <>
              <div className="flex items-center justify-between">
                <RoleBadge role={r} />
                <span className="text-lg font-semibold tabular-nums">{count}</span>
              </div>
              <p className="mt-2 text-2xs leading-snug text-ink-3">{ROLE_META[r].description}</p>
            </>
          );
          // An empty role has nothing to filter to.
          if (!count && !active) {
            return (
              <Glass key={r} className="px-4 py-3.5 opacity-60">
                {body}
              </Glass>
            );
          }
          return (
            <Glass
              key={r}
              as={Link}
              href={active ? "/admin/users" : `/admin/users?role=${r}`}
              scroll={false}
              aria-current={active ? "true" : undefined}
              title={active ? "Show all users" : `Show only ${ROLE_META[r].label.toLowerCase()}s`}
              className="glass-link px-4 py-3.5"
            >
              {body}
            </Glass>
          );
        })}
      </div>

      {pending.length > 0 && canManage && (
        <Panel title={`Awaiting approval (${pending.length})`} subtitle="Signed in from outside the home corporation or before auto-approval">
          <ul className="divide-y divide-white/6">
            {pending.map((u) => (
              <li key={u.id} className="flex items-center gap-3 py-2.5">
                {u.main_id && <Portrait id={Number(u.main_id)} size={32} />}
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{u.main_name ?? "Unknown"}</div>
                  <div className="text-xs text-ink-3">
                    {u.corp_ticker ? `[${u.corp_ticker}] · ` : ""}registered {relativeTime(u.created_at)}
                  </div>
                </div>
                <form action={approveUser.bind(null, u.id)}>
                  <Button size="sm" variant="primary" type="submit">
                    <UserCheck className="size-3.5" aria-hidden /> Approve as member
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {roleFilter && (
        <div className="flex items-center gap-2 text-sm text-ink-2">
          <span>
            Showing {shown.length} {ROLE_META[roleFilter].label.toLowerCase()}
            {shown.length === 1 ? "" : "s"}
          </span>
          <span className="text-ink-3">·</span>
          <Link href="/admin/users" scroll={false} className="text-accent hover:underline">
            Show all
          </Link>
        </div>
      )}

      <Glass className="overflow-hidden">
        <div className="overflow-x-auto px-2 py-2">
          <table className="ks-table">
            <thead>
              <tr>
                <th>Pilot</th>
                <th>Characters</th>
                <th>ESI health</th>
                <th>Last login</th>
                <th>Role</th>
                {showActions && <th className="text-right">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 && (
                <tr>
                  <td colSpan={showActions ? 6 : 5} className="py-6 text-center text-ink-3">
                    No users with this role.
                  </td>
                </tr>
              )}
              {shown.map((u) => {
                const invalid = u.characters.filter((c) => c.status === "invalid").length;
                const missing = u.characters.filter((c) => !c.scopes || required.some((s) => !c.scopes!.includes(s))).length;
                const own = u.id === actor.id;
                const canChange = manageable(u);
                const tokenTrouble = !u.is_disabled && (invalid > 0 || missing > 0);
                // Where a token problem gets fixed: your own characters page, or the member audit for others.
                const fixHref = !tokenTrouble ? null : own ? "/characters" : canAudit ? "/admin/members" : null;
                const health = u.is_disabled ? (
                  <StatusBadge status="error" label="Disabled" />
                ) : invalid ? (
                  <StatusBadge status="error" label={`${invalid} revoked`} />
                ) : missing ? (
                  <StatusBadge status="warning" label={`${missing} char${missing > 1 ? "s" : ""} missing scopes`} />
                ) : (
                  <StatusBadge status="ok" label="All good" />
                );
                return (
                  <tr key={u.id} className={u.is_disabled ? "opacity-50" : undefined}>
                    <td>
                      <div className="flex items-center gap-2.5">
                        {u.main_id && <Portrait id={Number(u.main_id)} size={30} />}
                        <div className="leading-tight">
                          <div className="font-medium">
                            {u.main_name ?? "Unknown"} {own && <span className="text-xs text-ink-3">(you)</span>}
                          </div>
                          <div className="text-2xs text-ink-3">{u.corp_ticker ? `[${u.corp_ticker}]` : "—"}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="flex max-w-[340px] flex-wrap gap-1">
                        {u.characters.map((c) => (
                          <a
                            key={c.id}
                            href={zkillCharacter(c.id)}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={`${c.name} on zKillboard`}
                            className="rounded-full transition hover:brightness-150"
                          >
                            <Badge tone={c.status === "invalid" ? "critical" : "neutral"}>{c.name}</Badge>
                          </a>
                        ))}
                      </div>
                    </td>
                    <td>
                      {fixHref ? (
                        <Link
                          href={fixHref}
                          title={own ? "Fix on My Characters" : "Open Member Audit"}
                          className="inline-flex rounded-full transition hover:brightness-150"
                        >
                          {health}
                        </Link>
                      ) : (
                        health
                      )}
                    </td>
                    <td className="text-ink-2">{relativeTime(u.last_login_at)}</td>
                    <td>
                      {canChange ? (
                        <form action={updateUserRole.bind(null, u.id)} className="flex items-center gap-1.5">
                          <select
                            name="role"
                            defaultValue={u.role}
                            className="glass-inset h-8 rounded-lg px-2.5 text-xs text-ink [color-scheme:dark]"
                            aria-label={`Role for ${u.main_name ?? "user"}`}
                          >
                            {ROLES.filter((r) => assignable.includes(r) || r === u.role).map((r) => (
                              <option key={r} value={r} disabled={!assignable.includes(r)}>
                                {ROLE_META[r].label}
                              </option>
                            ))}
                          </select>
                          <Button size="sm" type="submit" title="Save role">
                            <CheckCircle2 className="size-3.5" aria-hidden />
                          </Button>
                        </form>
                      ) : (
                        <RoleBadge role={u.role} />
                      )}
                    </td>
                    {showActions && (
                      <td className="text-right">
                        {canChange ? (
                          <form action={setUserDisabled.bind(null, u.id, !u.is_disabled)}>
                            <Button size="sm" variant={u.is_disabled ? "glass" : "danger"} type="submit">
                              <Ban className="size-3.5" aria-hidden /> {u.is_disabled ? "Enable" : "Disable"}
                            </Button>
                          </form>
                        ) : (
                          <span
                            className="text-ink-3"
                            title={own ? "You can't disable your own account" : "Only a higher role can change this account"}
                          >
                            —
                          </span>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Glass>
    </div>
  );
}
