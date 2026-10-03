import { sql } from "drizzle-orm";
import { Ban, CheckCircle2, UserCheck } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Badge, RoleBadge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Portrait } from "@/components/ui/eve-image";
import { Glass, Panel } from "@/components/ui/glass";
import { requirePermission } from "@/core/auth/dal";
import { getDb } from "@/core/db";
import { characterScopes } from "@/core/modules/registry";
import { assignableRoles, canManageRole, ROLES, type Role } from "@/core/rbac/roles";
import { getI18n } from "@/i18n/server";
import { approveUser, setUserDisabled, updateUserRole } from "../actions";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t.admin.users.metaTitle };
}

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

export default async function UsersPage() {
  const actor = await requirePermission("users.view");
  const { t, f } = await getI18n();
  const tu = t.admin.users;
  const canManage = actor.can("users.manage");
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

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t.shell.navSections.admin}
        title={t.shell.nav.users}
        description={tu.description}
      />

      <div className="grid gap-4 lg:grid-cols-3 xl:grid-cols-6">
        {[...ROLES].reverse().map((r) => (
          <Glass key={r} className="px-4 py-3.5">
            <div className="flex items-center justify-between">
              <RoleBadge role={r} />
              <span className="text-lg font-semibold tabular-nums">{f.integer(users.filter((u) => u.role === r).length)}</span>
            </div>
            <p className="mt-2 text-2xs leading-snug text-ink-3">{t.common.roles[r].description}</p>
          </Glass>
        ))}
      </div>

      {pending.length > 0 && canManage && (
        <Panel title={tu.awaitingApproval(pending.length)} subtitle={tu.awaitingApprovalHint}>
          <ul className="divide-y divide-white/6">
            {pending.map((u) => (
              <li key={u.id} className="flex items-center gap-3 py-2.5">
                {u.main_id && <Portrait id={Number(u.main_id)} size={32} />}
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{u.main_name ?? tu.unknown}</div>
                  <div className="text-xs text-ink-3">
                    {u.corp_ticker ? `[${u.corp_ticker}] · ` : ""}
                    {tu.registered(f.relativeTime(u.created_at))}
                  </div>
                </div>
                <form action={approveUser.bind(null, u.id)}>
                  <Button size="sm" variant="primary" type="submit">
                    <UserCheck className="size-3.5" aria-hidden /> {tu.approve}
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Glass className="overflow-hidden">
        <div className="overflow-x-auto px-2 py-2">
          <table className="ks-table">
            <thead>
              <tr>
                <th>{tu.columns.pilot}</th>
                <th>{tu.columns.characters}</th>
                <th>{tu.columns.esiHealth}</th>
                <th>{tu.columns.lastLogin}</th>
                <th>{tu.columns.role}</th>
                {canManage && <th className="text-right">{tu.columns.actions}</th>}
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const invalid = u.characters.filter((c) => c.status === "invalid").length;
                const missing = u.characters.filter((c) => !c.scopes || required.some((s) => !c.scopes!.includes(s))).length;
                const manageable = canManage && u.id !== actor.id && canManageRole(actor.role, u.role);
                return (
                  <tr key={u.id} className={u.is_disabled ? "opacity-50" : undefined}>
                    <td>
                      <div className="flex items-center gap-2.5">
                        {u.main_id && <Portrait id={Number(u.main_id)} size={30} />}
                        <div className="leading-tight">
                          <div className="font-medium">
                            {u.main_name ?? tu.unknown} {u.id === actor.id && <span className="text-xs text-ink-3">{tu.you}</span>}
                          </div>
                          <div className="text-2xs text-ink-3">{u.corp_ticker ? `[${u.corp_ticker}]` : "—"}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="flex max-w-[340px] flex-wrap gap-1">
                        {u.characters.map((c) => (
                          <Badge key={c.id} tone={c.status === "invalid" ? "critical" : "neutral"}>
                            {c.name}
                          </Badge>
                        ))}
                      </div>
                    </td>
                    <td>
                      {u.is_disabled ? (
                        <StatusBadge status="error" label={tu.health.disabled} />
                      ) : invalid ? (
                        <StatusBadge status="error" label={tu.health.revoked(invalid)} />
                      ) : missing ? (
                        <StatusBadge status="warning" label={tu.health.missingScopes(missing)} />
                      ) : (
                        <StatusBadge status="ok" label={tu.health.allGood} />
                      )}
                    </td>
                    <td className="text-ink-2">{f.relativeTime(u.last_login_at)}</td>
                    <td>
                      {manageable ? (
                        <form action={updateUserRole.bind(null, u.id)} className="flex items-center gap-1.5">
                          <select
                            name="role"
                            defaultValue={u.role}
                            className="glass-inset h-8 rounded-lg px-2.5 text-xs text-ink [color-scheme:dark]"
                            aria-label={tu.roleFor(u.main_name)}
                          >
                            {ROLES.filter((r) => assignable.includes(r) || r === u.role).map((r) => (
                              <option key={r} value={r} disabled={!assignable.includes(r)}>
                                {t.common.roles[r].label}
                              </option>
                            ))}
                          </select>
                          <Button size="sm" type="submit" title={tu.saveRole}>
                            <CheckCircle2 className="size-3.5" aria-hidden />
                          </Button>
                        </form>
                      ) : (
                        <RoleBadge role={u.role} />
                      )}
                    </td>
                    {canManage && (
                      <td className="text-right">
                        {manageable && (
                          <form action={setUserDisabled.bind(null, u.id, !u.is_disabled)}>
                            <Button size="sm" variant={u.is_disabled ? "glass" : "danger"} type="submit">
                              <Ban className="size-3.5" aria-hidden /> {u.is_disabled ? tu.enable : tu.disable}
                            </Button>
                          </form>
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
