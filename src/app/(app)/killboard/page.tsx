import { ExternalLink, Swords } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { CorpLogo } from "@/components/ui/eve-image";
import { Glass, Panel } from "@/components/ui/glass";
import { PendingFrame, PendingProvider } from "@/components/ui/pending";
import { StatTile } from "@/components/ui/stat-tile";
import { requirePermission } from "@/core/auth/dal";
import { getCorporation } from "@/core/corp";
import { env } from "@/core/env";
import { getSettings } from "@/core/settings";
import { getI18n } from "@/i18n/server";
import type { Messages } from "@/i18n/messages";
import { DATE_PRESETS, isoDate } from "@/lib/dates";
import type { Formatter } from "@/lib/format";
import { KILL_COLOR, LOSS_COLOR } from "@/modules/killboard/colors";
import { WeekDelta } from "@/components/ui/deltas";
import { IskDonut } from "@/modules/killboard/components/isk-donut";
import { KillboardPeriodPicker } from "@/modules/killboard/components/period-picker";
import { RecentActivity } from "@/modules/killboard/components/recent-activity";
import { RewriteReportButton } from "@/modules/killboard/components/rewrite-button";
import { SituationReportPanel } from "@/modules/killboard/components/situation-report";
import { SortableTable, type Column, type EntityRow } from "@/components/ui/sortable-table";
import { SystemBars } from "@/modules/killboard/components/system-bars";
import { Awards, MvpCard, RunnersUp } from "@/modules/killboard/components/top-pilots";
import { killboardWindows, parseKillboardFilters, rangeLabel } from "@/modules/killboard/filters";
import { zkillCharacter, zkillCorporation, zkillShip } from "@/modules/killboard/links";
import { KILLBOARD_PERMISSIONS } from "@/modules/killboard/module";
import {
  efficiency,
  getKillboardStatus,
  getPilots,
  getRecentActivity,
  getShips,
  getTopSystems,
  getTotals,
} from "@/modules/killboard/queries";
import { getLatestReport } from "@/modules/killboard/report/generate";
import { rewriteSituationReport } from "./actions";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t.killboard.page.metaTitle };
}

/** Sortable-table columns, labelled in the viewer's language. */
function tableColumns(t: Messages) {
  const { terms, columns: c } = t.killboard;
  const effective: Column[] = [
    { key: "kills", label: c.kd, format: "ratio", ratioKey: "losses", title: c.kdTitle },
    { key: "destroyed", label: terms.destroyed, format: "isk" },
    { key: "lost", label: terms.lost, format: "isk" },
    { key: "efficiency", label: c.eff, format: "pct", title: terms.iskEfficiency },
    { key: "net", label: terms.netIsk, format: "signedIsk" },
    { key: "killsDelta", label: c.delta7d, format: "delta", title: c.killsDeltaTitle },
  ];
  const used: Column[] = [
    { key: "kills", label: terms.kills, format: "int" },
    { key: "destroyed", label: terms.destroyed, format: "isk" },
    { key: "killsDelta", label: c.delta7d, format: "delta", title: c.killsDeltaTitle },
  ];
  const lost: Column[] = [
    { key: "losses", label: terms.losses, format: "int" },
    { key: "lost", label: c.iskLost, format: "isk" },
    { key: "lossesDelta", label: c.delta7d, format: "deltaInverse", title: c.lossesDeltaTitle },
  ];
  const pilots: Column[] = [
    { key: "kills", label: terms.kills, format: "int" },
    { key: "losses", label: terms.losses, format: "int" },
    { key: "finalBlows", label: terms.finalBlows, format: "int" },
    { key: "solo", label: terms.solo, format: "int" },
    { key: "destroyed", label: terms.destroyed, format: "isk" },
    { key: "lost", label: terms.lost, format: "isk" },
    { key: "efficiency", label: c.eff, format: "pct", title: terms.iskEfficiency },
    { key: "net", label: terms.netIsk, format: "signedIsk" },
    { key: "killsDelta", label: c.killsDelta, format: "delta" },
    { key: "lossesDelta", label: c.lossesDelta, format: "deltaInverse" },
  ];
  return { effective, used, lost, pilots };
}

export default async function KillboardPage({ searchParams }: PageProps<"/killboard">) {
  const user = await requirePermission(KILLBOARD_PERMISSIONS.view);
  const { t, f } = await getI18n();
  const tk = t.killboard;
  const settings = await getSettings();
  const corpId = settings["corp.homeCorporationId"];

  if (!corpId) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow={tk.module.navSection} title={tk.module.nav.killboard} />
        <Glass>
          <EmptyState icon={Swords} title={tk.page.noCorp.title}>
            {tk.page.noCorp.body}
          </EmptyState>
        </Glass>
      </div>
    );
  }

  const today = isoDate(new Date());
  const period = parseKillboardFilters(await searchParams, today);
  const w = killboardWindows(period, today);
  const [corp, totals, week, prevWeek, killSystems, lossSystems, recent, ships, pilots, report, status] = await Promise.all([
    getCorporation(corpId),
    getTotals(corpId, w.period),
    getTotals(corpId, w.week),
    getTotals(corpId, w.prevWeek),
    getTopSystems(corpId, w, "kills"),
    getTopSystems(corpId, w, "losses"),
    getRecentActivity(corpId, w.period, 10),
    getShips(corpId, w),
    getPilots(corpId, w),
    getLatestReport(corpId),
    getKillboardStatus(corpId),
  ]);

  const canManage = user.can(KILLBOARD_PERMISSIONS.manage);
  const corpName = corp ? `${corp.name} [${corp.ticker}]` : tk.fallback.corporation(corpId);
  const weekLabel = rangeLabel(w.week, f.locale);
  const periodLabel = rangeLabel(w.period, f.locale);
  const eff = efficiency(totals.iskDestroyed, totals.iskLost);
  const weekEff = efficiency(week.iskDestroyed, week.iskLost);
  const prevEff = efficiency(prevWeek.iskDestroyed, prevWeek.iskLost);
  const presets = DATE_PRESETS.map((p) => ({ id: p.id, label: t.common.datePresets[p.id], ...p.range(today) }));
  const columns = tableColumns(t);
  const weekDelta = { suffix: tk.stats.vsPrevWeek, emptyText: tk.stats.noPrevWeek };

  const shipRow = (s: (typeof ships)[number]): EntityRow => ({
    id: s.typeId,
    name: s.name ?? tk.fallback.type(s.typeId),
    image: "type",
    href: zkillShip(s.typeId),
    values: {
      kills: s.kills,
      losses: s.losses,
      destroyed: s.destroyed,
      lost: s.lost,
      efficiency: efficiency(s.destroyed, s.lost),
      net: s.destroyed - s.lost,
      killsDelta: s.killsDelta,
      lossesDelta: s.lossesDelta,
    },
  });
  const pilotRows: EntityRow[] = pilots.map((p) => ({
    id: p.characterId,
    name: p.name ?? tk.fallback.character(p.characterId),
    image: "portrait",
    href: zkillCharacter(p.characterId),
    values: {
      kills: p.kills,
      losses: p.losses,
      finalBlows: p.finalBlows,
      solo: p.solo,
      destroyed: p.destroyed,
      lost: p.lost,
      efficiency: efficiency(p.destroyed, p.lost),
      net: p.destroyed - p.lost,
      killsDelta: p.killsDelta,
      lossesDelta: p.lossesDelta,
    },
  }));

  const header = (
    <PageHeader
      eyebrow={tk.module.navSection}
      title={tk.module.nav.killboard}
      description={
        <span className="inline-flex items-center gap-2">
          <CorpLogo id={corpId} size={20} />
          <span>{tk.page.description(corpName)}</span>
        </span>
      }
      actions={
        <>
          <KillboardPeriodPicker period={period} presets={presets} />
          <a
            href={zkillCorporation(corpId)}
            target="_blank"
            rel="noopener noreferrer"
            className="glass-chip inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-medium hover:bg-white/10"
          >
            zKillboard <ExternalLink className="size-3.5" aria-hidden />
          </a>
        </>
      }
    />
  );

  if (status.killmails === 0) {
    return (
      <div className="space-y-6">
        {header}
        <Glass>
          <EmptyState icon={Swords} title={status.lastSyncAt ? tk.page.empty.title : tk.page.importing.title}>
            {status.lastSyncAt ? tk.page.empty.body(corpName) : tk.page.importing.body(corpName)}
            {status.lastError && <span className="mt-2 block text-critical-text">{tk.page.lastError(status.lastError)}</span>}
          </EmptyState>
        </Glass>
      </div>
    );
  }

  return (
    <PendingProvider>
      <div className="space-y-6">
        {header}

        <PendingFrame className="space-y-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-5">
            <StatTile
              label={tk.stats.totalKills}
              value={f.integer(totals.kills)}
              delta={<WeekDelta change={week.kills - prevWeek.kills} format={f.integer} {...weekDelta} />}
              hint={tk.stats.weekInRange(f.integer(week.kills), weekLabel)}
            />
            <StatTile
              label={tk.stats.totalLosses}
              value={f.integer(totals.losses)}
              delta={<WeekDelta change={week.losses - prevWeek.losses} upIsGood={false} format={f.integer} {...weekDelta} />}
              hint={tk.stats.weekInRange(f.integer(week.losses), weekLabel)}
            />
            <StatTile
              label={tk.terms.iskDestroyed}
              value={f.compact(totals.iskDestroyed)}
              unit="ISK"
              delta={<WeekDelta change={week.iskDestroyed - prevWeek.iskDestroyed} format={(n) => f.compact(n)} {...weekDelta} />}
              hint={tk.stats.week(f.compact(week.iskDestroyed))}
            />
            <StatTile
              label={tk.terms.iskLost}
              value={f.compact(totals.iskLost)}
              unit="ISK"
              delta={
                <WeekDelta
                  change={week.iskLost - prevWeek.iskLost}
                  upIsGood={false}
                  format={(n) => f.compact(n)}
                  {...weekDelta}
                />
              }
              hint={tk.stats.week(f.compact(week.iskLost))}
            />
            <StatTile
              label={tk.terms.iskEfficiency}
              value={eff === null ? "—" : f.percent(eff, 1)}
              className="col-span-2 lg:col-span-1"
              delta={
                <WeekDelta
                  change={weekEff !== null && prevEff !== null ? (weekEff - prevEff) * 100 : null}
                  format={tk.stats.points}
                  {...weekDelta}
                />
              }
              hint={weekEff === null ? undefined : tk.stats.week(f.percent(weekEff, 1))}
            />
          </div>

          {pilots.some((p) => p.kills > 0) && (
            <Panel title={tk.topPilots.title} subtitle={tk.topPilots.mostKills(periodLabel)}>
              <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
                <MvpCard pilot={pilots[0]} period={periodLabel} />
                <RunnersUp pilots={pilots.slice(1, 5).filter((p) => p.kills > 0)} />
              </div>
              <div className="mt-5">
                <Awards pilots={pilots} />
              </div>
            </Panel>
          )}

          <Panel
            id="pilot-efficiency"
            title={tk.pilotTable.title}
            subtitle={tk.pilotTable.subtitle(pilotRows.length, corp?.ticker || null)}
          >
            <SortableTable
              entityLabel={tk.pilotTable.entity}
              columns={columns.pilots}
              rows={pilotRows}
              defaultSort="kills"
              initialRows={10}
            />
          </Panel>

          <SituationReportPanel
            stored={report}
            canManage={canManage}
            claudeConfigured={Boolean(env().ANTHROPIC_API_KEY)}
            actions={
              canManage ? (
                <form action={rewriteSituationReport}>
                  <RewriteReportButton />
                </form>
              ) : undefined
            }
          />

          <div className="grid gap-4 xl:grid-cols-3">
            <Panel
              title={tk.systems.title.kills}
              subtitle={tk.systems.subtitle("kills", week.kills, signed(week.kills - prevWeek.kills, f))}
            >
              <SystemBars rows={killSystems} color={KILL_COLOR} unit="kills" upIsGood />
            </Panel>
            <Panel
              title={tk.systems.title.losses}
              subtitle={tk.systems.subtitle("losses", week.losses, signed(week.losses - prevWeek.losses, f))}
            >
              <SystemBars rows={lossSystems} color={LOSS_COLOR} unit="losses" upIsGood={false} />
            </Panel>
            <Panel id="isk" title={tk.breakdown.title}>
              <div className="grid items-center gap-5 sm:grid-cols-[13rem_1fr] xl:grid-cols-1 2xl:grid-cols-[11rem_1fr]">
                <IskDonut destroyed={totals.iskDestroyed} lost={totals.iskLost} />
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm 2xl:grid-cols-1 2xl:gap-y-2">
                  <Figure label={tk.terms.destroyed} value={f.compact(totals.iskDestroyed)} swatch={KILL_COLOR} />
                  <Figure label={tk.terms.lost} value={f.compact(totals.iskLost)} swatch={LOSS_COLOR} />
                  <Figure
                    label={tk.terms.netIsk}
                    value={`${totals.iskDestroyed >= totals.iskLost ? "+" : "−"}${f.compact(Math.abs(totals.iskDestroyed - totals.iskLost))}`}
                    tone={totals.iskDestroyed >= totals.iskLost ? "good" : "bad"}
                  />
                  <Figure
                    label={tk.breakdown.kdRatio}
                    value={totals.losses ? f.number(totals.kills / totals.losses, 2) : "—"}
                    detail={`${f.integer(totals.kills)} / ${f.integer(totals.losses)}`}
                  />
                  <Figure label={tk.breakdown.avgPerKill} value={totals.kills ? f.compact(totals.iskDestroyed / totals.kills) : "—"} />
                  <Figure label={tk.breakdown.avgPerLoss} value={totals.losses ? f.compact(totals.iskLost / totals.losses) : "—"} />
                </dl>
              </div>
            </Panel>
          </div>

          <div className="grid items-start gap-4 xl:grid-cols-12">
            <Panel title={tk.recent.title} subtitle={tk.recent.subtitle} className="xl:col-span-5">
              <RecentActivity rows={recent} />
            </Panel>
            <Panel title={tk.ships.effectiveTitle} subtitle={tk.ships.effectiveSubtitle} className="xl:col-span-7">
              <SortableTable
                entityLabel={tk.ships.entity}
                columns={columns.effective}
                rows={ships.map(shipRow)}
                defaultSort="net"
                initialRows={10}
              />
            </Panel>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Panel title={tk.ships.usedTitle} subtitle={tk.ships.usedSubtitle}>
              <SortableTable
                entityLabel={tk.ships.entity}
                columns={columns.used}
                rows={ships.filter((s) => s.kills > 0).map(shipRow)}
                defaultSort="kills"
              />
            </Panel>
            <Panel title={tk.ships.lostTitle} subtitle={tk.ships.lostSubtitle}>
              <SortableTable
                entityLabel={tk.ships.entity}
                columns={columns.lost}
                rows={ships.filter((s) => s.losses > 0).map(shipRow)}
                defaultSort="losses"
              />
            </Panel>
          </div>
        </PendingFrame>

        <p className="text-xs text-ink-3">
          {tk.page.footer({
            synced: status.lastSyncAt ? f.relativeTime(status.lastSyncAt) : null,
            since: status.since ? status.since.slice(0, 10) : null,
            week: weekLabel,
            prevWeek: rangeLabel(w.prevWeek, f.locale),
          })}
          {status.lastError && <span className="text-critical-text"> {tk.page.lastSyncError(status.lastError)}</span>}
        </p>
      </div>
    </PendingProvider>
  );
}

function signed(n: number, f: Formatter): string {
  return n > 0 ? `+${f.integer(n)}` : n < 0 ? `−${f.integer(Math.abs(n))}` : "±0";
}

function Figure({
  label,
  value,
  detail,
  swatch,
  tone,
}: {
  label: string;
  value: string;
  detail?: string;
  swatch?: string;
  tone?: "good" | "bad";
}) {
  return (
    <div className="2xl:flex 2xl:items-baseline 2xl:justify-between 2xl:gap-3">
      <dt className="eve-label flex items-center gap-1.5 text-2xs whitespace-nowrap text-ink-3">
        {swatch && <span className="inline-block size-2 rounded-sm" style={{ background: swatch }} aria-hidden />}
        {label}
      </dt>
      <dd
        className={
          tone === "good"
            ? "mt-0.5 font-semibold whitespace-nowrap text-good-text tabular-nums 2xl:mt-0"
            : tone === "bad"
              ? "mt-0.5 font-semibold whitespace-nowrap text-critical-text tabular-nums 2xl:mt-0"
              : "mt-0.5 font-semibold whitespace-nowrap text-ink tabular-nums 2xl:mt-0"
        }
      >
        {value}
        {detail && <span className="ml-1.5 text-xs font-normal text-ink-3">{detail}</span>}
      </dd>
    </div>
  );
}
