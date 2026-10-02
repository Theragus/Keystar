import { inArray, sql } from "drizzle-orm";
import {
  Activity,
  ArrowRight,
  BookOpen,
  Boxes,
  Building2,
  Gem,
  KeyRound,
  Link2,
  Pickaxe,
  Radar,
  Server,
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
import { compact, delta, formatMetric, isRecent } from "@/lib/format";
import { toChartClasses } from "@/modules/mining/class-colors";
import { DailyChart } from "@/modules/mining/components/daily-chart";
import { DATE_PRESETS, isoDate, parseMiningFilters } from "@/modules/mining/filters";
import { MINING_PERMISSIONS } from "@/modules/mining/module";
import { getDailySeries, getMemberBreakdown, getMiningSummary } from "@/modules/mining/queries";

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
  const corpScope = user.can(MINING_PERMISSIONS.viewCorp);
  const range = DATE_PRESETS.find((p) => p.id === "30d")!.range(today);
  const filters = parseMiningFilters(range, today);
  const valuation = { source: settings["mining.valuationSource"], mode: settings["mining.valuationMode"] };

  const homeCorpId = settings["corp.homeCorporationId"];
  const [own, corp, daily, top, tokens, syncStats, pendingUsers, homeCorp, corpStats, workers] = await Promise.all([
    canMining ? getMiningSummary(filters, { corp: false, ownCharacterIds: user.characterIds }, valuation) : null,
    corpScope ? getMiningSummary(filters, { corp: true, ownCharacterIds: [] }, valuation) : null,
    canMining ? getDailySeries(filters, { corp: corpScope, ownCharacterIds: user.characterIds }, valuation) : [],
    corpScope ? getMemberBreakdown(filters, { corp: true, ownCharacterIds: [] }, valuation) : [],
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
    getDb().execute<{ registered: number; roster: number; refineries: number }>(sql`
      SELECT (SELECT COUNT(*)::int FROM characters WHERE corporation_id = ${homeCorpId ?? 0}) AS registered,
             (SELECT COUNT(*)::int FROM corporation_members WHERE corporation_id = ${homeCorpId ?? 0}) AS roster,
             (SELECT COUNT(*)::int FROM mining_observers WHERE corporation_id = ${homeCorpId ?? 0}) AS refineries`),
    getDb().select().from(workerHeartbeats),
  ]);
  const workerOnline = workers.some((w) => isRecent(w.lastBeatAt, 2 * 60_000));
  const stats = corpStats[0] ?? { registered: 0, roster: 0, refineries: 0 };

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
              {stats.roster ? `${stats.registered} of ${stats.roster} in roster` : `${stats.registered} registered`}
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
            <div className="glass-chip w-[min(360px,90%)] rounded-xl p-4">
              <div className="flex items-center gap-3">
                <CorpLogo id={homeCorp.corporationId} size={44} className="rounded-lg ring-1 ring-white/10" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{homeCorp.name}</div>
                  <div className="text-xs text-ink-3">{homeCorp.memberCount ?? "?"} pilots in game</div>
                </div>
                <span className="rounded border border-white/10 px-1.5 py-px font-mono text-[0.62rem] text-ink-2">
                  {homeCorp.ticker}
                </span>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 border-t border-white/[0.08] pt-3 text-xs">
                <div>
                  <div className="eve-label text-[0.58rem] text-ink-3">Mined 30d</div>
                  <div className="mt-0.5 font-medium tabular-nums">{corp ? compact(corp.current.value) : "—"}</div>
                </div>
                <div>
                  <div className="eve-label text-[0.58rem] text-ink-3">Miners</div>
                  <div className="mt-0.5 font-medium tabular-nums">{corp ? corp.current.miners : "—"}</div>
                </div>
                <div>
                  <div className="eve-label text-[0.58rem] text-ink-3">Refineries</div>
                  <div className="mt-0.5 font-medium tabular-nums">{stats.refineries}</div>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-ink-3">Set a home corporation in Settings.</p>
          )}
        </Glass>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {corp && (
          <StatTile
            icon={Gem}
            label="Corporation mining · 30 days"
            value={compact(corp.current.value)}
            unit="ISK"
            delta={<Delta value={delta(corp.current.value, corp.previous.value)} period="prior 30d" />}
          />
        )}
        {own && (
          <StatTile
            icon={Pickaxe}
            label="Your mining · 30 days"
            value={compact(own.current.value)}
            unit="ISK"
            delta={<Delta value={delta(own.current.value, own.previous.value)} period="prior 30d" />}
          />
        )}
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
        {syncStats && (
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
        {!syncStats && pendingUsers && (
          <StatTile label="Awaiting approval" value={String(pendingUsers[0]?.n ?? 0)} />
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        {canMining ? (
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
          {corpScope && top.length > 0 && (
            <Panel title="Top miners · 30 days">
              <ol className="space-y-2">
                {top.slice(0, 5).map((m, i) => (
                  <li key={m.key} className="flex items-center gap-3 text-sm">
                    <span className="w-4 text-right text-xs text-ink-3">{i + 1}</span>
                    <Portrait id={m.portraitId} size={28} />
                    <span className="min-w-0 flex-1 truncate">{m.name}</span>
                    <span className="font-semibold tabular-nums">{formatMetric("value", m.value)}</span>
                  </li>
                ))}
              </ol>
            </Panel>
          )}
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
        <div className="eve-label mb-3 text-[0.7rem] text-ink-3">On the roadmap</div>
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
