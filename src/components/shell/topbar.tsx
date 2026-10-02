import { ChevronsUpDown, Radio } from "lucide-react";
import { CorpLogo } from "@/components/ui/eve-image";
import { isRecent } from "@/lib/format";
import type { Settings } from "@/core/settings";
import { EveClock } from "./eve-clock";
import { CurrentPageCrumb } from "./nav-link";

/** Docked top bar: breadcrumb on the left (corp / page), live EVE status on the right. */
export function TopBar({
  homeCorp,
  serverStatus,
  demo,
  crumbs,
}: {
  homeCorp: { corporationId: number; name: string; ticker: string; memberCount: number | null } | null;
  serverStatus: Settings["eve.serverStatus"];
  demo: boolean;
  crumbs: { href: string; label: string; exact?: boolean }[];
}) {
  const fresh = serverStatus && isRecent(serverStatus.checkedAt, 15 * 60_000);
  return (
    <header className="sticky top-0 z-40 flex h-14 items-center justify-between gap-4 border-b border-white/[0.07] bg-space-950/70 px-6 backdrop-blur-xl">
      <div className="flex min-w-0 items-center gap-2.5 text-[0.84rem]">
        {homeCorp ? (
          <span className="flex min-w-0 items-center gap-2">
            <CorpLogo id={homeCorp.corporationId} size={20} className="rounded" />
            <span className="truncate font-medium text-ink">{homeCorp.name}</span>
            <span className="rounded border border-white/10 px-1.5 py-px font-mono text-3xs text-ink-2">
              {homeCorp.ticker}
            </span>
            <ChevronsUpDown className="size-3.5 text-ink-3" aria-hidden />
          </span>
        ) : (
          <span className="text-ink-3">No home corporation</span>
        )}
        <span className="text-ink-3">/</span>
        <CurrentPageCrumb items={crumbs} />
        {demo && (
          <span className="ml-1 rounded border border-gold/40 bg-gold/10 px-1.5 py-px font-mono text-3xs tracking-wider text-gold uppercase">
            Demo
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <div className="flex h-8 items-center gap-2 rounded-md border border-white/[0.08] bg-white/[0.03] px-3 text-xs">
          <Radio className={fresh ? "size-3.5 text-good-text" : "size-3.5 text-ink-3"} aria-hidden />
          <span className="text-ink-3">Tranquility</span>
          <span className="font-medium tabular-nums text-ink">
            {serverStatus ? `${serverStatus.players.toLocaleString("en-US")} online` : "unknown"}
          </span>
        </div>
        <EveClock />
      </div>
    </header>
  );
}
