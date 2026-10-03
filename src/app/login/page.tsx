import { FlaskConical, KeyRound, ServerCog, ShieldCheck, TriangleAlert } from "lucide-react";
import { redirect } from "next/navigation";
import { ButtonLink } from "@/components/ui/button";
import { CopyField } from "@/components/ui/copy-button";
import { Glass } from "@/components/ui/glass";
import { KeystarMark } from "@/components/shell/logo";
import { getCurrentUser } from "@/core/auth/dal";
import { env, ssoCallbackUrl, ssoConfigured } from "@/core/env";
import { applicationScopes } from "@/core/modules/registry";
import { ROLE_META, type Role } from "@/core/rbac/roles";
import { getSetting } from "@/core/settings";

export const metadata = { title: "Sign in" };

const ERRORS: Record<string, string> = {
  sso_not_configured: "EVE SSO is not configured on this server yet (EVE_CLIENT_ID / EVE_CLIENT_SECRET).",
  invalid_state: "Your sign-in attempt expired or was tampered with. Please try again.",
  sso_denied: "The EVE SSO login was cancelled.",
  sso_failed: "Signing in with EVE Online failed.",
  provision: "We couldn't complete your sign-in.",
  demo_disabled: "Demo mode is disabled on this server.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (await getCurrentUser()) redirect("/");
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : null;
  const message = typeof params.message === "string" ? params.message : null;
  const demo = env().KEYSTAR_DEMO_MODE;
  const demoUsers = demo ? await getSetting("demo.users") : {};
  const configured = ssoConfigured();

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-[460px]">
        <Glass className="rounded-2xl px-9 pt-10 pb-8 text-center">
          <KeystarMark className="mx-auto size-16" />
          <h1 className="mt-4 font-display text-[2.4rem] leading-none font-bold tracking-[0.2em]">KEYSTAR</h1>
          <p className="mt-2 text-sm text-ink-2">Corporation command for capsuleers.</p>

          {error && (
            <div className="mt-6 flex items-start gap-2.5 rounded-2xl bg-critical/12 px-4 py-3 text-left text-sm ring-1 ring-critical/30">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-critical-text" aria-hidden />
              <div>
                <div className="font-medium text-ink">{ERRORS[error] ?? "Something went wrong."}</div>
                {message && <div className="mt-0.5 text-xs text-ink-2">{message}</div>}
              </div>
            </div>
          )}

          <div className="mt-8 space-y-3">
            <ButtonLink href="/auth/login?intent=login" variant="primary" size="lg" className="w-full">
              <KeyRound className="size-5" aria-hidden /> Log in with EVE Online
            </ButtonLink>
            <ButtonLink href="/join" variant="glass" size="md" className="w-full">
              New here? Register &amp; grant ESI access
            </ButtonLink>
          </div>


          <div className="mt-7 flex items-start gap-2.5 rounded-2xl glass-inset px-4 py-3 text-left text-xs text-ink-2">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
            <p>
              Signing in only proves who you are — no ESI access is requested. Tokens are requested separately, are
              encrypted at rest, and you can revoke them any time at{" "}
              <span className="text-ink">community.eveonline.com</span>.
            </p>
          </div>
        </Glass>

        {!configured && (
          <Glass className="mt-4 rounded-2xl px-6 py-5 text-left">
            <div className="flex items-center gap-2 text-sm font-semibold text-warning">
              <ServerCog className="size-4" aria-hidden /> Server setup needed
            </div>
            <ol className="mt-3 list-decimal space-y-3 pl-5 text-xs text-ink-2">
              <li>
                Create an application at <span className="text-ink">developers.eveonline.com</span> with this callback URL:
                <div className="mt-1.5">
                  <CopyField value={ssoCallbackUrl()} />
                </div>
              </li>
              <li>
                Enable these scopes on the application:
                <div className="mt-1.5">
                  <CopyField value={applicationScopes().join(" ")} />
                </div>
              </li>
              <li>
                Put the client ID and secret into <code className="text-ink">EVE_CLIENT_ID</code> /{" "}
                <code className="text-ink">EVE_CLIENT_SECRET</code> in <code className="text-ink">.env</code> and run{" "}
                <code className="text-ink">docker compose up -d</code>.
              </li>
              <li>Sign in — the first pilot becomes admin and is guided through the remaining setup.</li>
            </ol>
          </Glass>
        )}

        {demo && Object.keys(demoUsers).length > 0 && (
          <Glass className="mt-4 rounded-2xl px-6 py-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-gold">
              <FlaskConical className="size-4" aria-hidden /> Demo mode — sign in as
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {(Object.keys(demoUsers) as Role[]).map((role) => (
                <ButtonLink key={role} href={`/auth/demo?as=${role}`} size="sm" title={ROLE_META[role]?.description}>
                  {ROLE_META[role]?.label ?? role}
                </ButtonLink>
              ))}
            </div>
          </Glass>
        )}

        <p className="mt-6 text-center text-2xs leading-relaxed text-ink-3">
          EVE Online and the EVE logo are the registered trademarks of CCP hf. Keystar is a fan-made tool not affiliated
          with CCP.
          <br />
          Keystar is free software under the AGPL-3.0 ·{" "}
          <a href={env().SOURCE_URL} className="underline decoration-white/20 underline-offset-2 hover:text-ink">
            Source code
          </a>
        </p>
      </div>
    </main>
  );
}
