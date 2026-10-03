import { Hourglass } from "lucide-react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SectionScope } from "@/components/shell/section-scope";
import { Sidebar, visibleNav } from "@/components/shell/sidebar";
import { isSidebarCollapsed, SIDEBAR_COOKIE } from "@/components/shell/sidebar-config";
import { SidebarProvider } from "@/components/shell/sidebar-state";
import { TopBar } from "@/components/shell/topbar";
import { ToastProvider } from "@/components/ui/toast";
import { requireUser } from "@/core/auth/dal";
import { getCorporation } from "@/core/corp";
import { env } from "@/core/env";
import { getSettings } from "@/core/settings";
import { getI18n } from "@/i18n/server";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const settings = await getSettings();
  // First start: walk the admin through the few settings that need a decision.
  if (!settings["setup.completedAt"] && user.can("app.settings.manage")) redirect("/setup");
  const homeCorp = await getCorporation(settings["corp.homeCorporationId"]);
  const userCorp = user.main ? await getCorporation(user.main.corporationId) : null;
  const { t } = await getI18n();
  const sidebarCollapsed = isSidebarCollapsed((await cookies()).get(SIDEBAR_COOKIE)?.value);
  const { sections, hasNested } = visibleNav(user);
  const crumbs = sections.flatMap((s) =>
    s.items.map((i) => ({ href: i.href, label: i.label(t), exact: hasNested(i.href), tone: s.tone })),
  );

  return (
    <SidebarProvider collapsed={sidebarCollapsed}>
      <ToastProvider>
        <SectionScope items={crumbs}>
          <Sidebar user={user} corpTicker={userCorp?.ticker ?? null} />
          <div className="section-glow flex min-w-0 flex-1 flex-col">
            <TopBar
              homeCorp={homeCorp}
              serverStatus={settings["eve.serverStatus"]}
              demo={env().KEYSTAR_DEMO_MODE}
              crumbs={crumbs}
            />
            <main className="mx-auto w-full max-w-[1600px] flex-1 px-8 pt-8 pb-16">
              {user.role === "guest" && (
                <div className="glass mb-6 flex items-center gap-3 px-5 py-3.5 text-sm">
                  <Hourglass className="size-4 text-warning" aria-hidden />
                  <span>
                    <span className="font-semibold">{t.shell.awaitingApproval.title}</span>{" "}
                    <span className="text-ink-2">{t.shell.awaitingApproval.body}</span>
                  </span>
                </div>
              )}
              {children}
            </main>
          </div>
        </SectionScope>
      </ToastProvider>
    </SidebarProvider>
  );
}
