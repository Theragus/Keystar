import { LogOut } from "lucide-react";

import type { CurrentUser } from "@/core/auth/dal";
import { env } from "@/core/env";
import { navSections } from "@/core/modules/registry";
import { KEYSTAR_VERSION } from "@/core/version";
import { getI18n } from "@/i18n/server";
import { Portrait } from "@/components/ui/eve-image";
import { RoleBadge } from "@/components/ui/badge";
import { ThemeSwitcher } from "./theme-switcher";
import { LanguageSwitcher } from "./language-switcher";
import { SidebarToggle } from "./sidebar-state";
import { NavLink } from "./nav-link";
import { RailFlyout } from "./rail-flyout";

export function visibleNav(user: CurrentUser) {
  const sections = navSections()
    .map((s) => ({ ...s, items: s.items.filter((i) => !i.anyPermission || user.canAny(...i.anyPermission)) }))
    .filter((s) => s.items.length > 0);
  const hrefs = sections.flatMap((s) => s.items.map((i) => i.href));
  const hasNested = (href: string) => hrefs.some((h) => h !== href && h.startsWith(`${href}/`));
  return { sections, hasNested };
}

/**
 * Docked, full-height sidebar with a translucent glass surface and a hairline edge.
 * Collapses to an icon rail via `data-sidebar` on the shell root (see SectionScope);
 * hidden labels stay in the accessibility tree as `sr-only`, and hovering a section
 * or the portrait shows what the rail hides in a card beside it (RailFlyout).
 */
export async function Sidebar({ user, corpTicker }: { user: CurrentUser; corpTicker: string | null }) {
  const { sections, hasNested } = visibleNav(user);
  const { t } = await getI18n();
  const pilotInfo = (
    <>
      <div className="truncate text-[0.82rem] font-medium">{user.main?.name ?? t.shell.unknownPilot}</div>
      <div className="mt-0.5 flex items-center gap-1.5">
        <RoleBadge role={user.role} />
        {corpTicker && <span className="font-mono text-3xs text-ink-3">[{corpTicker}]</span>}
      </div>
    </>
  );

  return (
    <aside
      id="app-sidebar"
      className="relative z-30 w-[232px] shrink-0 self-stretch border-r border-surface-contrast/[0.07] bg-space-900/70 backdrop-blur-xl transition-[width] duration-150 ease-out group-data-[sidebar=collapsed]/shell:w-14 motion-reduce:transition-none"
    >
      {/* Preserve heading space so collapsed icons keep their vertical positions. */}
      <div className="sticky top-0 flex h-dvh flex-col ">
        <div className="flex h-14 shrink-0 items-center border-b border-surface-contrast/[0.07] px-4 group-data-[sidebar=collapsed]/shell:justify-center group-data-[sidebar=collapsed]/shell:px-0">
          <SidebarToggle />
        </div>
        <nav
          className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-4 group-data-[sidebar=collapsed]/shell:overflow-clip"
          aria-label={t.shell.mainNav}
        >
          {sections.map((section) => (
            <RailFlyout
              key={section.id}
              className="group"
              tone={section.tone}
              card={
                <>
                  <div className="eve-label px-2.5 pt-1.5 pb-1 text-2xs text-ink-3 group-has-[[aria-current=page]]:text-[color-mix(in_srgb,var(--section)_75%,var(--color-ink-3))]">
                    {section.label(t)}
                  </div>
                  <ul className="space-y-0.5" data-flyout-anchor>
                    {section.items.map((item) => (
                      <li key={item.href}>
                        <NavLink href={item.href} exact={hasNested(item.href)} inFlyout>
                          <item.icon className="size-4 shrink-0 opacity-75" aria-hidden />
                          <span className="truncate">{item.label(t)}</span>
                        </NavLink>
                      </li>
                    ))}
                  </ul>
                </>
              }
            >
              <div className="eve-label px-2.5 pb-1.5 text-2xs text-ink-3 group-has-[[aria-current=page]]:text-[color-mix(in_srgb,var(--section)_75%,var(--color-ink-3))] group-data-[sidebar=collapsed]/shell:px-0 group-data-[sidebar=collapsed]/shell:text-center" title={section.label(t)}>
                <span className="group-data-[sidebar=collapsed]/shell:hidden">{section.label(t)}</span>
                <span aria-hidden className="hidden group-data-[sidebar=collapsed]/shell:inline">{Array.from(section.label(t)).slice(0, 3).join("")}</span>
              </div>
              <ul className="space-y-0.5" data-flyout-anchor>
                {section.items.map((item) => (
                  <li key={item.href}>
                    <NavLink href={item.href} exact={hasNested(item.href)}>
                      <item.icon className="size-4 shrink-0 opacity-75" aria-hidden />
                      <span className="truncate group-data-[sidebar=collapsed]/shell:sr-only">{item.label(t)}</span>
                    </NavLink>
                  </li>
                ))}
              </ul>
            </RailFlyout>
          ))}
        </nav>
        <div className="shrink-0 space-y-1 px-3 pb-2 group-data-[sidebar=collapsed]/shell:px-2">
          <div className="flex flex-wrap items-center gap-1 group-data-[sidebar=collapsed]/shell:flex-col">
            <LanguageSwitcher />
            <ThemeSwitcher />
          </div>
          <a
            href={`${env().SOURCE_URL}/releases`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-2 font-mono text-3xs whitespace-nowrap text-ink-3 hover:text-ink-2 group-data-[sidebar=collapsed]/shell:hidden"
            title={t.shell.releaseNotes}
          >
            Keystar v{KEYSTAR_VERSION}
          </a>
        </div>
        <div className="shrink-0 border-t border-surface-contrast/[0.07] p-3 group-data-[sidebar=collapsed]/shell:px-0">
          <div className="flex items-center gap-2.5 group-data-[sidebar=collapsed]/shell:flex-col group-data-[sidebar=collapsed]/shell:gap-2">
            <RailFlyout
              className="shrink-0"
              card={
                <div className="px-2.5 py-1.5" data-flyout-anchor>
                  {pilotInfo}
                </div>
              }
            >
              <div data-flyout-anchor>
                {user.main ? <Portrait id={user.main.characterId} size={32} /> : <div className="size-8 rounded-full bg-space-700" />}
              </div>
            </RailFlyout>
            <div className="min-w-0 flex-1 group-data-[sidebar=collapsed]/shell:sr-only">{pilotInfo}</div>
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
      </div>
    </aside>
  );
}
