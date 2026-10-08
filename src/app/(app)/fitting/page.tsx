import { Settings2 } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { ButtonLink } from "@/components/ui/button";
import { requirePermission } from "@/core/auth/dal";
import { getI18n } from "@/i18n/server";
import { FittingEditor } from "@/modules/fitting/components/fitting-editor";
import { FITTING_MANAGE_HREF, FITTING_PERMISSIONS } from "@/modules/fitting/module";
import { getEsiFittings, getSkillSources } from "@/modules/fitting/queries";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t.fitting.metaTitle.tool };
}

/**
 * The fitting tool. The page only gathers what the server knows (the viewer's characters, which share their skills,
 * and their in-game saved fittings); the editor itself runs in the browser with the engine and static data it loads.
 */
export default async function FittingPage() {
  const user = await requirePermission(FITTING_PERMISSIONS.use);
  const { t } = await getI18n();
  const s = t.fitting;
  const [characters, esiFittings] = await Promise.all([
    getSkillSources(user.characters.map((c) => ({ characterId: c.characterId, name: c.name }))),
    getEsiFittings(user.characterIds),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={s.module.navSection}
        title={s.metaTitle.tool}
        description={s.page.description}
        actions={
          <ButtonLink href={FITTING_MANAGE_HREF} size="sm">
            <Settings2 className="size-3.5" aria-hidden /> {s.page.settings}
          </ButtonLink>
        }
      />
      <FittingEditor characters={characters} esiFittings={esiFittings} />
    </div>
  );
}
