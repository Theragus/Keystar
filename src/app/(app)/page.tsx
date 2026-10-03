import { inArray, sql } from "drizzle-orm";
import {
  Activity,
  ArrowRight,
  BookOpen,
  Boxes,
  Building2,
  Coins,
  Crosshair,
  Gem,
  KeyRound,
  Link2,
  Pickaxe,
  Radar,
  Server,
  Swords,
  Target,
  Users,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { StatusBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { CorpLogo, Portrait } from "@/components/ui/eve-image";
import { InfoItem } from "@/components/ui/info-item";
import { Glass, Panel } from "@/components/ui/glass";
import { Delta, StatTile } from "@/components/ui/stat-tile";
import { requireUser } from "@/core/auth/dal";
import { esiTokens, getDb, workerHeartbeats } from "@/core/db";
import { getCorporation } from "@/core/corp";
import { characterScopes } from "@/core/modules/registry";
import { getSettings } from "@/core/settings";
import { getI18n } from "@/i18n/server";
import { addDays } from "@/lib/dates";
import { delta, isRecent } from "@/lib/format";
import { WeekDelta } from "@/components/ui/deltas";
import { KillsChart } from "@/modules/killboard/components/kills-chart";
import { RecentActivity } from "@/modules/killboard/components/recent-activity";
import { MvpCard, RunnersUp } from "@/modules/killboard/components/top-pilots";
import { killboardQueryString, killboardWindows } from "@/modules/killboard/filters";
import { zkillCorporation } from "@/modules/killboard/links";
import { KILLBOARD_PERMISSIONS } from "@/modules/killboard/module";
import { efficiency, getDailyActivity, getPilots, getRecentActivity, getTotals } from "@/modules/killboard/queries";
import { toChartClasses } from "@/modules/mining/class-colors";
import { DailyChart } from "@/modules/mining/components/daily-chart";
import { DATE_PRESETS, isoDate, parseMiningFilters } from "@/modules/mining/filters";
import { MINING_PERMISSIONS } from "@/modules/mining/module";
import { getDailySeries, getMiningSummary, miningScope } from "@/modules/mining/queries";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t.dashboard.metaTitle };
}

const ROADMAP = [
  { id: "skills", icon: BookOpen },
  { id: "assets", icon: Boxes },
  { id: "wallets", icon: Wallet },
  { id: "fleet", icon: Radar },
] as const;

export default async function OverviewPage() {
  const user = await requireUser();
  const { t, f } = await getI18n();
  const d = t.dashboard;
  const settings = await getSettings();
  const today = isoDate(new Date());
  const canMining = user.canAny(MINING_PERMISSIONS.viewOwn, MINING_PERMISSIONS.viewCorp);
  const canSync = user.can("sync.view");
  const range = DATE_PRESETS.find((p) => p.id === "30d")!.range(today);
  const filters = parseMiningFilters(range, today);
  const valuation = { source: settings["mining.valuationSource"], mode: settings["mining.valuationMode"] };

  const homeCorpId = settings["corp.homeCorporationId"];
  const scope = miningScope(user, homeCorpId);
  const corpScope = scope.corp;
  // The dashboard leads with combat: the killboard's last 30 days.
  const combat = homeCorpId !== null && user.can(KILLBOARD_PERMISSIONS.view);
  const windows = killboardWindows(range, today);
  const prior = { from: addDays(range.from, -30), to: addDays(range.from, -1) };
  const [killsNow, killsBefore, activity, pilots, recent] = await Promise.all([
    combat ? getTotals(homeCorpId!, range) : null,
    combat ? getTotals(homeCorpId!, prior) : null,
    combat ? getDailyActivity(homeCorpId!, range) : [],
    combat ? getPilots(homeCorpId!, windows) : [],
    combat ? getRecentActivity(homeCorpId!, range, 6) : [],
  ]);
  const [own, corp, daily, tokens, syncStats, pendingUsers, homeCorp, corpStats, workers] = await Promise.all([
    canMining && !combat ? getMiningSummary(filters, { ...scope, corp: false }, valuation) : null,
    corpScope ? getMiningSummary(filters, scope, valuation) : null,
    canMining && !combat ? getDailySeries(filters, scope, valuation) : [],
    user.characterIds.length
      ? getDb().select().from(esiTokens).where(inArray(esiTokens.characterId, user.characterIds))
      : Promise.resolve([]),
    canSync
      ? getDb().execute<{ total: number; failing: number }>(
          sql`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE last_status = 'error')::int AS failing
              FROM sync_jobs WHERE enabled`,
        )
      : null,
    user.can("users.manage")
      ? getDb().execute<{ n: number }>(sql`SELECT COUNT(*)::int AS n FROM users WHERE role = 'guest' AND NOT is_disabled`)
      : null,
    getCorporation(homeCorpId),
    getDb().execute<{ registered: number; roster: number }>(sql`
      SELECT (SELECT COUNT(*)::int FROM characters WHERE corporation_id = ${homeCorpId ?? 0}) AS registered,
             (SELECT COUNT(*)::int FROM corporation_members WHERE corporation_id = ${homeCorpId ?? 0}) AS roster`),
    getDb().select().from(workerHeartbeats),
  ]);
  const workerOnline = workers.some((w) => isRecent(w.lastBeatAt, 2 * 60_000));
  const stats = corpStats[0] ?? { registered: 0, roster: 0 };
  const members = stats.roster || homeCorp?.memberCount || 0;
  const activePilots = pilots.length;
  const ranked = pilots.filter((p) => p.kills > 0);
  const eff = killsNow ? efficiency(killsNow.iskDestroyed, killsNow.iskLost) : null;
  const effBefore = killsBefore ? efficiency(killsBefore.iskDestroyed, killsBefore.iskLost) : null;

  const required = characterScopes();
  const healthy = user.characters.filter((c) => {
    const token = tokens.find((x) => x.characterId === c.characterId);
    return token?.status === "active" && required.every((s) => token.scopes.includes(s));
  }).length;

  // Tiles open the killboard on the same 30 days rather than its 90-day default.
  const killboardHref = `/killboard?${killboardQueryString(range)}`;

  return (
    <div className="space-y-6">
      <div>
        <PageHeader
          eyebrow={d.header.eyebrow}
          title={d.header.welcome(user.main?.name ?? d.header.fallbackName)}
          description={d.header.description}
        />
        {/* Content-sized columns so longer (German) values fit before they truncate. */}
        <div className="mt-8 grid gap-x-8 gap-y-6 sm:grid-cols-2 2xl:grid-cols-[repeat(4,minmax(0,auto))] 2xl:justify-between">
          {homeCorp ? (
            <InfoItem
              media={<CorpLogo id={homeCorp.corporationId} size={44} className="rounded-lg ring-1 ring-white/10" />}
              label={d.info.homeCorp}
              href={zkillCorporation(homeCorp.corporationId)}
              newTabLabel={t.common.opensInNewTab}
            >
              {homeCorp.name} <span className="text-ink-3">[{homeCorp.ticker}]</span>
            </InfoItem>
          ) : (
            <InfoItem
              icon={Building2}
              label={d.info.homeCorp}
              href={user.can("app.settings.manage") ? "/admin/settings" : undefined}
            >
              {d.info.notConfigured}
            </InfoItem>
          )}
          <InfoItem
            icon={Users}
            label={d.info.registered}
            href={user.can("members.audit") ? "/admin/members" : undefined}
          >
            {members ? d.info.registeredOfMembers(stats.registered, members) : d.info.registeredOnly(stats.registered)}
          </InfoItem>
          <InfoItem icon={KeyRound} label={d.info.esiAccess} href="/characters">
            {d.info.esiComplete(healthy, user.characters.length)}
          </InfoItem>
          <InfoItem icon={Server} label={d.info.syncWorker} href={canSync ? "/admin/sync" : undefined}>
            <span className="inline-flex items-center gap-2">
              <span className={workerOnline ? "size-2 rounded-full bg-good" : "size-2 rounded-full bg-critical"} aria-hidden />
              {workerOnline ? d.info.workerOnline : d.info.workerOffline}
            </span>
          </InfoItem>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {killsNow && killsBefore && (
          <>
            <StatTile
              icon={Swords}
              label={d.tiles.kills}
              value={f.integer(killsNow.kills)}
              delta={
                <WeekDelta
                  change={killsNow.kills - killsBefore.kills}
                  format={f.integer}
                  suffix={d.prior.suffix}
                  emptyText={d.prior.empty}
                />
              }
              hint={`${d.tiles.losses(killsNow.losses)} · ${d.tiles.activePilots(activePilots)}`}
              href={killboardHref}
            />
            <StatTile
              icon={Coins}
              label={d.tiles.iskDestroyed}
              value={f.compact(killsNow.iskDestroyed)}
              unit="ISK"
              delta={<Delta value={delta(killsNow.iskDestroyed, killsBefore.iskDestroyed)} period={d.prior.period} />}
              href={`${killboardHref}#isk`}
            />
            <StatTile
              icon={Target}
              label={d.tiles.efficiency}
              value={eff === null ? "—" : f.percent(eff, 1)}
              delta={
                <WeekDelta
                  change={eff !== null && effBefore !== null ? (eff - effBefore) * 100 : null}
                  format={d.tiles.points}
                  suffix={d.prior.suffix}
                  emptyText={d.prior.empty}
                />
              }
              hint={d.tiles.iskLost(f.compact(killsNow.iskLost))}
              href={`${killboardHref}#pilot-efficiency`}
            />
          </>
        )}
        {corp ? (
          <StatTile
            icon={Gem}
            label={d.tiles.corpMining}
            value={f.compact(corp.current.value)}
            unit="ISK"
            delta={<Delta value={delta(corp.current.value, corp.previous.value)} period={d.prior.period} />}
            href="/mining"
          />
        ) : own ? (
          <StatTile
            icon={Pickaxe}
            label={d.tiles.ownMining}
            value={f.compact(own.current.value)}
            unit="ISK"
            delta={<Delta value={delta(own.current.value, own.previous.value)} period={d.prior.period} />}
            href="/mining"
          />
        ) : null}
        {!combat && (
          <StatTile
            icon={Users}
            label={d.tiles.characters}
            value={f.integer(user.characters.length)}
            delta={
              healthy === user.characters.length ? (
                <StatusBadge status="ok" label={d.tiles.esiComplete} />
              ) : (
                <StatusBadge status="warning" label={d.tiles.needAttention(user.characters.length - healthy)} />
              )
            }
            href="/characters"
          />
        )}
        {!combat && syncStats && (
          <StatTile
            icon={Activity}
            label={d.tiles.backgroundSync}
            value={d.tiles.jobs(syncStats[0]?.total ?? 0)}
            delta={
              syncStats[0]?.failing ? (
                <StatusBadge status="error" label={d.tiles.failing(syncStats[0].failing)} />
              ) : (
                <StatusBadge status="ok" label={d.tiles.healthy} />
              )
            }
            href="/admin/sync"
          />
        )}
        {!combat && !syncStats && pendingUsers && (
          <StatTile
            label={d.tiles.awaitingApproval}
            value={f.integer(pendingUsers[0]?.n ?? 0)}
            href={user.can("users.view") ? "/admin/users?role=guest" : undefined}
          />
        )}
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-12">
        {combat ? (
          <div className="space-y-4 xl:col-span-8">
            <Panel
              title={d.panels.killsChart}
              subtitle={d.panels.killsChartSubtitle}
              actions={
                <ButtonLink href="/killboard" size="sm">
                  <Swords className="size-4" aria-hidden /> {t.killboard.module.nav.killboard}
                </ButtonLink>
              }
            >
              <KillsChart rows={activity} />
            </Panel>
            <Panel title={d.panels.recent} subtitle={d.panels.recentSubtitle}>
              <RecentActivity rows={recent} />
            </Panel>
          </div>
        ) : canMining ? (
          <Panel
            className="xl:col-span-8"
            title={corpScope ? d.panels.corpMining : d.panels.ownMining}
            subtitle={d.panels.miningSubtitle}
            actions={
              <ButtonLink href="/mining" size="sm">
                <Pickaxe className="size-4" aria-hidden /> {d.panels.miningOverview}
              </ButtonLink>
            }
          >
            <DailyChart metric="value" rows={daily.map((day) => ({ date: day.date, total: day.total, values: toChartClasses(day.byClass) }))} />
          </Panel>
        ) : (
          <Panel className="xl:col-span-8" title={d.panels.gettingStarted}>
            <p className="text-sm text-ink-2">{d.panels.gettingStartedBody}</p>
            <ButtonLink href="/characters" variant="primary" className="mt-4">
              <Link2 className="size-4" aria-hidden /> {d.panels.manageCharacters}
            </ButtonLink>
          </Panel>
        )}

        <div className="space-y-4 xl:col-span-4">
          {ranked.length > 0 && (
            <Panel
              title={d.panels.mvp}
              actions={
                <Link href="/killboard" className="inline-flex items-center gap-1 text-xs text-accent hover:underline">
                  {d.panels.allPilots} <ArrowRight className="size-3" aria-hidden />
                </Link>
              }
            >
              <MvpCard pilot={ranked[0]} period={t.common.datePresets["30d"]} size="md" />
              {ranked.length > 1 && (
                <div className="mt-3">
                  <RunnersUp pilots={ranked.slice(1, 5)} />
                </div>
              )}
            </Panel>
          )}
          {combat && syncStats?.[0]?.failing ? (
            <Glass className="flex items-center gap-3 px-5 py-3.5 text-sm">
              <Crosshair className="size-4 text-critical-text" aria-hidden />
              <span className="flex-1">{d.panels.syncFailing(syncStats[0].failing)}</span>
              <Link href="/admin/sync" className="text-xs text-accent hover:underline">
                {d.panels.syncStatus}
              </Link>
            </Glass>
          ) : null}
          <Panel
            title={d.panels.characters}
            actions={
              <Link href="/characters" className="inline-flex items-center gap-1 text-xs text-accent hover:underline">
                {d.panels.manage} <ArrowRight className="size-3" aria-hidden />
              </Link>
            }
          >
            <ul className="space-y-2">
              {user.characters.map((c) => {
                const token = tokens.find((x) => x.characterId === c.characterId);
                const ok = token?.status === "active" && required.every((s) => token.scopes.includes(s));
                return (
                  <li key={c.characterId} className="flex items-center gap-3 text-sm">
                    <Portrait id={c.characterId} size={28} />
                    <span className="min-w-0 flex-1 truncate">{c.name}</span>
                    {ok ? (
                      <StatusBadge status="ok" label="ESI" />
                    ) : token?.status === "invalid" ? (
                      <StatusBadge status="error" label={d.panels.tokenRevoked} />
                    ) : (
                      <StatusBadge status="warning" label={d.panels.tokenScopes} />
                    )}
                  </li>
                );
              })}
            </ul>
          </Panel>
        </div>
      </div>

      <div>
        <div className="eve-label mb-3 text-xs text-ink-3">{d.roadmap.title}</div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {ROADMAP.map((r) => (
            <Glass key={r.id} className="flex items-start gap-3 px-5 py-4 opacity-80">
              <div className="grid size-9 shrink-0 place-items-center rounded-lg border border-white/[0.08] bg-white/[0.025]">
                <r.icon className="size-4 text-ink-2" aria-hidden />
              </div>
              <div>
                <div className="text-sm font-medium">{d.roadmap.items[r.id].title}</div>
                <div className="mt-0.5 text-xs text-ink-3">{d.roadmap.items[r.id].text}</div>
              </div>
            </Glass>
          ))}
        </div>
      </div>
    </div>
  );
}
