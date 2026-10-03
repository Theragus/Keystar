import { sql } from "drizzle-orm";
import { ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { CopyField } from "@/components/ui/copy-button";
import { EmptyState } from "@/components/ui/empty-state";
import { Portrait } from "@/components/ui/eve-image";
import { Glass, Panel } from "@/components/ui/glass";
import { StatTile } from "@/components/ui/stat-tile";
import { requirePermission } from "@/core/auth/dal";
import { getDb } from "@/core/db";
import { env } from "@/core/env";
import { characterScopes } from "@/core/modules/registry";
import { getSetting } from "@/core/settings";
import { getI18n } from "@/i18n/server";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t.admin.members.metaTitle };
}

interface AuditRow {
  id: string;
  name: string | null;
  in_roster: boolean;
  registered: boolean;
  main_name: string | null;
  status: string | null;
  scopes: string[] | null;
}

export default async function MemberAuditPage() {
  await requirePermission("members.audit");
  const { t, f } = await getI18n();
  const tm = t.admin.members;
  const home = await getSetting("corp.homeCorporationId");
  if (!home) {
    return (
      <Glass className="mx-auto mt-10 max-w-xl">
        <EmptyState icon={ShieldCheck} title={tm.noHome.title}>
          {tm.noHome.body(t.shell.nav.settings)}
        </EmptyState>
      </Glass>
    );
  }

  const required = characterScopes();
  const rows = (await getDb().execute<Record<string, unknown>>(sql`
    WITH roster AS (SELECT character_id FROM corporation_members WHERE corporation_id = ${home}),
    corp_chars AS (SELECT * FROM characters WHERE corporation_id = ${home})
    SELECT COALESCE(r.character_id, c.character_id)::text AS id,
           COALESCE(c.name, e.name) AS name,
           (r.character_id IS NOT NULL) AS in_roster,
           (c.character_id IS NOT NULL) AS registered,
           mc.name AS main_name, t.status, t.scopes
    FROM roster r
    FULL OUTER JOIN corp_chars c ON c.character_id = r.character_id
    LEFT JOIN eve_entities e ON e.id = r.character_id
    LEFT JOIN users u ON u.id = c.user_id
    LEFT JOIN characters mc ON mc.character_id = u.main_character_id
    LEFT JOIN esi_tokens t ON t.character_id = c.character_id
    ORDER BY (c.character_id IS NULL) DESC, 2`)) as unknown as AuditRow[];

  const rosterKnown = rows.some((r) => r.in_roster);
  const roster = rows.filter((r) => r.in_roster).length;
  const registered = rows.filter((r) => r.registered && (r.in_roster || !rosterKnown)).length;
  const unregistered = rows.filter((r) => r.in_roster && !r.registered).length;
  const missingScopes = rows.filter(
    (r) => r.registered && (r.status !== "active" || required.some((s) => !(r.scopes ?? []).includes(s))),
  ).length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t.shell.navSections.admin}
        title={t.shell.nav.members}
        description={tm.description}
      />

      <div className="grid gap-4 md:grid-cols-4">
        <StatTile
          label={tm.stats.roster}
          value={rosterKnown ? f.integer(roster) : "—"}
          hint={rosterKnown ? undefined : tm.stats.rosterHint}
        />
        <StatTile
          label={tm.stats.registered}
          value={f.integer(registered)}
          hint={rosterKnown && roster ? tm.stats.ofRoster(f.percent(registered / roster, 0)) : undefined}
        />
        <StatTile label={tm.stats.notRegistered} value={rosterKnown ? f.integer(unregistered) : "—"} />
        <StatTile label={tm.stats.missingEsi} value={f.integer(missingScopes)} />
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        <Glass className="overflow-hidden xl:col-span-8">
          <div className="overflow-x-auto px-2 py-2">
            <table className="ks-table">
              <thead>
                <tr>
                  <th>{tm.columns.character}</th>
                  <th>{tm.columns.status}</th>
                  <th>{tm.columns.account}</th>
                  <th>{tm.columns.esi}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const missing = required.filter((s) => !(r.scopes ?? []).includes(s));
                  return (
                    <tr key={r.id}>
                      <td>
                        <div className="flex items-center gap-2.5">
                          <Portrait id={Number(r.id)} size={28} />
                          <span className="font-medium">{r.name ?? tm.characterFallback(r.id)}</span>
                        </div>
                      </td>
                      <td>
                        {!r.registered ? (
                          <StatusBadge status="warning" label={tm.status.notRegistered} />
                        ) : rosterKnown && !r.in_roster ? (
                          <Badge>{tm.status.notInRoster}</Badge>
                        ) : (
                          <StatusBadge status="ok" label={tm.status.registered} />
                        )}
                      </td>
                      <td className="text-ink-2">{r.main_name ?? "—"}</td>
                      <td>
                        {!r.registered ? (
                          <span className="text-ink-3">—</span>
                        ) : r.status === "invalid" ? (
                          <StatusBadge status="error" label={tm.esi.tokenRevoked} />
                        ) : !r.status ? (
                          <StatusBadge status="warning" label={tm.esi.noToken} />
                        ) : missing.length ? (
                          <StatusBadge status="warning" label={tm.esi.missing(missing.length)} />
                        ) : (
                          <StatusBadge status="ok" label={tm.esi.complete} />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Glass>
        <div className="space-y-4 xl:col-span-4">
          <Panel title={tm.request.title} subtitle={tm.request.subtitle}>
            <CopyField value={`${env().APP_URL}/join`} />
            <p className="mt-3 text-xs text-ink-2">{tm.request.body(t.shell.nav.characters)}</p>
          </Panel>
          {!rosterKnown && (
            <Panel title={tm.rosterUnavailable.title} subtitle={tm.rosterUnavailable.subtitle}>
              <p className="text-xs text-ink-2">
                {tm.rosterUnavailable.body(<code>esi-corporations.read_corporation_membership.v1</code>, t.shell.nav.characters)}
              </p>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
