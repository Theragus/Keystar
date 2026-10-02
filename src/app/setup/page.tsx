import { inArray } from "drizzle-orm";
import { ArrowLeft, Building2, Check, KeyRound, ShieldCheck, Sparkles } from "lucide-react";
import Link from "next/link";
import { Button, ButtonLink } from "@/components/ui/button";
import { CopyField } from "@/components/ui/copy-button";
import { CorpLogo, Portrait } from "@/components/ui/eve-image";
import { Glass } from "@/components/ui/glass";
import { KeystarMark } from "@/components/shell/logo";
import { requirePermission } from "@/core/auth/dal";
import { getCorporation } from "@/core/corp";
import { esiTokens, eveCorporations, getDb } from "@/core/db";
import { env } from "@/core/env";
import { VALUATION_SOURCES } from "@/core/eve/prices";
import { corporationScopes } from "@/core/modules/registry";
import { getSettings } from "@/core/settings";
import { cn } from "@/lib/utils";
import { finishSetup, saveSetupAccess, saveSetupCorporation } from "./actions";

export const metadata = { title: "Set up Keystar" };

const STEPS = ["Corporation", "Access", "Corporation data", "Invite"] as const;

/**
 * First-start walkthrough for the first admin. Server secrets live in .env;
 * this only covers decisions that belong in the app.
 */
export default async function SetupPage({ searchParams }: PageProps<"/setup">) {
  const user = await requirePermission("app.settings.manage");
  const params = await searchParams;
  const step = Math.min(STEPS.length, Math.max(1, Number(params.step) || 1));
  const settings = await getSettings();
  const db = getDb();

  const ownCorpIds = [...new Set(user.characters.map((c) => c.corporationId))];
  const ownCorps = ownCorpIds.length
    ? await db.select().from(eveCorporations).where(inArray(eveCorporations.corporationId, ownCorpIds))
    : [];
  const home = await getCorporation(settings["corp.homeCorporationId"]);
  const tokens = user.characterIds.length
    ? await db.select().from(esiTokens).where(inArray(esiTokens.characterId, user.characterIds))
    : [];
  const corpScopes = corporationScopes();
  const corpReady = user.characters.filter((c) => {
    const t = tokens.find((x) => x.characterId === c.characterId);
    return t?.status === "active" && corpScopes.every((s) => t.scopes.includes(s));
  });

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-[560px]">
        <div className="mb-6 flex items-center justify-center gap-2" aria-label={`Step ${step} of ${STEPS.length}`}>
          {STEPS.map((label, i) => (
            <span
              key={label}
              title={label}
              className={cn(
                "h-1.5 rounded-full transition-all",
                i + 1 === step ? "w-8 bg-accent" : i + 1 < step ? "w-4 bg-accent/50" : "w-4 bg-white/12",
              )}
            />
          ))}
        </div>

        <Glass className="rounded-2xl px-9 pt-9 pb-8">
          {step === 1 && (
            <form action={saveSetupCorporation}>
              <StepHeader icon={Building2} title="Your home corporation">
                Keystar tracks the members, roster and refineries of one corporation. We picked the one your character is
                in.
              </StepHeader>
              <div className="mt-6 space-y-2">
                {ownCorps.map((c) => (
                  <label
                    key={c.corporationId}
                    className="flex cursor-pointer items-center gap-3 rounded-xl glass-inset px-4 py-3 has-[:checked]:ring-1 has-[:checked]:ring-accent/60"
                  >
                    <input
                      type="radio"
                      name="corporationId"
                      value={c.corporationId}
                      defaultChecked={c.corporationId === (home?.corporationId ?? ownCorps[0]?.corporationId)}
                      className="accent-[#5cc8ff]"
                    />
                    <CorpLogo id={c.corporationId} size={36} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{c.name}</div>
                      <div className="text-xs text-ink-3">
                        [{c.ticker}] · {c.memberCount ?? "?"} members
                      </div>
                    </div>
                  </label>
                ))}
                <details className="rounded-xl glass-inset px-4 py-3 text-sm">
                  <summary className="cursor-pointer text-ink-2">Use a different corporation ID</summary>
                  <input
                    name="corporationId"
                    inputMode="numeric"
                    placeholder="e.g. 98765432"
                    className="glass-inset mt-3 h-9 w-full rounded-lg px-3 text-sm text-ink"
                  />
                  <p className="mt-2 text-xs text-ink-3">A value here overrides the selection above.</p>
                </details>
              </div>
              <Footer />
            </form>
          )}

          {step === 2 && (
            <form action={saveSetupAccess}>
              <StepHeader icon={ShieldCheck} title="Who gets in">
                Everyone signs in with EVE SSO. Choose who is approved automatically; everyone else waits as a guest until a
                director approves them.
              </StepHeader>
              <div className="mt-6 space-y-2 text-sm">
                <Toggle
                  name="autoApproveCorpMembers"
                  checked={settings["access.autoApproveCorpMembers"]}
                  title={`Auto-approve members of ${home?.name ?? "the home corporation"}`}
                  hint="They start with the Member role and see their own data."
                />
                <Toggle
                  name="autoApproveAllianceMembers"
                  checked={settings["access.autoApproveAllianceMembers"]}
                  title="Also auto-approve alliance members"
                  hint="Useful when mains live in another alliance corporation."
                />
                <label className="block rounded-xl glass-inset px-4 py-3">
                  <span className="font-medium">Price ore at</span>
                  <select
                    name="valuationSource"
                    defaultValue={settings["mining.valuationSource"]}
                    className="glass-inset mt-2 h-9 w-full rounded-lg px-3 text-sm text-ink [color-scheme:dark]"
                  >
                    {VALUATION_SOURCES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <Footer back={1} />
            </form>
          )}

          {step === 3 && (
            <div>
              <StepHeader icon={KeyRound} title="Corporation data">
                Moon-mining observers and the corporation roster are read through one character with the in-game{" "}
                <strong className="text-ink">Accountant</strong> or <strong className="text-ink">Director</strong> role. You
                can also do this later from My Characters.
              </StepHeader>
              <div className="mt-6 space-y-2">
                {corpReady.length > 0 ? (
                  corpReady.map((c) => (
                    <div key={c.characterId} className="flex items-center gap-3 rounded-xl glass-inset px-4 py-3">
                      <Portrait id={c.characterId} size={32} />
                      <span className="flex-1 font-medium">{c.name}</span>
                      <span className="inline-flex items-center gap-1 text-xs text-good-text">
                        <Check className="size-3.5" aria-hidden /> corporation access granted
                      </span>
                    </div>
                  ))
                ) : (
                  <ButtonLink href="/auth/login?intent=link-corp&returnTo=%2Fsetup%3Fstep%3D3" variant="gold" className="w-full">
                    <Building2 className="size-4" aria-hidden /> Link a character with corporation access
                  </ButtonLink>
                )}
              </div>
              <div className="mt-8 flex items-center justify-between">
                <BackLink step={2} />
                <ButtonLink href="/setup?step=4" variant={corpReady.length ? "primary" : "glass"}>
                  {corpReady.length ? "Continue" : "Skip for now"}
                </ButtonLink>
              </div>
            </div>
          )}

          {step === 4 && (
            <form action={finishSetup}>
              <StepHeader icon={Sparkles} title="Invite your members">
                Share this link in corp chat or MOTD. It explains exactly what Keystar reads and walks pilots through EVE SSO.
              </StepHeader>
              <div className="mt-6">
                <CopyField value={`${env().APP_URL}/join`} />
              </div>
              <ul className="mt-5 space-y-1.5 text-xs text-ink-2">
                <li>• The sync worker picks up new characters within a minute; first ledgers appear shortly after.</li>
                <li>• ESI only keeps 30 days of mining — Keystar keeps everything from today on.</li>
                <li>• Everything here can be changed later under Administration → Settings.</li>
              </ul>
              <div className="mt-8 flex items-center justify-between">
                <BackLink step={3} />
                <Button type="submit" variant="primary">
                  Finish setup
                </Button>
              </div>
            </form>
          )}
        </Glass>

        <div className="mt-5 flex items-center justify-center gap-2 text-xs text-ink-3">
          <KeystarMark className="size-4" /> Step {step} of {STEPS.length} · {STEPS[step - 1]}
        </div>
      </div>
    </main>
  );
}

function StepHeader({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Building2;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="text-center">
      <span className="mx-auto grid size-12 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.03]">
        <Icon className="size-5 text-accent" aria-hidden />
      </span>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="mx-auto mt-2 max-w-md text-sm text-ink-2">{children}</p>
    </div>
  );
}

function Toggle({ name, checked, title, hint }: { name: string; checked: boolean; title: string; hint: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl glass-inset px-4 py-3">
      <input type="checkbox" name={name} defaultChecked={checked} className="mt-0.5 size-4 accent-[#5cc8ff]" />
      <span>
        <span className="font-medium">{title}</span>
        <span className="block text-xs text-ink-3">{hint}</span>
      </span>
    </label>
  );
}

function BackLink({ step }: { step: number }) {
  return (
    <Link href={`/setup?step=${step}`} className="inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink">
      <ArrowLeft className="size-4" aria-hidden /> Back
    </Link>
  );
}

function Footer({ back }: { back?: number }) {
  return (
    <div className="mt-8 flex items-center justify-between">
      {back ? <BackLink step={back} /> : <span />}
      <Button type="submit" variant="primary">
        Continue
      </Button>
    </div>
  );
}
