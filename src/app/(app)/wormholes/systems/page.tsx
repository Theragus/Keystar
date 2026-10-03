import { PageHeader } from "@/components/shell/page-header";
import { Panel } from "@/components/ui/glass";
import { requirePermission } from "@/core/auth/dal";
import { getI18n } from "@/i18n/server";
import { LookupSearch } from "@/modules/wormholes/components/lookup-search";
import { DataCredit } from "@/modules/wormholes/components/system-details";
import { WH_PERMISSIONS } from "@/modules/wormholes/module";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t.wormholes.lookup.metaTitle };
}

export default async function SystemLookupPage() {
  await requirePermission(WH_PERMISSIONS.view);
  const { t } = await getI18n();
  const tl = t.wormholes.lookup;
  return (
    <div className="space-y-6">
      <PageHeader eyebrow={t.wormholes.page.eyebrow} title={tl.title} description={tl.description} />
      <Panel>
        <div className="space-y-4 pt-5">
          <LookupSearch autoFocus />
          <DataCredit />
        </div>
      </Panel>
    </div>
  );
}
