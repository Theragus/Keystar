import { PageHeader } from "@/components/shell/page-header";
import { requirePermission } from "@/core/auth/dal";
import { getSetting } from "@/core/settings";
import { getI18n } from "@/i18n/server";
import { FieldEstimator } from "@/modules/mining/estimator/field-estimator";
import { MINING_PERMISSIONS } from "@/modules/mining/module";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t.mining.estimator.metaTitle };
}

export default async function EstimatorPage() {
  await requirePermission(MINING_PERMISSIONS.viewOwn, MINING_PERMISSIONS.viewCorp);
  const { t } = await getI18n();
  const source = await getSetting("mining.valuationSource");

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t.mining.module.navSection}
        title={t.mining.estimator.title}
        description={t.mining.estimator.description}
      />
      <FieldEstimator valuationLabel={t.eve.valuationSources[source]} />
    </div>
  );
}
