import { ArrowLeft, Check, KeyRound } from "lucide-react";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { Glass } from "@/components/ui/glass";
import { KeystarMark } from "@/components/shell/logo";
import { getCurrentUser } from "@/core/auth/dal";
import { getCorporation } from "@/core/corp";
import { memberScopeRequirements } from "@/core/modules/registry";
import { getSetting } from "@/core/settings";

export const metadata = { title: "Join" };

/**
 * Shareable recruitment link: explains exactly which ESI scopes members grant
 * and why, then sends them through EVE SSO with those scopes.
 */
export default async function JoinPage() {
  const user = await getCurrentUser();
  const corp = await getCorporation(await getSetting("corp.homeCorporationId"));
  const scopes = memberScopeRequirements();

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Glass className="w-full max-w-[560px] rounded-2xl px-9 py-9">
        <div className="flex items-center gap-3">
          <KeystarMark className="size-11" />
          <div>
            <div className="eve-label text-xs text-accent">Keystar registration</div>
            <h1 className="font-display text-2xl font-bold tracking-wide">
              {corp ? `Join ${corp.name} on Keystar` : "Register your characters"}
            </h1>
          </div>
        </div>
        <p className="mt-4 text-sm text-ink-2">
          Log in with each character you want to register. Keystar will request read-only access to the following ESI
          data. Nothing can be changed in game, and you can revoke access at any time.
        </p>

        <ul className="mt-5 space-y-2.5">
          {scopes.map((s) => (
            <li key={s.scope} className="flex gap-3 rounded-2xl glass-inset px-4 py-3">
              <Check className="mt-0.5 size-4 shrink-0 text-good-text" aria-hidden />
              <div>
                <div className="text-sm text-ink">{s.reason}</div>
                <code className="mt-0.5 block text-2xs text-ink-3">{s.scope}</code>
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-7">
          <ButtonLink
            href={user ? "/auth/login?intent=link" : "/auth/login?intent=join"}
            variant="primary"
            size="lg"
            className="w-full"
          >
            <KeyRound className="size-5" aria-hidden />
            {user ? "Link a character with EVE Online" : "Register with EVE Online"}
          </ButtonLink>
          <p className="mt-3 text-center text-xs text-ink-3">
            Have alts? After registering, open <span className="text-ink-2">My Characters</span> and link each one.
          </p>
        </div>
        <Link href="/login" className="mt-6 inline-flex items-center gap-1.5 text-xs text-ink-3 hover:text-ink">
          <ArrowLeft className="size-3.5" aria-hidden /> Back to sign in
        </Link>
      </Glass>
    </main>
  );
}
