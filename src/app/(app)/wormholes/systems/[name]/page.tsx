import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/shell/page-header";
import { Panel } from "@/components/ui/glass";
import { requirePermission } from "@/core/auth/dal";
import { getI18n } from "@/i18n/server";
import { ClassBadge } from "@/modules/wormholes/components/class-badge";
import { LookupSearch } from "@/modules/wormholes/components/lookup-search";
import { DataCredit, EffectTable, SystemLinks, TypesTable } from "@/modules/wormholes/components/system-details";
import { WH_PERMISSIONS } from "@/modules/wormholes/module";
import { EFFECT_POWER, isWormholeSpace } from "@/modules/wormholes/static";
import { WH } from "@/modules/wormholes/static-data";

export async function generateMetadata({ params }: PageProps<"/wormholes/systems/[name]">) {
  const { name } = await params;
  const { t } = await getI18n();
  const system = WH.byName(decodeURIComponent(name));
  return { title: system ? `${system.name} · ${t.wormholes.lookup.metaTitle}` : t.wormholes.lookup.metaTitle };
}

export default async function SystemPage({ params }: PageProps<"/wormholes/systems/[name]">) {
  await requirePermission(WH_PERMISSIONS.view);
  const { name } = await params;
  const wanted = decodeURIComponent(name);
  const system = WH.byName(wanted);
  if (!system) notFound();
  if (system.name !== wanted) redirect(`/wormholes/systems/${encodeURIComponent(system.name)}`);

  const { t, f } = await getI18n();
  const tw = t.wormholes;
  const tl = tw.lookup;
  const wspace = isWormholeSpace(system.cls);
  const possible = WH.typesFor(system.cls, system.statics)
    .filter((type) => !system.statics.includes(type.code))
    .map((type) => type.code);
  const strength = EFFECT_POWER[system.cls];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={tl.title}
        title={system.name}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <ClassBadge cls={system.cls} sec={system.sec} />
            <span>{tw.classNames[system.cls]}</span>
            <span className="text-ink-3">·</span>
            <span>{system.region}</span>
            {system.sec !== null && (
              <>
                <span className="text-ink-3">·</span>
                <span>
                  {tl.security} {f.number(system.sec, 2)}
                </span>
              </>
            )}
          </span>
        }
        actions={<LookupSearch />}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          {wspace ? (
            <Panel title={tl.statics}>
              <TypesTable codes={system.statics} staticCodes={system.statics} types={WH.types} />
            </Panel>
          ) : (
            <Panel title={tl.statics}>
              <p className="text-sm text-ink-2">{tl.kspaceNote}</p>
            </Panel>
          )}
          <Panel title={tl.possibleTypes} subtitle={tl.possibleTypesNote}>
            <TypesTable codes={possible} types={WH.types} />
          </Panel>
        </div>
        <div className="space-y-6">
          {wspace && (
            <Panel title={tl.effect} subtitle={strength ? tl.effectNote(strength) : undefined}>
              <EffectTable effect={system.effect} cls={system.cls} effects={WH.effects} />
            </Panel>
          )}
          <Panel title={tl.links}>
            <div className="space-y-4">
              <SystemLinks system={system} />
              <DataCredit />
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
