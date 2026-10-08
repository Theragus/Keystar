import { KeyRound, Trash2, Wrench } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { ActionForm } from "@/components/ui/action-form";
import { StatusBadge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Portrait } from "@/components/ui/eve-image";
import { Glass, Panel } from "@/components/ui/glass";
import { requirePermission } from "@/core/auth/dal";
import { env } from "@/core/env";
import { reauthorizeHref } from "@/core/modules/registry";
import { getI18n } from "@/i18n/server";
import { FITTING_MANAGE_HREF, FITTING_PERMISSIONS, FITTINGS_SCOPE } from "@/modules/fitting/module";
import { getFittingAccess } from "@/modules/fitting/queries";
import { setOptionalScope } from "@/app/(app)/characters/actions";
import { deleteFittingData } from "../actions";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t.fitting.metaTitle.settings };
}

/** Fitting access: which of the viewer's characters share their in-game saved fittings with Keystar (opt-in). */
export default async function FittingSettingsPage() {
  const user = await requirePermission(FITTING_PERMISSIONS.use);
  const { t, f } = await getI18n();
  const m = t.fitting.settings;
  const sw = t.characters.scopeSwitch;
  const label = t.fitting.module.scopes.fittingsLabel;
  const demo = env().KEYSTAR_DEMO_MODE;
  const access = await getFittingAccess(user.id);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={t.fitting.module.navSection} title={t.fitting.metaTitle.settings} description={m.description} />

      <Panel title={m.title} subtitle={m.subtitle}>
        <div className="space-y-3">
          {access.map((a) => {
            const enable = reauthorizeHref(a.grantedScopes, {
              add: [FITTINGS_SCOPE],
              returnTo: FITTING_MANAGE_HREF,
              characterId: a.characterId,
            });
            return (
              <Glass key={a.characterId} className="flex flex-wrap items-center gap-4 rounded-2xl px-4 py-3">
                <Portrait id={a.characterId} size={44} />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-ink">{a.name}</span>
                    {a.granted && a.tokenStatus === "invalid" ? (
                      <StatusBadge status="error" label={m.revoked} />
                    ) : a.granted ? (
                      <StatusBadge status={a.lastStatus === "error" ? "warning" : "ok"} label={m.on} />
                    ) : (
                      <StatusBadge status="pending" label={m.off} />
                    )}
                  </div>
                  <p className="text-xs text-ink-3">
                    {a.granted
                      ? a.lastSuccessAt
                        ? m.lastSync(f.relativeTime(a.lastSuccessAt))
                        : m.firstSync
                      : a.stored
                        ? m.kept(a.stored)
                        : m.nothing}
                    {a.granted && a.lastStatus === "error" && a.lastError ? ` · ${a.lastError}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  {a.granted || a.switchedOff ? (
                    // In Keystar only: the token keeps the scope until the character is re-authorised.
                    <ActionForm
                      action={setOptionalScope.bind(null, a.characterId, FITTINGS_SCOPE, !a.granted)}
                      success={a.granted ? sw.off(label, a.name) : sw.on(label, a.name)}
                      successDetail={a.granted ? sw.offDetail : undefined}
                      failed={sw.failed(label, a.name)}
                      errors={sw.errors}
                    >
                      {a.granted ? (
                        <Button type="submit" size="sm" variant="ghost">
                          {m.stop}
                        </Button>
                      ) : (
                        <Button type="submit" size="sm" variant="primary">
                          <Wrench className="size-3.5" aria-hidden /> {m.enable}
                        </Button>
                      )}
                    </ActionForm>
                  ) : demo ? (
                    <Button size="sm" disabled title={m.demo}>
                      <KeyRound className="size-3.5" aria-hidden /> {m.enable}
                    </Button>
                  ) : (
                    <ButtonLink href={enable} size="sm" variant="primary">
                      <Wrench className="size-3.5" aria-hidden /> {m.enable}
                    </ButtonLink>
                  )}
                  {/* A revoked token needs the EVE login to share the fittings again. */}
                  {a.granted && a.tokenStatus === "invalid" && !demo && (
                    <ButtonLink href={enable} size="sm" variant="primary">
                      <KeyRound className="size-3.5" aria-hidden /> {m.reauthorize}
                    </ButtonLink>
                  )}
                  {!a.granted && a.stored > 0 && (
                    <ActionForm
                      action={deleteFittingData.bind(null, a.characterId)}
                      success={m.toast.deleted(a.name)}
                      failed={m.toast.failed(a.name)}
                      errors={m.toast.errors}
                    >
                      <Button type="submit" size="sm" variant="danger" title={m.deleteDataHint}>
                        <Trash2 className="size-3.5" aria-hidden /> {m.deleteData}
                      </Button>
                    </ActionForm>
                  )}
                </div>
              </Glass>
            );
          })}
        </div>
        <div className="mt-5 space-y-2 text-xs text-ink-3">
          <p>{m.notes.scopes}</p>
          <p>{m.notes.skills}</p>
        </div>
      </Panel>
    </div>
  );
}
