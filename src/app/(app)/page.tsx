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
import { addDays } from "@/lib/dates";
import { compact, delta, integer, isRecent, percent } from "@/lib/format";
import { WeekDelta } from "@/components/ui/deltas";
import { KillsChart } from "@/modules/killboard/components/kills-chart";
import { RecentActivity } from "@/modules/killboard/components/recent-activity";
import { MvpCard, RunnersUp } from "@/modules/killboard/components/top-pilots";
import { killboardWindows } from "@/modules/killboard/filters";
import { KILLBOARD_PERMISSIONS } from "@/modules/killboard/module";
import { efficiency, getDailyActivity, getPilots, getRecentActivity, getTotals } from "@/modules/killboard/queries";
import { toChartClasses } from "@/modules/mining/class-colors";
import { DailyChart } from "@/modules/mining/components/daily-chart";
import { DATE_PRESETS, isoDate, parseMiningFilters } from "@/modules/mining/filters";
import { MINING_PERMISSIONS } from "@/modules/mining/module";
import { getDailySeries, getMiningSummary, miningScope } from "@/modules/mining/queries";

export const metadata = { title: "Dashboard" };

const ROADMAP = [
  { icon: BookOpen, title: "Skills & skill plans", text: "Corp skill plans and who can fly what." },
  { icon: Boxes, title: "Assets", text: "Find items across members and corp hangars." },
  { icon: Wallet, title: "Wallets", text: "Corporation divisions and personal wallets." },
  { icon: Radar, title: "Live fleet", text: "Fleet composition from shared fleet ESI." },
];

export default async function OverviewPage() {
  const user = await requireUser();
  const settings = await getSettings();
  const today = isoDate(new Date());
  const canMining = user.canAny(MINING_PERMISSIONS.viewOwn, MINING_PERMISSIONS.viewCorp);
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
    user.can("sync.view")
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
    const t = tokens.find((x) => x.characterId === c.characterId);
    return t?.status === "active" && required.every((s) => t.scopes.includes(s));
  }).length;

  return (
    <div className="space-y-6">
      <div className="grid items-stretch gap-8 xl:grid-cols-12">
        <div className="flex flex-col justify-center xl:col-span-6">
          <PageHeader
            eyebrow="Overview"
            title={`Welcome back, ${user.main?.name ?? "capsuleer"}`}
            description="Here is what your corporation has been up to over the last 30 days."
          />
          <div className="mt-8 grid gap-x-8 gap-y-6 sm:grid-cols-2">
            <InfoItem icon={Building2} label="Home corporation">
              {homeCorp ? `${homeCorp.name}` : "Not configured"}
            </InfoItem>
            <InfoItem icon={Users} label="Registered characters">
              {members ? `${stats.registered} of ${members} members` : `${stats.registered} registered`}
            </InfoItem>
            <InfoItem icon={KeyRound} label="Your ESI access">
              {healthy} of {user.characters.length} characters complete
            </InfoItem>
            <InfoItem icon={Server} label="Sync worker">
              <span className="inline-flex items-center gap-2">
                <span className={workerOnline ? "size-2 rounded-full bg-good" : "size-2 rounded-full bg-critical"} aria-hidden />
                {workerOnline ? "Online" : "No heartbeat"}
              </span>
            </InfoItem>
          </div>
        </div>
        <Glass className="dot-grid relative grid min-h-[300px] place-items-center overflow-hidden xl:col-span-6">
          {homeCorp ? (
            <div className="glass-chip w-[min(400px,90%)] rounded-xl p-4">
              <div className="flex items-center gap-3">
                <CorpLogo id={homeCorp.corporationId} size={44} className="rounded-lg ring-1 ring-white/10" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{homeCorp.name}</div>
                  <div className="text-xs text-ink-3">
                    {combat ? `${activePilots} active ${activePilots === 1 ? "pilot" : "pilots"} · 30 days` : "Home corporation"}
                    {members ? <span className="text-ink-3/70"> · {members} members</span> : null}
                  </div>
                </div>
                <span className="rounded border border-white/10 px-1.5 py-px font-mono text-3xs text-ink-2">
                  {homeCorp.ticker}
                </span>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 border-t border-white/[0.08] pt-3 text-xs">
                <div>
                  <div className="eve-label text-2xs text-ink-3">Kills 30d</div>
                  <div className="mt-0.5 font-medium tabular-nums">{killsNow ? integer(killsNow.kills) : "—"}</div>
                </div>
                <div>
                  <div className="eve-label text-2xs text-ink-3">Losses 30d</div>
                  <div className="mt-0.5 font-medium tabular-nums">{killsNow ? integer(killsNow.losses) : "—"}</div>
                </div>
                <div>
                  <div className="eve-label text-2xs text-ink-3">Efficiency</div>
                  <div className="mt-0.5 font-medium tabular-nums">{eff === null ? "—" : percent(eff, 1)}</div>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-ink-3">Set a home corporation in Settings.</p>
          )}
        </Glass>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {killsNow && killsBefore && (
          <>
            <StatTile
              icon={Swords}
              label="Kills · 30 days"
              value={integer(killsNow.kills)}
              delta={<WeekDelta change={killsNow.kills - killsBefore.kills} suffix="vs prior 30d" />}
              hint={`${integer(killsNow.losses)} losses`}
            />
            <StatTile
              icon={Coins}
              label="ISK destroyed · 30 days"
              value={compact(killsNow.iskDestroyed)}
              unit="ISK"
              delta={<Delta value={delta(killsNow.iskDestroyed, killsBefore.iskDestroyed)} period="prior 30d" />}
            />
            <StatTile
              icon={Target}
              label="ISK efficiency · 30 days"
              value={eff === null ? "—" : percent(eff, 1)}
              delta={
                <WeekDelta
                  change={eff !== null && effBefore !== null ? (eff - effBefore) * 100 : null}
                  format={(n) => `${n.toFixed(1)} pts`}
                  suffix="vs prior 30d"
                />
              }
              hint={`${compact(killsNow.iskLost)} ISK lost`}
            />
          </>
        )}
        {corp ? (
          <StatTile
            icon={Gem}
            label="Corporation mining · 30 days"
            value={compact(corp.current.value)}
            unit="ISK"
            delta={<Delta value={delta(corp.current.value, corp.previous.value)} period="prior 30d" />}
          />
        ) : own ? (
          <StatTile
            icon={Pickaxe}
            label="Your mining · 30 days"
            value={compact(own.current.value)}
            unit="ISK"
            delta={<Delta value={delta(own.current.value, own.previous.value)} period="prior 30d" />}
          />
        ) : null}
        {!combat && (
          <StatTile
            icon={Users}
            label="Your characters"
            value={String(user.characters.length)}
            delta={
              healthy === user.characters.length ? (
                <StatusBadge status="ok" label="ESI complete" />
              ) : (
                <StatusBadge status="warning" label={`${user.characters.length - healthy} need attention`} />
              )
            }
          />
        )}
        {!combat && syncStats && (
          <StatTile
            icon={Activity}
            label="Background sync"
            value={`${syncStats[0]?.total ?? 0} jobs`}
            delta={
              syncStats[0]?.failing ? (
                <StatusBadge status="error" label={`${syncStats[0].failing} failing`} />
              ) : (
                <StatusBadge status="ok" label="Healthy" />
              )
            }
          />
        )}
        {!combat && !syncStats && pendingUsers && (
          <StatTile label="Awaiting approval" value={String(pendingUsers[0]?.n ?? 0)} />
        )}
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-12">
        {combat ? (
          <div className="space-y-4 xl:col-span-8">
            <Panel
              title="Kills over time · last 30 days"
              subtitle="Kills and losses per day"
              actions={
                <ButtonLink href="/killboard" size="sm">
                  <Swords className="size-4" aria-hidden /> Killboard
                </ButtonLink>
              }
            >
              <KillsChart rows={activity} />
            </Panel>
            <Panel title="Latest kills and losses" subtitle="Opens on zKillboard">
              <RecentActivity rows={recent} />
            </Panel>
          </div>
        ) : canMining ? (
          <Panel
            className="xl:col-span-8"
            title={corpScope ? "Corporation mining · last 30 days" : "Your mining · last 30 days"}
            subtitle="Daily ISK by resource"
            actions={
              <ButtonLink href="/mining" size="sm">
                <Pickaxe className="size-4" aria-hidden /> Mining overview
              </ButtonLink>
            }
          >
            <DailyChart metric="value" rows={daily.map((d) => ({ date: d.date, total: d.total, values: toChartClasses(d.byClass) }))} />
          </Panel>
        ) : (
          <Panel className="xl:col-span-8" title="Getting started">
            <p className="text-sm text-ink-2">
              Link your characters and grant ESI access while a director approves your account.
            </p>
            <ButtonLink href="/characters" variant="primary" className="mt-4">
              <Link2 className="size-4" aria-hidden /> Manage characters
            </ButtonLink>
          </Panel>
        )}

        <div className="space-y-4 xl:col-span-4">
          {ranked.length > 0 && (
            <Panel
              title="MVP · last 30 days"
              actions={
                <Link href="/killboard" className="inline-flex items-center gap-1 text-xs text-accent hover:underline">
                  All pilots <ArrowRight className="size-3" aria-hidden />
                </Link>
              }
            >
              <MvpCard pilot={ranked[0]} period="30 days" size="md" />
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
              <span className="flex-1">{syncStats[0].failing} sync jobs failing</span>
              <Link href="/admin/sync" className="text-xs text-accent hover:underline">
                Sync status
              </Link>
            </Glass>
          ) : null}
          <Panel
            title="Your characters"
            actions={
              <Link href="/characters" className="inline-flex items-center gap-1 text-xs text-accent hover:underline">
                Manage <ArrowRight className="size-3" aria-hidden />
              </Link>
            }
          >
            <ul className="space-y-2">
              {user.characters.map((c) => {
                const t = tokens.find((x) => x.characterId === c.characterId);
                const ok = t?.status === "active" && required.every((s) => t.scopes.includes(s));
                return (
                  <li key={c.characterId} className="flex items-center gap-3 text-sm">
                    <Portrait id={c.characterId} size={28} />
                    <span className="min-w-0 flex-1 truncate">{c.name}</span>
                    {ok ? (
                      <StatusBadge status="ok" label="ESI" />
                    ) : t?.status === "invalid" ? (
                      <StatusBadge status="error" label="Revoked" />
                    ) : (
                      <StatusBadge status="warning" label="Scopes" />
                    )}
                  </li>
                );
              })}
            </ul>
          </Panel>
        </div>
      </div>

      <div>
        <div className="eve-label mb-3 text-xs text-ink-3">On the roadmap</div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {ROADMAP.map((r) => (
            <Glass key={r.title} className="flex items-start gap-3 px-5 py-4 opacity-80">
              <div className="grid size-9 shrink-0 place-items-center rounded-lg border border-white/[0.08] bg-white/[0.025]">
                <r.icon className="size-4 text-ink-2" aria-hidden />
              </div>
              <div>
                <div className="text-sm font-medium">{r.title}</div>
                <div className="mt-0.5 text-xs text-ink-3">{r.text}</div>
              </div>
            </Glass>
          ))}
        </div>
      </div>
    </div>
  );
}
