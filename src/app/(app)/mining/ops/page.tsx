import { CalendarDays, CalendarRange, KeyRound, Plus } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { ActionForm } from "@/components/ui/action-form";
import { StatusBadge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Portrait } from "@/components/ui/eve-image";
import { Glass, Panel } from "@/components/ui/glass";
import { requirePermission } from "@/core/auth/dal";
import { getDb } from "@/core/db";
import { env } from "@/core/env";
import { reauthorizeHref } from "@/core/modules/registry";
import { getSettings } from "@/core/settings";
import { getI18n } from "@/i18n/server";
import { MINING_PERMISSIONS } from "@/modules/mining/module";
import { opStatus } from "@/modules/mining/ops/attribution";
import { OpStatusBadge } from "@/modules/mining/ops/components/op-status";
import { listOps } from "@/modules/mining/ops/queries";
import { getCalendarAccess } from "@/modules/social/calendar";
import { CALENDAR_SCOPE } from "@/modules/social/module";
import { setOptionalScope } from "@/app/(app)/characters/actions";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t.ops.metaTitle };
}

export default async function MiningOpsPage() {
  const user = await requirePermission(MINING_PERMISSIONS.viewOwn, MINING_PERMISSIONS.viewCorp, MINING_PERMISSIONS.manageOps);
  const { t, f } = await getI18n();
  const m = t.ops;
  const settings = await getSettings();
  const home = settings["corp.homeCorporationId"];
  const manage = user.can(MINING_PERMISSIONS.manageOps);
  const seeAll = manage || user.can(MINING_PERMISSIONS.viewCorp);
  const now = new Date();
  const [ops, calendar] = await Promise.all([
    home ? listOps(home, seeAll ? {} : { onlyFor: user.characterIds }) : Promise.resolve([]),
    manage ? getCalendarAccess(getDb(), user.id) : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t.mining.module.navSection}
        title={m.metaTitle}
        description={m.description}
        actions={
          manage &&
          home && (
            <ButtonLink href="/mining/ops/new" variant="primary">
              <Plus className="size-4" aria-hidden /> {m.newOp}
            </ButtonLink>
          )
        }
      />

      {!home ? (
        <Glass>
          <EmptyState icon={CalendarRange} title={m.list.noHomeCorp.title}>
            {m.list.noHomeCorp.body}
          </EmptyState>
        </Glass>
      ) : ops.length === 0 ? (
        <Glass>
          <EmptyState icon={CalendarRange} title={m.list.empty.title}>
            {manage ? m.list.empty.manager : m.list.empty.member}
          </EmptyState>
        </Glass>
      ) : (
        <Panel title={m.list.title} bodyClassName="px-0 pb-2">
          <div className="overflow-x-auto">
            <table className="ks-table">
              <thead>
                <tr>
                  <th>{m.list.columns.name}</th>
                  <th>{m.list.columns.status}</th>
                  <th>{m.list.columns.window}</th>
                  <th>{m.list.columns.systems}</th>
                  <th>{m.list.columns.who}</th>
                  <th className="num">{m.list.columns.payout}</th>
                </tr>
              </thead>
              <tbody>
                {ops.map(({ op, systems, payees, paid }) => (
                  <tr key={op.id}>
                    <td>
                      <Link href={`/mining/ops/${op.id}`} className="font-medium text-ink hover:text-accent">
                        {op.name}
                      </Link>
                    </td>
                    <td>
                      <OpStatusBadge status={opStatus(op, now)} label={m.status[opStatus(op, now)]} />
                    </td>
                    <td className="whitespace-nowrap text-ink-2">
                      {m.detail.window(f.dateTime(op.startsAt), op.endsAt ? f.dateTime(op.endsAt) : m.list.open)}
                    </td>
                    <td className="text-ink-2">{systems.length ? systems.join(", ") : m.list.anySystem}</td>
                    <td className="text-ink-2">{m.participation[op.participation].label}</td>
                    <td className="num">
                      {paid === null ? (
                        <span className="text-ink-3">{m.list.live}</span>
                      ) : (
                        <>
                          {f.isk(paid)}
                          <span className="block text-2xs text-ink-3">{m.list.payees(payees ?? 0)}</span>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {manage && calendar.length > 0 && (
        <Panel title={m.calendar.title} subtitle={m.calendar.subtitle}>
          <ul className="grid gap-3 lg:grid-cols-2">
            {calendar.map((c) => {
              const label = t.social.module.scopes.readCalendarLabel;
              const sw = t.characters.scopeSwitch;
              return (
                <li key={c.characterId} className="flex flex-wrap items-center gap-3 rounded-xl px-3 py-2 ring-1 ring-surface-contrast/[0.08]">
                  <Portrait id={c.characterId} size={32} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-medium text-ink">{c.name}</span>
                      {c.tokenStatus === "invalid" ? (
                        <StatusBadge status="error" label={m.calendar.revoked} />
                      ) : c.granted ? (
                        <StatusBadge status={c.lastStatus === "error" ? "warning" : "ok"} label={m.calendar.on} />
                      ) : (
                        <StatusBadge status="pending" label={m.calendar.off} />
                      )}
                    </div>
                    {c.granted && (
                      <p className="text-xs text-ink-3">
                        {c.lastSuccessAt ? m.calendar.imported(c.events, f.relativeTime(c.lastSuccessAt, now)) : m.calendar.firstImport}
                        {c.lastStatus === "error" && c.lastError ? ` · ${c.lastError}` : ""}
                      </p>
                    )}
                  </div>
                  {c.granted || c.switchedOff ? (
                    <ActionForm
                      action={setOptionalScope.bind(null, c.characterId, CALENDAR_SCOPE, !c.granted)}
                      success={c.granted ? sw.off(label, c.name) : sw.on(label, c.name)}
                      successDetail={c.granted ? sw.offDetail : undefined}
                      failed={sw.failed(label, c.name)}
                      errors={sw.errors}
                    >
                      {c.granted ? (
                        <Button type="submit" size="sm" variant="ghost">
                          {m.calendar.stop}
                        </Button>
                      ) : (
                        <Button type="submit" size="sm" variant="primary">
                          <CalendarDays className="size-3.5" aria-hidden /> {m.calendar.enable}
                        </Button>
                      )}
                    </ActionForm>
                  ) : env().KEYSTAR_DEMO_MODE ? (
                    <Button size="sm" disabled title={m.calendar.demo}>
                      <KeyRound className="size-3.5" aria-hidden /> {m.calendar.enable}
                    </Button>
                  ) : (
                    <ButtonLink
                      href={reauthorizeHref(c.grantedScopes, { add: [CALENDAR_SCOPE], returnTo: "/mining/ops", characterId: c.characterId })}
                      size="sm"
                      variant="primary"
                    >
                      <CalendarDays className="size-3.5" aria-hidden /> {m.calendar.enable}
                    </ButtonLink>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-xs text-ink-3">{m.calendar.note}</p>
        </Panel>
      )}
    </div>
  );
}
