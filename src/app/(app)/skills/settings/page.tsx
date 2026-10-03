import { GraduationCap, KeyRound, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { StatusBadge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Portrait } from "@/components/ui/eve-image";
import { Glass, Panel } from "@/components/ui/glass";
import { requirePermission } from "@/core/auth/dal";
import { env } from "@/core/env";
import { reauthorizeHref } from "@/core/modules/registry";
import { getI18n } from "@/i18n/server";
import { SubmitButton } from "@/modules/mining/pnl/components/form-controls";
import { SKILLS_MANAGE_HREF, SKILLS_PERMISSIONS, SKILLS_SCOPES } from "@/modules/skills/module";
import { getSkillsAccess } from "@/modules/skills/queries";
import { deleteSkillData } from "../actions";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t.skills.metaTitle.settings };
}

export default async function SkillsSettingsPage() {
  const user = await requirePermission(SKILLS_PERMISSIONS.viewOwn, SKILLS_PERMISSIONS.viewCorp);
  const { t, f } = await getI18n();
  const s = t.skills;
  const m = s.settings;
  const demo = env().KEYSTAR_DEMO_MODE;
  const access = await getSkillsAccess(user.id);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={s.module.navSection} title={s.metaTitle.settings} description={m.description} />

      <Panel title={m.title} subtitle={m.subtitle}>
        <div className="space-y-3">
          {access.map((a) => {
            const partial = !a.granted && SKILLS_SCOPES.some((scope) => a.grantedScopes.includes(scope));
            const enable = reauthorizeHref(a.grantedScopes, { add: SKILLS_SCOPES, returnTo: SKILLS_MANAGE_HREF });
            const stop = reauthorizeHref(a.grantedScopes, { remove: SKILLS_SCOPES, returnTo: SKILLS_MANAGE_HREF });
            const anyGranted = a.granted || partial;
            return (
              <Glass key={a.characterId} className="flex flex-wrap items-center gap-4 rounded-2xl px-4 py-3">
                <Portrait id={a.characterId} size={44} />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-ink">{a.name}</span>
                    {a.tokenStatus === "invalid" ? (
                      <StatusBadge status="error" label={m.revoked} />
                    ) : a.granted ? (
                      <StatusBadge status={a.lastStatus === "error" ? "warning" : "ok"} label={m.on} />
                    ) : partial ? (
                      <StatusBadge status="warning" label={m.partial} />
                    ) : (
                      <StatusBadge status="pending" label={m.off} />
                    )}
                  </div>
                  <p className="text-xs text-ink-3">
                    {anyGranted
                      ? a.lastSuccessAt
                        ? m.lastSync(f.relativeTime(a.lastSuccessAt))
                        : m.firstSync
                      : a.hasData
                        ? m.kept
                        : m.nothing}
                    {anyGranted && a.lastStatus === "error" && a.lastError ? ` · ${a.lastError}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  {demo ? (
                    <Button size="sm" disabled title={m.demo}>
                      <KeyRound className="size-3.5" aria-hidden /> {a.granted ? m.stop : m.enable}
                    </Button>
                  ) : (
                    <>
                      {anyGranted && (
                        <ButtonLink href={stop} size="sm" variant="ghost">
                          {m.stop}
                        </ButtonLink>
                      )}
                      {!a.granted && (
                        <ButtonLink href={enable} size="sm" variant="primary">
                          <GraduationCap className="size-3.5" aria-hidden /> {m.enable}
                        </ButtonLink>
                      )}
                    </>
                  )}
                  {!anyGranted && a.hasData && (
                    <form action={deleteSkillData.bind(null, a.characterId)}>
                      <SubmitButton variant="danger" title={m.deleteDataHint}>
                        <Trash2 className="size-3.5" aria-hidden /> {m.deleteData}
                      </SubmitButton>
                    </form>
                  )}
                </div>
              </Glass>
            );
          })}
        </div>
        <ul className="mt-4 list-disc space-y-1 pl-4 text-xs text-ink-3">
          <li>{m.notes.corp}</li>
          <li>{m.notes.stop}</li>
        </ul>
      </Panel>
    </div>
  );
}
