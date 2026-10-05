import { Waypoints } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Panel } from "@/components/ui/glass";
import { requirePermission } from "@/core/auth/dal";
import { getDb } from "@/core/db";
import { getI18n } from "@/i18n/server";
import { HomePicker } from "@/modules/wormholes/components/home-picker";
import { MapShell } from "@/modules/wormholes/components/map-shell";
import { getCorpMap, loadMapState } from "@/modules/wormholes/maps";
import { WH_PERMISSIONS } from "@/modules/wormholes/module";
import { WH } from "@/modules/wormholes/static-data";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t.wormholes.page.metaTitle };
}

export default async function ChainMapPage() {
  const user = await requirePermission(WH_PERMISSIONS.view);
  const { t } = await getI18n();
  const tp = t.wormholes.page;
  const db = getDb();
  const map = await getCorpMap(db);
  const canManage = user.can(WH_PERMISSIONS.manage);

  if (map.homeSystemId === null) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow={tp.eyebrow} title={tp.title} description={tp.description} />
        <Panel>
          <EmptyState icon={Waypoints} title={tp.noHomeTitle} action={canManage ? <HomePicker /> : undefined}>
            {canManage ? tp.noHomeManage : tp.noHomeAsk}
          </EmptyState>
        </Panel>
      </div>
    );
  }

  const state = await loadMapState(db, map.id);
  return (
    // Fills the viewport below the top bar: 3.5rem top bar + the shell's pt-8 and pb-16 (src/app/(app)/layout.tsx).
    <div className="flex h-[calc(100dvh-9.5rem)] min-h-[600px] flex-col gap-4">
      <PageHeader eyebrow={tp.eyebrow} title={tp.title} description={tp.description} />
      <MapShell
        initial={state}
        types={WH.types}
        effects={WH.effects}
        canEdit={user.can(WH_PERMISSIONS.edit)}
        canManage={canManage}
      />
    </div>
  );
}
