"use client";

import { ExternalLink } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { effectModifiers, sizeOf, type ClassKey, type StaticFile, type SystemSummary, type WormholeType } from "../static";
import { ClassBadge } from "./class-badge";

/** System effect modifiers at this class's strength. Modifier names are EVE data (English). */
export function EffectTable({
  effect,
  cls,
  effects,
}: {
  effect: string | null;
  cls: ClassKey;
  effects: StaticFile["effects"];
}) {
  const { t } = useI18n();
  const rows = effectModifiers(effects, effect, cls);
  if (!effect || !rows.length) return <p className="text-sm text-ink-3">{t.wormholes.lookup.noEffect}</p>;
  return (
    <div>
      <div className="mb-2 text-sm font-medium text-ink">{effect}</div>
      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-xs">
        {rows.map((r) => (
          <div key={r.name} className="contents">
            <dt className="text-ink-2">{r.name}</dt>
            <dd className="text-right font-mono tabular-nums text-ink">{r.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Wormhole types with destination, lifetime, mass and largest ship. */
export function TypesTable({
  codes,
  types,
  staticCodes,
}: {
  codes: string[];
  types: Record<string, WormholeType>;
  /** Codes to mark as statics. */
  staticCodes?: readonly string[];
}) {
  const { t } = useI18n();
  const tl = t.wormholes.lookup;
  if (!codes.length) return <p className="text-sm text-ink-3">{tl.noStatics}</p>;
  const statics = new Set(staticCodes ?? []);
  return (
    <div className="-mx-1 overflow-x-auto">
      <table className="ks-table">
        <thead>
          <tr>
            <th>{tl.type}</th>
            <th>{tl.destination}</th>
            <th className="num">{tl.lifetime}</th>
            <th className="num">{tl.totalMass}</th>
            <th className="num">{tl.jumpMass}</th>
            <th>{tl.size}</th>
          </tr>
        </thead>
        <tbody>
          {codes.map((code) => {
            const type = types[code];
            const size = sizeOf(type?.jump ?? null);
            return (
              <tr key={code}>
                <td className="font-mono text-ink">
                  {code}
                  {statics.has(code) && <span className="ml-2 text-3xs text-ink-3">{t.wormholes.panel.staticMark}</span>}
                </td>
                <td>{type?.dest ? <ClassBadge cls={type.dest} sec={null} /> : "—"}</td>
                <td className="num">{type?.life ? tl.hours(type.life) : "—"}</td>
                <td className="num">{type?.mass ? t.wormholes.mt(type.mass) : "—"}</td>
                <td className="num">{type?.jump ? t.wormholes.mt(type.jump) : "—"}</td>
                <td className="text-ink-2" title={size ? t.wormholes.sizes[size] : undefined}>
                  {size ? `${size} · ${t.wormholes.sizes[size]}` : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function systemLinks(system: Pick<SystemSummary, "id" | "name" | "cls">) {
  const dotlanName = system.name.replace(/ /g, "_");
  const links = [
    { label: "DOTLAN", href: `https://evemaps.dotlan.net/system/${encodeURIComponent(dotlanName)}` },
    { label: "zKillboard", href: `https://zkillboard.com/system/${system.id}/` },
  ];
  if (/^J\d{6}$/.test(system.name) || system.cls === "thera" || system.cls === "c13") {
    links.unshift({ label: "anoik.is", href: `https://anoik.is/systems/${encodeURIComponent(system.name)}` });
  }
  return links;
}

/** Links to the usual third-party pages for a system. */
export function SystemLinks({ system }: { system: Pick<SystemSummary, "id" | "name" | "cls"> }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-wrap gap-2">
      {systemLinks(system).map((l) => (
        <a
          key={l.label}
          href={l.href}
          target="_blank"
          rel="noopener noreferrer"
          className="glass-chip inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs text-ink-2 hover:text-ink"
        >
          {l.label}
          <ExternalLink className="size-3" aria-hidden />
          <span className="sr-only">{t.common.opensInNewTab}</span>
        </a>
      ))}
    </div>
  );
}

/** Data credits shown wherever wormhole data appears. */
export function DataCredit() {
  const { t } = useI18n();
  return (
    <p className="text-2xs text-ink-3">
      <a href="https://anoik.is/" target="_blank" rel="noopener noreferrer" className="hover:text-ink-2">
        {t.wormholes.credit}
      </a>
      {" · "}
      {t.wormholes.creditSde}
    </p>
  );
}
