import { ArrowLeft, Download, Info, Pencil, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shell/page-header";
import { ActionForm } from "@/components/ui/action-form";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Portrait, TypeIcon } from "@/components/ui/eve-image";
import { Glass, Panel } from "@/components/ui/glass";
import { StatTile } from "@/components/ui/stat-tile";
import { requirePermission } from "@/core/auth/dal";
import { getDb } from "@/core/db";
import { getSettings } from "@/core/settings";
import { getI18n } from "@/i18n/server";
import { SHARE_ID_PATTERN } from "@/lib/share-id";
import { MINING_PERMISSIONS } from "@/modules/mining/module";
import { opStatus } from "@/modules/mining/ops/attribution";
import { DeleteOpForm } from "@/modules/mining/ops/components/delete-op";
import { OpStatusBadge } from "@/modules/mining/ops/components/op-status";
import { getOp, getOpResult, opContext, opOreClasses, type OpPilot } from "@/modules/mining/ops/queries";
import { deleteOpAction, endOpNow, finalizeOpAction, reopenOpAction, setParticipant, setSelfOptOut } from "../actions";

export async function generateMetadata({ params }: PageProps<"/mining/ops/[id]">) {
  const { t } = await getI18n();
  const { id } = await params;
  const op = SHARE_ID_PATTERN.test(id) ? await getOp(id) : null;
  return { title: op ? `${op.name} · ${t.ops.metaTitle}` : t.ops.metaTitle };
}

export default async function MiningOpPage({ params }: PageProps<"/mining/ops/[id]">) {
  const user = await requirePermission(MINING_PERMISSIONS.viewOwn, MINING_PERMISSIONS.viewCorp, MINING_PERMISSIONS.manageOps);
  const { id } = await params;
  if (!SHARE_ID_PATTERN.test(id)) notFound();
  const settings = await getSettings();
  const op = await getOp(id);
  if (!op || op.corporationId !== settings["corp.homeCorporationId"]) notFound();
  const now = new Date();
  const [result, context] = await Promise.all([getOpResult(op, now), opContext(getDb(), op)]);

  const manage = user.can(MINING_PERMISSIONS.manageOps);
  const own = new Set(user.characterIds);
  // Members see the ops they appear in; corporation-wide mining access sees every op.
  if (!manage && !user.can(MINING_PERMISSIONS.viewCorp) && !result.pilots.some((p) => own.has(p.characterId))) notFound();

  const { t, f } = await getI18n();
  const m = t.ops.detail;
  const status = opStatus(op, now);
  const editable = !op.finalizedAt;
  const classes = opOreClasses(op);
  const counted = result.pilots.filter((p) => p.status === "counted");
  const toast = (title: string) => ({ success: title, failed: m.toast.failed, errors: m.toast.errors });

  const where = [
    context.systems.length ? context.systems.join(", ") : m.anySystem,
    classes.length ? classes.map((c) => t.eve.oreClasses[c].short).join(", ") : m.allOre,
    t.ops.participation[op.participation].label +
      (op.participation === "fleet" && context.fleetBoss ? ` · ${m.fleetOf(context.fleetBoss)}` : "") +
      (op.participation === "calendar" && context.eventTitle ? ` · ${context.eventTitle}` : ""),
  ].join(" · ");

  const statusNote = op.finalizedAt
    ? m.notes.frozen(f.dateTime(op.finalizedAt), op.finalizedByName)
    : status === "planned"
      ? m.notes.planned(f.dateTime(op.startsAt))
      : status === "ended"
        ? m.notes.ended
        : m.notes.live;

  const reasonText = (p: OpPilot) =>
    p.reason === "self"
      ? m.pilots.reasons.self
      : p.reason === "override"
        ? p.status === "counted"
          ? m.pilots.reasons.included
          : m.pilots.reasons.override
        : p.reason === "mode"
          ? m.pilots.reasons.mode[op.participation]
          : "";

  return (
    <div className="space-y-6">
      <Link href="/mining/ops" className="inline-flex items-center gap-1.5 text-xs text-ink-3 hover:text-accent">
        <ArrowLeft className="size-3.5" aria-hidden /> {m.back}
      </Link>
      <PageHeader
        eyebrow={t.mining.module.nav.ops}
        title={op.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <OpStatusBadge status={status} label={t.ops.status[status]} />
            <span>{op.endsAt ? m.window(f.dateTime(op.startsAt), f.dateTime(op.endsAt)) : m.runningSince(f.dateTime(op.startsAt))}</span>
            <span className="text-ink-3">{where}</span>
          </span>
        }
        actions={
          <>
            <ButtonLink href={`/mining/ops/${op.id}/export`} prefetch={false} variant="ghost">
              <Download className="size-4" aria-hidden /> {m.actions.export}
            </ButtonLink>
            {manage && editable && (
              <ButtonLink href={`/mining/ops/${op.id}/edit`}>
                <Pencil className="size-4" aria-hidden /> {m.actions.edit}
              </ButtonLink>
            )}
            {manage && editable && status === "running" && !op.endsAt && (
              <ActionForm action={endOpNow.bind(null, op.id)} {...toast(m.toast.ended)}>
                <Button type="submit">{m.actions.endNow}</Button>
              </ActionForm>
            )}
            {manage && editable && status !== "planned" && (
              <ActionForm action={finalizeOpAction.bind(null, op.id)} {...toast(m.toast.finalized)}>
                <Button type="submit" variant="primary" title={m.actions.finalizeHint}>
                  {m.actions.finalize}
                </Button>
              </ActionForm>
            )}
            {manage && !editable && (
              <ActionForm action={reopenOpAction.bind(null, op.id)} {...toast(m.toast.reopened)}>
                <Button type="submit" title={m.actions.reopenHint}>
                  {m.actions.reopen}
                </Button>
              </ActionForm>
            )}
            {manage && <DeleteOpForm action={deleteOpAction.bind(null, op.id)} label={m.actions.delete} confirm={m.confirmDelete} />}
          </>
        }
      />

      <Glass className="flex items-start gap-3 px-5 py-3 text-sm text-ink-2">
        <Info className="mt-0.5 size-4 shrink-0 text-ink-3" aria-hidden />
        <div className="space-y-1">
          <p>{statusNote}</p>
          {!op.finalizedAt && <p className="text-xs text-ink-3">{m.notes.precision}</p>}
        </div>
      </Glass>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatTile label={m.tiles.pilots} value={f.integer(result.payees.length)} hint={m.tiles.characters(counted.length)} />
        <StatTile label={m.tiles.volume} value={f.volume(counted.reduce((s, p) => s + p.volume, 0), { compact: true })} />
        <StatTile label={m.tiles.gross} value={f.isk(result.payout.gross, { compact: true })} hint={m.tiles.grossHint(t.eve.valuationSources[op.valuationSource])} />
        <StatTile label={m.tiles.corpCut} value={f.isk(result.payout.corpCut, { compact: true })} hint={m.tiles.corpCutHint(f.percent(op.corpCutPct / 100, 0))} />
        <StatTile
          label={m.tiles.distributed}
          value={f.isk(result.payout.distributed, { compact: true })}
          hint={m.tiles.poolHint(f.percent(op.ratePct / 100, 0))}
        />
      </div>

      {result.missing.length > 0 && (
        <Panel title={m.missing.title} subtitle={m.missing.subtitle}>
          <ul className="space-y-1.5">
            {result.missing.map((x) => (
              <li key={x.characterId} className="flex items-center gap-2 text-sm">
                <TriangleAlert className="size-4 text-warning" aria-hidden />
                <Portrait id={x.characterId} size={20} />
                <span className="text-ink">{x.name}</span>
                <span className="text-xs text-ink-3">{m.missing.reasons[x.reason]}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <div className="grid gap-4 2xl:grid-cols-2">
        <Panel title={m.payout.title} subtitle={m.payout.subtitle(t.ops.splitModes[op.splitMode].label)} bodyClassName="px-0 pb-2">
          {result.payees.length === 0 ? (
            <p className="px-5 text-sm text-ink-3">{m.payout.empty}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="ks-table">
                <thead>
                  <tr>
                    <th>{m.payout.columns.pilot}</th>
                    <th className="num">{m.payout.columns.volume}</th>
                    <th className="num">{m.payout.columns.value}</th>
                    <th className="num">{m.payout.columns.share}</th>
                    <th className="num">{m.payout.columns.payout}</th>
                  </tr>
                </thead>
                <tbody>
                  {result.payees.map((p) => (
                    <tr key={p.payeeCharacterId}>
                      <td>
                        <span className="flex items-center gap-2">
                          <Portrait id={p.payeeCharacterId} size={24} />
                          <span className="text-ink">{p.name}</span>
                          {p.characterIds.length > 1 && <Badge>{f.integer(p.characterIds.length)}</Badge>}
                        </span>
                      </td>
                      <td className="num">{f.volume(p.volume, { compact: true })}</td>
                      <td className="num">{f.isk(p.value, { compact: true })}</td>
                      <td className="num">{result.payout.distributed > 0 ? f.percent(p.share / result.payout.distributed) : "—"}</td>
                      <td className="num font-medium text-ink">{f.isk(p.share)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>{m.payout.total}</td>
                    <td className="num">{f.volume(result.payees.reduce((s, p) => s + p.volume, 0), { compact: true })}</td>
                    <td className="num">{f.isk(result.payout.gross, { compact: true })}</td>
                    <td />
                    <td className="num font-medium text-ink">{f.isk(result.payout.distributed)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </Panel>

        <Panel title={m.pilots.title} subtitle={m.pilots.subtitle} bodyClassName="px-0 pb-2">
          {result.pilots.length === 0 ? (
            <p className="px-5 text-sm text-ink-3">{m.pilots.empty}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="ks-table">
                <thead>
                  <tr>
                    <th>{m.pilots.columns.character}</th>
                    <th>{m.pilots.columns.status}</th>
                    <th className="num">{m.pilots.columns.volume}</th>
                    <th className="num">{m.pilots.columns.value}</th>
                    {editable && <th className="num" aria-label={m.pilots.columns.actions} />}
                  </tr>
                </thead>
                <tbody>
                  {result.pilots.map((p) => {
                    const unplaced = result.unplaced.get(p.characterId);
                    const mine = own.has(p.characterId);
                    return (
                      <tr key={p.characterId}>
                        <td>
                          <span className="flex items-center gap-2">
                            <Portrait id={p.characterId} size={24} />
                            <span className={p.status === "counted" ? "text-ink" : "text-ink-3"}>{p.name}</span>
                          </span>
                          {unplaced && unplaced.value > 0 && (
                            <span className="mt-0.5 block text-2xs text-warning" title={m.pilots.unplacedHint}>
                              {m.pilots.unplaced(f.isk(unplaced.value, { compact: true }))}
                            </span>
                          )}
                        </td>
                        <td>
                          <Badge tone={p.status === "counted" ? "good" : p.status === "excluded" ? "critical" : "neutral"}>
                            {m.pilots.status[p.status]}
                          </Badge>
                          {reasonText(p) && <span className="ml-2 text-2xs text-ink-3">{reasonText(p)}</span>}
                        </td>
                        {/* A finalized op only keeps the ore of counted characters. */}
                        <td className="num">{result.frozen && p.status !== "counted" ? "—" : f.volume(p.volume, { compact: true })}</td>
                        <td className="num">{result.frozen && p.status !== "counted" ? "—" : f.isk(p.value, { compact: true })}</td>
                        {editable && (
                          <td className="num">
                            <span className="inline-flex flex-wrap justify-end gap-1">
                              {manage && p.reason !== "override" && p.status !== "counted" && (
                                <ActionForm action={setParticipant.bind(null, op.id, p.characterId, "included")} {...toast(m.toast.saved)}>
                                  <Button type="submit" size="sm" variant="ghost" className="h-7">
                                    {m.pilots.include}
                                  </Button>
                                </ActionForm>
                              )}
                              {manage && p.reason !== "override" && p.status === "counted" && (
                                <ActionForm action={setParticipant.bind(null, op.id, p.characterId, "excluded")} {...toast(m.toast.saved)}>
                                  <Button type="submit" size="sm" variant="ghost" className="h-7">
                                    {m.pilots.exclude}
                                  </Button>
                                </ActionForm>
                              )}
                              {manage && (p.reason === "override" || p.reason === "self") && (
                                <ActionForm action={setParticipant.bind(null, op.id, p.characterId, null)} {...toast(m.toast.saved)}>
                                  <Button type="submit" size="sm" variant="ghost" className="h-7">
                                    {m.pilots.reset}
                                  </Button>
                                </ActionForm>
                              )}
                              {!manage && mine && p.status !== "excluded" && (
                                <ActionForm action={setSelfOptOut.bind(null, op.id, p.characterId, true)} {...toast(m.toast.saved)}>
                                  <Button type="submit" size="sm" variant="ghost" className="h-7">
                                    {m.pilots.optOut}
                                  </Button>
                                </ActionForm>
                              )}
                              {!manage && mine && p.reason === "self" && (
                                <ActionForm action={setSelfOptOut.bind(null, op.id, p.characterId, false)} {...toast(m.toast.saved)}>
                                  <Button type="submit" size="sm" variant="ghost" className="h-7">
                                    {m.pilots.optIn}
                                  </Button>
                                </ActionForm>
                              )}
                            </span>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>

      {result.ore.length > 0 && (
        <Panel title={m.ore.title} bodyClassName="px-0 pb-2">
          <div className="overflow-x-auto">
            <table className="ks-table">
              <thead>
                <tr>
                  <th>{m.ore.columns.ore}</th>
                  <th className="num">{m.ore.columns.quantity}</th>
                  <th className="num">{m.ore.columns.volume}</th>
                  <th className="num">{m.ore.columns.unitPrice}</th>
                  <th className="num">{m.ore.columns.value}</th>
                </tr>
              </thead>
              <tbody>
                {result.ore.map((o) => (
                  <tr key={o.typeId}>
                    <td>
                      <span className="flex items-center gap-2">
                        <TypeIcon id={o.typeId} size={24} />
                        <span className="text-ink">{o.name}</span>
                        <span className="text-2xs text-ink-3">{t.eve.oreClasses[o.oreClass].short}</span>
                      </span>
                    </td>
                    <td className="num">{f.integer(o.quantity)}</td>
                    <td className="num">{f.volume(o.volume, { compact: true })}</td>
                    <td className="num">{o.unitPrice > 0 ? f.unitPrice(o.unitPrice) : <span className="text-warning">{m.ore.unpriced}</span>}</td>
                    <td className="num">{f.isk(o.value, { compact: true })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {op.notes && (
        <Panel title={m.noteTitle}>
          <p className="text-sm whitespace-pre-line text-ink-2">{op.notes}</p>
          {op.createdByName && <p className="mt-2 text-xs text-ink-3">{m.createdBy(op.createdByName)}</p>}
        </Panel>
      )}
    </div>
  );
}
