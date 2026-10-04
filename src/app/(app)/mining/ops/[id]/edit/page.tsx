import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/shell/page-header";
import { requirePermission } from "@/core/auth/dal";
import { getSettings } from "@/core/settings";
import { getI18n } from "@/i18n/server";
import { SHARE_ID_PATTERN } from "@/lib/share-id";
import { MINING_PERMISSIONS } from "@/modules/mining/module";
import { OpForm } from "@/modules/mining/ops/components/op-form";
import { opFormOptions, opFormValues } from "@/modules/mining/ops/form-data";
import { getOp } from "@/modules/mining/ops/queries";
import { saveOp } from "../../actions";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t.ops.form.titleEdit };
}

export default async function EditOpPage({ params }: PageProps<"/mining/ops/[id]/edit">) {
  await requirePermission(MINING_PERMISSIONS.manageOps);
  const { id } = await params;
  if (!SHARE_ID_PATTERN.test(id)) notFound();
  const settings = await getSettings();
  const op = await getOp(id);
  if (!op || op.corporationId !== settings["corp.homeCorporationId"]) notFound();
  if (op.finalizedAt) redirect(`/mining/ops/${id}`);
  const { t, f } = await getI18n();
  const [{ fleetOptions, eventOptions }, values] = await Promise.all([opFormOptions(t, f, op.corporationId), opFormValues(op)]);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={t.mining.module.nav.ops} title={t.ops.form.titleEdit} description={t.ops.form.description} />
      <OpForm action={saveOp} values={values} fleets={fleetOptions} events={eventOptions} cancelHref={`/mining/ops/${id}`} />
    </div>
  );
}
