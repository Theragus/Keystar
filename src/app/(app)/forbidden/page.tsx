import { ShieldX } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Glass } from "@/components/ui/glass";
import { getI18n } from "@/i18n/server";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t.common.forbidden.metaTitle };
}

export default async function ForbiddenPage() {
  const { t } = await getI18n();
  return (
    <Glass className="mx-auto mt-10 max-w-xl">
      <EmptyState
        icon={ShieldX}
        title={t.common.forbidden.title}
        action={<ButtonLink href="/">{t.common.forbidden.back}</ButtonLink>}
      >
        {t.common.forbidden.body}
      </EmptyState>
    </Glass>
  );
}
