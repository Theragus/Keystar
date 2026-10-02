import { Hourglass } from "lucide-react";
import { redirect } from "next/navigation";
import { Sidebar, visibleNav } from "@/components/shell/sidebar";
import { TopBar } from "@/components/shell/topbar";
import { requireUser } from "@/core/auth/dal";
import { getCorporation } from "@/core/corp";
import { env } from "@/core/env";
import { getSettings } from "@/core/settings";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const settings = await getSettings();
  // First start: walk the admin through the few settings that need a decision.
  if (!settings["setup.completedAt"] && user.can("app.settings.manage")) redirect("/setup");
  const homeCorp = await getCorporation(settings["corp.homeCorporationId"]);
  const userCorp = user.main ? await getCorporation(user.main.corporationId) : null;
  const { sections, hasNested } = visibleNav(user);
  const crumbs = sections.flatMap((s) =>
    s.items.map((i) => ({ href: i.href, label: i.label, exact: hasNested(i.href) })),
  );

  return (
    <div className="flex min-h-screen">
      <Sidebar user={user} corpTicker={userCorp?.ticker ?? null} />
      <div className="flex min-w-0 flex-1 flex-col">
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
                <span className="font-semibold">Awaiting approval.</span>{" "}
                <span className="text-ink-2">
                  A director has to approve your account before you can see corporation data. You can already link your
                  characters and grant ESI access.
                </span>
              </span>
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
