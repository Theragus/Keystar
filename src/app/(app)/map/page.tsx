import { PageHeader } from "@/components/shell/page-header";
import { requirePermission } from "@/core/auth/dal";
import { getI18n } from "@/i18n/server";
import { UniverseMap } from "@/modules/map/universe-map";
export async function generateMetadata() { const { t } = await getI18n(); return { title: t.map.title }; }
export default async function MapPage() {
 await requirePermission("map.view");
 const { t } = await getI18n();
 return <div className="space-y-5"><PageHeader eyebrow={t.killboard.module.navSection} title={t.map.title} description={t.map.description}/><UniverseMap/></div>;
}
