import { PageHeader } from "@/components/shell/page-header";
import { requirePermission } from "@/core/auth/dal";
import { VALUATION_SOURCES } from "@/core/eve/prices";
import { getSetting } from "@/core/settings";
import { FieldEstimator } from "@/modules/mining/estimator/field-estimator";
import { MINING_PERMISSIONS } from "@/modules/mining/module";

export const metadata = { title: "Ore field estimator" };

export default async function EstimatorPage() {
  await requirePermission(MINING_PERMISSIONS.viewOwn, MINING_PERMISSIONS.viewCorp);
  const source = await getSetting("mining.valuationSource");
  const label = VALUATION_SOURCES.find((s) => s.value === source)?.label ?? source;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Industry"
        title="Ore Field Estimator"
        description="Paste a survey scanner result to value a belt or moon chunk, grouped by ore and grade."
      />
      <FieldEstimator valuationLabel={label} />
    </div>
  );
}
