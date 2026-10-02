import { inArray } from "drizzle-orm";
import { Building2, Crown, KeyRound, Link2, RefreshCw, Trash2, TriangleAlert } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { CorpLogo, Portrait } from "@/components/ui/eve-image";
import { Glass, Panel } from "@/components/ui/glass";
import { requireUser } from "@/core/auth/dal";
import { characterCorpRoles, esiTokens, eveCorporations, getDb, syncJobs } from "@/core/db";
import { allScopeRequirements, characterScopes, corporationScopes } from "@/core/modules/registry";
import { relativeTime } from "@/lib/format";
import { JOB_LABELS } from "@/modules/jobs";
import { removeCharacter, setMainCharacter, syncCharacterNow } from "./actions";

export const metadata = { title: "My characters" };

export default async function CharactersPage() {
  const user = await requireUser();
  const ids = user.characterIds;
  const db = getDb();
  const [tokens, roles, corps, jobs] = ids.length
    ? await Promise.all([
        db.select().from(esiTokens).where(inArray(esiTokens.characterId, ids)),
        db.select().from(characterCorpRoles).where(inArray(characterCorpRoles.characterId, ids)),
        db
          .select()
          .from(eveCorporations)
          .where(inArray(eveCorporations.corporationId, [...new Set(user.characters.map((c) => c.corporationId))])),
        db.select().from(syncJobs).where(inArray(syncJobs.ownerId, ids)),
      ])
    : [[], [], [], []];

  const memberScopes = characterScopes();
  const corpOnly = corporationScopes().filter((s) => !memberScopes.includes(s));
  const reasons = new Map(allScopeRequirements().map((s) => [s.scope, s.reason]));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Account"
        title="My Characters"
        description="Link every character you play. Keystar only reads data through the ESI scopes listed here."
        actions={
          <ButtonLink href="/auth/login?intent=link" variant="primary">
            <Link2 className="size-4" aria-hidden /> Link a character
          </ButtonLink>
        }
      />

      <div className="grid gap-4 xl:grid-cols-12">
        <div className="space-y-4 xl:col-span-8">
          {user.characters.map((c) => {
            const token = tokens.find((t) => t.characterId === c.characterId);
            const granted = token?.scopes ?? [];
            const missing = memberScopes.filter((s) => !granted.includes(s));
            const corpGranted = corpOnly.filter((s) => granted.includes(s));
            const charRoles = roles.find((r) => r.characterId === c.characterId)?.roles ?? [];
            const corp = corps.find((x) => x.corporationId === c.corporationId);
            const charJobs = jobs.filter((j) => j.ownerType === "character" && j.ownerId === c.characterId && j.enabled);
            const isMain = user.main?.characterId === c.characterId;

            return (
              <Glass key={c.characterId} className="px-5 py-5">
                <div className="flex flex-wrap items-start gap-4">
                  <Portrait id={c.characterId} size={72} className="ring-2" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-semibold">{c.name}</h2>
                      {isMain && (
                        <Badge tone="gold">
                          <Crown className="size-3" aria-hidden /> Main
                        </Badge>
                      )}
                      {!token ? (
                        <StatusBadge status="warning" label="No ESI token" />
                      ) : token.status === "invalid" ? (
                        <StatusBadge status="error" label="Token revoked" />
                      ) : missing.length ? (
                        <StatusBadge status="warning" label={`${missing.length} scope${missing.length > 1 ? "s" : ""} missing`} />
                      ) : (
                        <StatusBadge status="ok" label="ESI active" />
                      )}
                    </div>
                    <div className="mt-1.5 flex items-center gap-2 text-sm text-ink-2">
                      <CorpLogo id={c.corporationId} size={18} />
                      {corp ? `${corp.name} [${corp.ticker}]` : `Corporation ${c.corporationId}`}
                    </div>
                    {charRoles.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {charRoles.slice(0, 8).map((r) => (
                          <Badge key={r}>{r.replace(/_/g, " ")}</Badge>
                        ))}
                      </div>
                    )}
                    {token?.status === "invalid" && token.lastError && (
                      <p className="mt-2 flex items-start gap-1.5 text-xs text-critical-text">
                        <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {token.lastError}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {(!token || token.status === "invalid" || missing.length > 0) && (
                      <ButtonLink href="/auth/login?intent=link" size="sm" variant="primary">
                        <KeyRound className="size-3.5" aria-hidden /> Re-authorise
                      </ButtonLink>
                    )}
                    {token?.status === "active" && (
                      <form action={syncCharacterNow.bind(null, c.characterId)}>
                        <Button size="sm" type="submit" title="Queue all syncs for this character now">
                          <RefreshCw className="size-3.5" aria-hidden /> Sync now
                        </Button>
                      </form>
                    )}
                    {!isMain && (
                      <form action={setMainCharacter.bind(null, c.characterId)}>
                        <Button size="sm" type="submit" variant="ghost">
                          <Crown className="size-3.5" aria-hidden /> Make main
                        </Button>
                      </form>
                    )}
                    {user.characters.length > 1 && (
                      <form action={removeCharacter.bind(null, c.characterId)}>
                        <Button size="sm" type="submit" variant="danger" title="Unlink and revoke this character's token">
                          <Trash2 className="size-3.5" aria-hidden /> Remove
                        </Button>
                      </form>
                    )}
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="rounded-2xl glass-inset px-4 py-3">
                    <div className="eve-label mb-2 text-[0.62rem] text-ink-3">Scopes</div>
                    <ul className="space-y-1 text-xs">
                      {memberScopes.map((s) => (
                        <li key={s} className="flex items-center justify-between gap-2" title={reasons.get(s)}>
                          <code className="truncate text-ink-2">{s}</code>
                          {granted.includes(s) ? <Badge tone="good">granted</Badge> : <Badge tone="warning">missing</Badge>}
                        </li>
                      ))}
                      {corpGranted.length > 0 && (
                        <li className="pt-1 text-ink-3">+ {corpGranted.length} corporation scope(s)</li>
                      )}
                    </ul>
                  </div>
                  <div className="rounded-2xl glass-inset px-4 py-3">
                    <div className="eve-label mb-2 text-[0.62rem] text-ink-3">Background sync</div>
                    {charJobs.length === 0 ? (
                      <p className="text-xs text-ink-3">No sync jobs yet — they appear within a minute of granting scopes.</p>
                    ) : (
                      <ul className="space-y-1.5 text-xs">
                        {charJobs.map((j) => (
                          <li key={j.id} className="flex items-center justify-between gap-2">
                            <span className="text-ink-2">{JOB_LABELS[j.jobKey] ?? j.jobKey}</span>
                            <span className="flex items-center gap-2">
                              <span className="text-ink-3">{relativeTime(j.lastSuccessAt)}</span>
                              <StatusBadge status={j.lastStatus === "ok" ? "ok" : j.lastStatus === "error" ? "error" : "pending"} />
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {token?.lastRefreshedAt && (
                      <p className="mt-2 text-[0.7rem] text-ink-3">Token refreshed {relativeTime(token.lastRefreshedAt)}</p>
                    )}
                  </div>
                </div>
              </Glass>
            );
          })}
        </div>

        <div className="space-y-4 xl:col-span-4">
          <Panel title="Corporation access" subtitle="For directors, accountants and station managers">
            <div className="space-y-3 text-sm text-ink-2">
              <p>
                Corporation data such as moon-mining observers comes from one member&apos;s token who holds the right in-game
                role. Link that character with the additional corporation scopes:
              </p>
              <ul className="space-y-1.5">
                {corpOnly.map((s) => (
                  <li key={s} className="rounded-xl glass-inset px-3 py-2 text-xs">
                    <div className="text-ink">{reasons.get(s)}</div>
                    <code className="text-[0.68rem] text-ink-3">{s}</code>
                  </li>
                ))}
              </ul>
              <ButtonLink href="/auth/login?intent=link-corp" variant="gold" className="w-full">
                <Building2 className="size-4" aria-hidden /> Link with corporation access
              </ButtonLink>
            </div>
          </Panel>
          <Panel title="Privacy" subtitle="What Keystar stores">
            <ul className="list-disc space-y-1.5 pl-4 text-xs text-ink-2">
              <li>Refresh tokens are encrypted with AES-256-GCM before they touch the database.</li>
              <li>Only read scopes are requested; Keystar cannot act in game.</li>
              <li>Removing a character deletes its token and revokes it with CCP. Mining history stays with the corp.</li>
              <li>You can revoke access any time under Third-Party Applications on the EVE Online website.</li>
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}
