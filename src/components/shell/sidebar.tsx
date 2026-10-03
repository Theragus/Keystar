import { LogOut } from "lucide-react";
import Link from "next/link";
import type { CurrentUser } from "@/core/auth/dal";
import { env } from "@/core/env";
import { navSections } from "@/core/modules/registry";
import { KEYSTAR_VERSION } from "@/core/version";
import { getI18n } from "@/i18n/server";
import { Portrait } from "@/components/ui/eve-image";
import { RoleBadge } from "@/components/ui/badge";
import { ThemeSwitcher } from "./theme-switcher";
import { LanguageSwitcher } from "./language-switcher";
import { KeystarMark } from "./logo";
import { NavLink } from "./nav-link";

export function visibleNav(user: CurrentUser) {
  const sections = navSections()
    .map((s) => ({ ...s, items: s.items.filter((i) => !i.anyPermission || user.canAny(...i.anyPermission)) }))
    .filter((s) => s.items.length > 0);
  const hrefs = sections.flatMap((s) => s.items.map((i) => i.href));
  const hasNested = (href: string) => hrefs.some((h) => h !== href && h.startsWith(`${href}/`));
  return { sections, hasNested };
}

/** Docked, full-height sidebar with a translucent glass surface and a hairline edge. */
export async function Sidebar({ user, corpTicker }: { user: CurrentUser; corpTicker: string | null }) {
  const { sections, hasNested } = visibleNav(user);
  const { t } = await getI18n();

  return (
    <aside className="sticky top-0 flex h-screen w-[232px] shrink-0 flex-col border-r border-surface-contrast/[0.07] bg-space-900/70 backdrop-blur-xl">
      <Link href="/" className="flex h-14 items-center gap-2.5 border-b border-surface-contrast/[0.07] px-4">
        <KeystarMark className="size-7" />
        <span className="font-display text-[1.05rem] font-bold tracking-[0.2em] text-ink">KEYSTAR</span>
      </Link>
      <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-4" aria-label={t.shell.mainNav}>
        {sections.map((section) => (
          <div key={section.id} className="group">
            <div className="eve-label px-2.5 pb-1.5 text-2xs text-ink-3 group-has-[[aria-current=page]]:text-[color-mix(in_srgb,var(--section)_75%,var(--color-ink-3))]">
              {section.label(t)}
            </div>
            <ul className="space-y-0.5">
              {section.items.map((item) => (
                <li key={item.href}>
                  <NavLink href={item.href} exact={hasNested(item.href)}>
                    <item.icon className="size-4 shrink-0 opacity-75" aria-hidden />
                    {item.label(t)}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <div className="space-y-1 px-3 pb-2">
        <div className="flex flex-wrap items-center gap-1">
          <LanguageSwitcher />
          <ThemeSwitcher />
        </div>
        <a
          href={`${env().SOURCE_URL}/releases`}
          target="_blank"
          rel="noopener noreferrer"
          className="px-2 font-mono text-3xs whitespace-nowrap text-ink-3 hover:text-ink-2"
          title={t.shell.releaseNotes}
        >
          Keystar v{KEYSTAR_VERSION}
        </a>
      </div>
      <div className="border-t border-surface-contrast/[0.07] p-3">
        <div className="flex items-center gap-2.5">
          {user.main ? <Portrait id={user.main.characterId} size={32} /> : <div className="size-8 rounded-full bg-space-700" />}
          <div className="min-w-0 flex-1">
            <div className="truncate text-[0.82rem] font-medium">{user.main?.name ?? t.shell.unknownPilot}</div>
            <div className="mt-0.5 flex items-center gap-1.5">
              <RoleBadge role={user.role} />
              {corpTicker && <span className="font-mono text-3xs text-ink-3">[{corpTicker}]</span>}
            </div>
          </div>
          <form action="/auth/logout" method="post">
            <button
              type="submit"
              title={t.shell.signOut}
              aria-label={t.shell.signOut}
              className="grid size-7 place-items-center rounded-md text-ink-3 transition hover:bg-surface-contrast/[0.06] hover:text-ink"
            >
              <LogOut className="size-3.5" aria-hidden />
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
