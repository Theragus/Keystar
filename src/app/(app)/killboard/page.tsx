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
import { DATE_PRESETS, isoDate } from "@/lib/dates";
import { compact, integer, percent, relativeTime } from "@/lib/format";
import { KILL_COLOR, LOSS_COLOR } from "@/modules/killboard/colors";
import { WeekDelta } from "@/modules/killboard/components/deltas";
import { IskDonut } from "@/modules/killboard/components/isk-donut";
import { KillboardPeriodPicker } from "@/modules/killboard/components/period-picker";
import { RecentActivity } from "@/modules/killboard/components/recent-activity";
import { RewriteReportButton } from "@/modules/killboard/components/rewrite-button";
import { SituationReportPanel } from "@/modules/killboard/components/situation-report";
import { SortableTable, type Column, type EntityRow } from "@/modules/killboard/components/sortable-table";
import { SystemBars } from "@/modules/killboard/components/system-bars";
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

export const metadata = { title: "Killboard" };

const EFFECTIVE_COLUMNS: Column[] = [
  { key: "kills", label: "K/D", format: "ratio", ratioKey: "losses", title: "Kills / losses" },
  { key: "destroyed", label: "Destroyed", format: "isk" },
  { key: "lost", label: "Lost", format: "isk" },
  { key: "efficiency", label: "Eff", format: "pct", title: "ISK efficiency" },
  { key: "net", label: "Net ISK", format: "signedIsk" },
  { key: "killsDelta", label: "Δ7d", format: "delta", title: "Kills, last 7 days vs the 7 days before" },
];
const USED_COLUMNS: Column[] = [
  { key: "kills", label: "Kills", format: "int" },
  { key: "destroyed", label: "Destroyed", format: "isk" },
  { key: "killsDelta", label: "Δ7d", format: "delta", title: "Kills, last 7 days vs the 7 days before" },
];
const LOST_COLUMNS: Column[] = [
  { key: "losses", label: "Losses", format: "int" },
  { key: "lost", label: "ISK lost", format: "isk" },
  { key: "lossesDelta", label: "Δ7d", format: "deltaInverse", title: "Losses, last 7 days vs the 7 days before" },
];
const PILOT_COLUMNS: Column[] = [
  { key: "kills", label: "Kills", format: "int" },
  { key: "losses", label: "Losses", format: "int" },
  { key: "finalBlows", label: "Final blows", format: "int" },
  { key: "solo", label: "Solo", format: "int" },
  { key: "destroyed", label: "Destroyed", format: "isk" },
  { key: "lost", label: "Lost", format: "isk" },
  { key: "efficiency", label: "Eff", format: "pct", title: "ISK efficiency" },
  { key: "net", label: "Net ISK", format: "signedIsk" },
  { key: "killsDelta", label: "Δ kills 7d", format: "delta" },
  { key: "lossesDelta", label: "Δ losses 7d", format: "deltaInverse" },
];

export default async function KillboardPage({ searchParams }: PageProps<"/killboard">) {
  const user = await requirePermission(KILLBOARD_PERMISSIONS.view);
  const settings = await getSettings();
  const corpId = settings["corp.homeCorporationId"];

  if (!corpId) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Combat" title="Killboard" />
        <Glass>
          <EmptyState icon={Swords} title="No home corporation set">
            The killboard tracks the home corporation&apos;s kills and losses on zKillboard. An admin can set it under Admin →
            Settings.
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
    getRecentActivity(corpId, w.period),
    getShips(corpId, w),
    getPilots(corpId, w),
    getLatestReport(corpId),
    getKillboardStatus(corpId),
  ]);

  const canManage = user.can(KILLBOARD_PERMISSIONS.manage);
  const corpName = corp ? `${corp.name} [${corp.ticker}]` : `Corporation ${corpId}`;
  const weekLabel = rangeLabel(w.week);
  const eff = efficiency(totals.iskDestroyed, totals.iskLost);
  const weekEff = efficiency(week.iskDestroyed, week.iskLost);
  const prevEff = efficiency(prevWeek.iskDestroyed, prevWeek.iskLost);
  const presets = DATE_PRESETS.map((p) => ({ id: p.id, label: p.label, ...p.range(today) }));

  const shipRow = (s: (typeof ships)[number]): EntityRow => ({
    id: s.typeId,
    name: s.name ?? `Type ${s.typeId}`,
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
    name: p.name ?? `Character ${p.characterId}`,
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
      eyebrow="Combat"
      title="Killboard"
      description={
        <span className="inline-flex items-center gap-2">
          <CorpLogo id={corpId} size={20} />
          <span>{corpName} · combat performance from zKillboard</span>
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
          <EmptyState icon={Swords} title={status.lastSyncAt ? "No kills or losses yet" : "Importing from zKillboard"}>
            {status.lastSyncAt
              ? `zKillboard has no killmails for ${corpName} in the last 90 days. New ones appear here within the hour.`
              : `The worker imports the last 90 days of ${corpName}'s killmails from zKillboard, then checks hourly.`}
            {status.lastError && <span className="mt-2 block text-critical-text">Last error: {status.lastError}</span>}
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
              label="Total kills"
              value={integer(totals.kills)}
              delta={<WeekDelta change={week.kills - prevWeek.kills} />}
              hint={`7d: ${integer(week.kills)} · ${weekLabel}`}
            />
            <StatTile
              label="Total losses"
              value={integer(totals.losses)}
              delta={<WeekDelta change={week.losses - prevWeek.losses} upIsGood={false} />}
              hint={`7d: ${integer(week.losses)} · ${weekLabel}`}
            />
            <StatTile
              label="ISK destroyed"
              value={compact(totals.iskDestroyed)}
              unit="ISK"
              delta={<WeekDelta change={week.iskDestroyed - prevWeek.iskDestroyed} format={compact} />}
              hint={`7d: ${compact(week.iskDestroyed)}`}
            />
            <StatTile
              label="ISK lost"
              value={compact(totals.iskLost)}
              unit="ISK"
              delta={<WeekDelta change={week.iskLost - prevWeek.iskLost} upIsGood={false} format={compact} />}
              hint={`7d: ${compact(week.iskLost)}`}
            />
            <StatTile
              label="ISK efficiency"
              value={eff === null ? "—" : percent(eff, 1)}
              className="col-span-2 lg:col-span-1"
              delta={
                <WeekDelta
                  change={weekEff !== null && prevEff !== null ? (weekEff - prevEff) * 100 : null}
                  format={(n) => `${n.toFixed(1)} pts`}
                />
              }
              hint={weekEff === null ? undefined : `7d: ${percent(weekEff, 1)}`}
            />
          </div>

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
            <Panel title="Top systems by kills" subtitle={`7d: ${week.kills} kills (${signed(week.kills - prevWeek.kills)} vs prev 7d)`}>
              <SystemBars rows={killSystems} color={KILL_COLOR} unit="kills" upIsGood />
            </Panel>
            <Panel title="Top systems by losses" subtitle={`7d: ${week.losses} losses (${signed(week.losses - prevWeek.losses)} vs prev 7d)`}>
              <SystemBars rows={lossSystems} color={LOSS_COLOR} unit="losses" upIsGood={false} />
            </Panel>
            <Panel title="ISK breakdown">
              <div className="grid items-center gap-5 sm:grid-cols-[13rem_1fr] xl:grid-cols-1 2xl:grid-cols-[11rem_1fr]">
                <IskDonut destroyed={totals.iskDestroyed} lost={totals.iskLost} />
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm 2xl:grid-cols-1 2xl:gap-y-2">
                  <Figure label="Destroyed" value={`${compact(totals.iskDestroyed)}`} swatch={KILL_COLOR} />
                  <Figure label="Lost" value={`${compact(totals.iskLost)}`} swatch={LOSS_COLOR} />
                  <Figure
                    label="Net ISK"
                    value={`${totals.iskDestroyed >= totals.iskLost ? "+" : "−"}${compact(Math.abs(totals.iskDestroyed - totals.iskLost))}`}
                    tone={totals.iskDestroyed >= totals.iskLost ? "good" : "bad"}
                  />
                  <Figure
                    label="K/D ratio"
                    value={totals.losses ? (totals.kills / totals.losses).toFixed(2) : "—"}
                    detail={`${integer(totals.kills)} / ${integer(totals.losses)}`}
                  />
                  <Figure label="Avg ISK / kill" value={totals.kills ? compact(totals.iskDestroyed / totals.kills) : "—"} />
                  <Figure label="Avg ISK / loss" value={totals.losses ? compact(totals.iskLost / totals.losses) : "—"} />
                </dl>
              </div>
            </Panel>
          </div>

          <Panel title="Recent activity" subtitle="Latest kills and losses in the period · opens on zKillboard">
            <RecentActivity rows={recent} />
          </Panel>

          <Panel title="Most effective ships" subtitle="By net ISK: value destroyed while flying the hull minus value lost in it">
            <SortableTable entityLabel="Ship" columns={EFFECTIVE_COLUMNS} rows={ships.map(shipRow)} defaultSort="net" />
          </Panel>

          <div className="grid gap-4 xl:grid-cols-2">
            <Panel title="Most used ships" subtitle="Hulls flown on kills">
              <SortableTable
                entityLabel="Ship"
                columns={USED_COLUMNS}
                rows={ships.filter((s) => s.kills > 0).map(shipRow)}
                defaultSort="kills"
              />
            </Panel>
            <Panel title="Most lost ships" subtitle="Hulls lost">
              <SortableTable
                entityLabel="Ship"
                columns={LOST_COLUMNS}
                rows={ships.filter((s) => s.losses > 0).map(shipRow)}
                defaultSort="losses"
              />
            </Panel>
          </div>

          <Panel title="Pilot efficiency" subtitle={`${pilotRows.length} pilots flew for ${corp?.ticker ? `[${corp.ticker}]` : "the corporation"} in this period`}>
            <SortableTable entityLabel="Pilot" columns={PILOT_COLUMNS} rows={pilotRows} defaultSort="kills" initialRows={15} />
          </Panel>
        </PendingFrame>

        <p className="text-xs text-ink-3">
          Data: zKillboard{status.lastSyncAt ? `, synced ${relativeTime(status.lastSyncAt)}` : ""}
          {status.since ? ` · history since ${status.since.slice(0, 10)}` : ""}. A kill counts when a corporation member is on the
          killmail; ISK values are zKillboard estimates and count in full for every pilot and hull involved. Week-over-week
          figures compare {weekLabel} with {rangeLabel(w.prevWeek)}.
          {status.lastError && <span className="text-critical-text"> Last sync error: {status.lastError}</span>}
        </p>
      </div>
    </PendingProvider>
  );
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "±0";
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
      <dt className="eve-label flex items-center gap-1.5 text-[0.62rem] whitespace-nowrap text-ink-3">
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
