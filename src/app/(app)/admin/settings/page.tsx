import { Lock, Save } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { CorpLogo } from "@/components/ui/eve-image";
import { Panel } from "@/components/ui/glass";
import { requirePermission } from "@/core/auth/dal";
import { getCorporation } from "@/core/corp";
import { getDb, eveCorporations } from "@/core/db";
import { env, ssoCallbackUrl, ssoConfigured } from "@/core/env";
import { VALUATION_SOURCES } from "@/core/eve/prices";
import { allPermissions } from "@/core/modules/registry";
import { effectiveMinRole } from "@/core/rbac/permissions";
import { ROLE_META, ROLES } from "@/core/rbac/roles";
import { getSettings } from "@/core/settings";
import { saveSettings } from "../actions";

export const metadata = { title: "Settings" };

const selectClass = "glass-inset h-9 rounded-lg px-3 text-sm text-ink [color-scheme:dark]";

export default async function SettingsPage() {
  await requirePermission("app.settings.manage");
  const settings = await getSettings();
  const home = await getCorporation(settings["corp.homeCorporationId"]);
  const knownCorps = await getDb().select().from(eveCorporations).orderBy(eveCorporations.name);
  const perms = allPermissions();
  const groups = [...new Set(perms.map((p) => p.group))];
  const overrides = settings["permissions.overrides"];
  const e = env();

  return (
    <form action={saveSettings} className="space-y-6">
      <PageHeader
        eyebrow="Administration"
        title="Settings"
        description="Application-wide configuration. Changes apply immediately and are recorded in the audit log."
        actions={
          <Button type="submit" variant="primary">
            <Save className="size-4" aria-hidden /> Save settings
          </Button>
        }
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Home corporation" subtitle="Whose members, roster and refineries Keystar tracks">
          <div className="space-y-4">
            {home && (
              <div className="flex items-center gap-3 rounded-2xl glass-inset px-4 py-3">
                <CorpLogo id={home.corporationId} size={36} />
                <div>
                  <div className="font-medium">
                    {home.name} [{home.ticker}]
                  </div>
                  <div className="text-xs text-ink-3">ID {home.corporationId}</div>
                </div>
              </div>
            )}
            <label className="block text-sm">
              <span className="text-ink-2">Corporation ID</span>
              <input
                name="homeCorporationId"
                defaultValue={settings["corp.homeCorporationId"] ?? ""}
                list="known-corps"
                inputMode="numeric"
                className="glass-inset mt-1.5 h-9 w-full rounded-lg px-3 text-sm text-ink"
                placeholder="e.g. 98765432"
              />
              <datalist id="known-corps">
                {knownCorps.map((c) => (
                  <option key={c.corporationId} value={c.corporationId}>
                    {c.name} [{c.ticker}]
                  </option>
                ))}
              </datalist>
            </label>
            <p className="text-xs text-ink-3">
              Pick from corporations of linked characters or paste an ID (from zKillboard or EVE Who).
            </p>
          </div>
        </Panel>

        <Panel title="Access" subtitle="Who gets in without manual approval">
          <div className="space-y-3 text-sm">
            <label className="flex items-start gap-3 rounded-2xl glass-inset px-4 py-3">
              <input
                type="checkbox"
                name="autoApproveCorpMembers"
                defaultChecked={settings["access.autoApproveCorpMembers"]}
                className="mt-0.5 size-4 accent-[#5cc8ff]"
              />
              <span>
                <span className="font-medium">Auto-approve home corporation members</span>
                <span className="block text-xs text-ink-3">They start as Member; everyone else starts as Guest.</span>
              </span>
            </label>
            <label className="flex items-start gap-3 rounded-2xl glass-inset px-4 py-3">
              <input
                type="checkbox"
                name="autoApproveAllianceMembers"
                defaultChecked={settings["access.autoApproveAllianceMembers"]}
                className="mt-0.5 size-4 accent-[#5cc8ff]"
              />
              <span>
                <span className="font-medium">Auto-approve alliance members</span>
                <span className="block text-xs text-ink-3">Characters in the home corporation&apos;s alliance.</span>
              </span>
            </label>
            <div className="rounded-2xl glass-inset px-4 py-3 text-xs text-ink-2">
              <div className="mb-1 font-medium text-ink">EVE SSO</div>
              {ssoConfigured() ? "Configured" : "Not configured — set EVE_CLIENT_ID and EVE_CLIENT_SECRET."}
              <div className="mt-1 text-ink-3">
                Callback URL for developers.eveonline.com: <code className="text-ink-2">{ssoCallbackUrl()}</code>
              </div>
              <div className="mt-1 text-ink-3">ESI compatibility date: {e.ESI_COMPATIBILITY_DATE}</div>
            </div>
          </div>
        </Panel>

        <Panel title="Mining valuation" subtitle="How ISK values are calculated">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="text-ink-2">Price source</span>
              <select name="valuationSource" defaultValue={settings["mining.valuationSource"]} className={`${selectClass} mt-1.5 w-full`}>
                {VALUATION_SOURCES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-ink-2">Price date</span>
              <select name="valuationMode" defaultValue={settings["mining.valuationMode"]} className={`${selectClass} mt-1.5 w-full`}>
                <option value="current">Current prices</option>
                <option value="historical">Price on the day mined</option>
              </select>
            </label>
          </div>
          <p className="mt-3 text-xs text-ink-3">
            Raw ore without its own market falls back to its compressed variant, then the ESI average price. Historical
            prices are recorded daily from the moment Keystar runs.
          </p>
        </Panel>
      </div>

      <Panel
        title="Permissions"
        subtitle="Minimum Keystar role per permission. Roles are hierarchical: higher roles include everything below."
      >
        <div className="overflow-x-auto">
          <table className="ks-table">
            <thead>
              <tr>
                <th>Permission</th>
                <th>Description</th>
                <th>Minimum role</th>
              </tr>
            </thead>
            <tbody>
              {groups.flatMap((g) => [
                <tr key={`g-${g}`}>
                  <td colSpan={3} className="eve-label pt-4 text-xs text-accent">
                    {g}
                  </td>
                </tr>,
                ...perms
                  .filter((p) => p.group === g)
                  .map((p) => (
                    <tr key={p.key}>
                      <td>
                        <div className="font-medium">{p.label}</div>
                        <code className="text-2xs text-ink-3">{p.key}</code>
                      </td>
                      <td className="text-ink-2">{p.description}</td>
                      <td>
                        {p.locked ? (
                          <span className="inline-flex items-center gap-1.5 text-xs text-ink-3">
                            <Lock className="size-3.5" aria-hidden /> {ROLE_META[p.defaultMinRole].label} (fixed)
                          </span>
                        ) : (
                          <select name={`perm:${p.key}`} defaultValue={effectiveMinRole(p, overrides)} className={selectClass}>
                            {ROLES.map((r) => (
                              <option key={r} value={r}>
                                {ROLE_META[r].label}
                                {r === p.defaultMinRole ? " (default)" : ""}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                    </tr>
                  )),
              ])}
            </tbody>
          </table>
        </div>
      </Panel>
    </form>
  );
}
