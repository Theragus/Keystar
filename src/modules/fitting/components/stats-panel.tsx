"use client";

import type { DamageProfile } from "@eveshipfit/dogma-engine";
import type { ReactNode } from "react";
import { Glass } from "@/components/ui/glass";
import { Segmented } from "@/components/ui/segmented";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { DAMAGE_TYPES, type FitStats, type Layer } from "../engine/stats";
import { formatDuration } from "./shared";

type Preset = "uniform" | "em" | "thermal" | "kinetic" | "explosive" | "custom";

const PRESETS: Record<Exclude<Preset, "custom">, DamageProfile> = {
  uniform: { em: 0.25, thermal: 0.25, kinetic: 0.25, explosive: 0.25 },
  em: { em: 1, thermal: 0, kinetic: 0, explosive: 0 },
  thermal: { em: 0, thermal: 1, kinetic: 0, explosive: 0 },
  kinetic: { em: 0, thermal: 0, kinetic: 1, explosive: 0 },
  explosive: { em: 0, thermal: 0, kinetic: 0, explosive: 1 },
};

function presetOf(profile: DamageProfile | undefined): Preset {
  if (!profile) return "uniform";
  for (const [key, p] of Object.entries(PRESETS) as [Exclude<Preset, "custom">, DamageProfile][]) {
    if (DAMAGE_TYPES.every((d) => Math.abs((profile[d] ?? 0) - (p[d] ?? 0)) < 1e-6)) return key;
  }
  return "custom";
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-1">
      <h3 className="eve-label text-2xs text-ink-3">{title}</h3>
      <dl className="space-y-0.5">{children}</dl>
    </section>
  );
}

function Row({ label, value, hint, strong }: { label: string; value: string; hint?: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <dt className="truncate text-ink-2">{label}</dt>
      <dd className={cn("tabular whitespace-nowrap", strong ? "font-semibold text-ink" : "text-ink")}>
        {value}
        {hint && <span className="ml-1 text-2xs text-ink-3">{hint}</span>}
      </dd>
    </div>
  );
}

/*
 * EVE's own damage-type colours (EM blue, thermal red, kinetic grey, explosive orange), as pilots know them from
 * the game and every fitting tool. By decision for this module they are not drawn from the colour-vision-safe
 * chart palette (`src/modules/mining/class-colors.ts`): the columns stay labelled, so the hue is a cue, not the
 * only carrier of meaning.
 */
const DAMAGE_COLOR: Record<(typeof DAMAGE_TYPES)[number], string> = {
  em: "#3d7bf2",
  thermal: "#e5403f",
  kinetic: "#a7adb8",
  explosive: "#f0a030",
};

function Resists({ layer, label, f }: { layer: Layer; label: string; f: (v: number) => string }) {
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 text-sm">
      <div className="text-ink-2">{label}</div>
      <div className="tabular text-right text-ink">{f(layer.hp)}</div>
      <div className="col-span-2 grid grid-cols-4 gap-1">
        {DAMAGE_TYPES.map((d) => (
          <div key={d} className="glass-inset relative h-5 overflow-hidden rounded" title={d}>
            <div
              className="absolute inset-y-0 left-0 opacity-70"
              style={{ width: `${Math.round(layer.resists[d] * 100)}%`, background: DAMAGE_COLOR[d] }}
            />
            <span className="tabular relative block text-center text-2xs leading-5 text-ink">{Math.round(layer.resists[d] * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ResistHeader({ labels }: { labels: Record<(typeof DAMAGE_TYPES)[number], string> }) {
  return (
    <div className="grid grid-cols-4 gap-1 text-center text-2xs">
      {DAMAGE_TYPES.map((d) => (
        <span key={d} style={{ color: DAMAGE_COLOR[d] }}>
          {labels[d]}
        </span>
      ))}
    </div>
  );
}

/** The numbers: defence, offence, capacitor, navigation and targeting, with the incoming-damage profile. */
export function StatsPanel({
  stats,
  profile,
  onProfile,
}: {
  stats: FitStats | null;
  profile: DamageProfile | undefined;
  onProfile: (profile: DamageProfile) => void;
}) {
  const { t, f } = useI18n();
  const s = t.fitting.stats;
  const u = s.units;
  const n1 = (v: number) => f.number(v, 1);
  const n0 = (v: number) => f.integer(Math.round(v));
  const preset = presetOf(profile);

  return (
    <Glass className="space-y-4 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="eve-label text-xs text-ink-2">{s.title}</h2>
      </div>
      {!stats ? (
        <p className="text-xs text-ink-3">–</p>
      ) : (
        <>
          <Section title={s.defence.title}>
            <Row label={s.defence.ehp} value={`${n0(stats.defence.ehp)} ${u.hp}`} strong />
            <div className="space-y-2 pt-1">
              <ResistHeader labels={s.defence.resists} />
              <Resists layer={stats.defence.shield} label={`${s.defence.shield} · ${n0(stats.defence.shield.ehp)} ${s.defence.ehpShort}`} f={n0} />
              <Resists layer={stats.defence.armor} label={`${s.defence.armor} · ${n0(stats.defence.armor.ehp)} ${s.defence.ehpShort}`} f={n0} />
              <Resists layer={stats.defence.hull} label={`${s.defence.hull} · ${n0(stats.defence.hull.ehp)} ${s.defence.ehpShort}`} f={n0} />
            </div>
            <div className="pt-1">
              {stats.defence.shieldBoost > 0 && (
                <Row label={s.defence.shieldBoost} value={`${n1(stats.defence.shieldBoost)} ${u.hpPerSecond}`} hint={`${n1(stats.defence.effective.shieldBoost)} ${s.defence.effective}`} />
              )}
              {stats.defence.armorRepair > 0 && (
                <Row label={s.defence.armorRepair} value={`${n1(stats.defence.armorRepair)} ${u.hpPerSecond}`} hint={`${n1(stats.defence.effective.armorRepair)} ${s.defence.effective}`} />
              )}
              {stats.defence.hullRepair > 0 && (
                <Row label={s.defence.hullRepair} value={`${n1(stats.defence.hullRepair)} ${u.hpPerSecond}`} hint={`${n1(stats.defence.effective.hullRepair)} ${s.defence.effective}`} />
              )}
              <Row label={s.defence.passiveRecharge} value={`${n1(stats.defence.passiveRecharge)} ${u.hpPerSecond}`} hint={`${n1(stats.defence.effective.passiveRecharge)} ${s.defence.effective}`} />
              <Row label={s.defence.shieldRecharge} value={formatDuration(stats.defence.shieldRechargeTime, f)} />
            </div>
          </Section>

          <div className="space-y-1">
            <div className="eve-label text-2xs text-ink-3">{s.damageProfile.label}</div>
            <Segmented
              size="sm"
              label={s.damageProfile.label}
              value={preset === "custom" ? "uniform" : preset}
              onChange={(p) => onProfile(PRESETS[p])}
              options={(["uniform", "em", "thermal", "kinetic", "explosive"] as const).map((p) => ({ value: p, label: s.damageProfile[p] }))}
            />
          </div>

          <Section title={s.offence.title}>
            <Row label={s.offence.total} value={`${n1(stats.offence.totalDps)} DPS`} strong />
            <Row label={s.offence.dps} value={`${n1(stats.offence.dps)} DPS`} hint={`${n1(stats.offence.dpsNoReload)} ${s.offence.dpsNoReload}`} />
            <Row label={s.offence.volley} value={`${n1(stats.offence.volley)} ${u.hp}`} />
            {stats.offence.droneDps > 0 && <Row label={s.offence.droneDps} value={`${n1(stats.offence.droneDps)} DPS`} />}
            {stats.offence.fighterDps > 0 && <Row label={s.offence.fighterDps} value={`${n1(stats.offence.fighterDps)} DPS`} />}
          </Section>

          <Section title={s.capacitor.title}>
            <Row
              label={s.capacitor.capacity}
              value={`${n0(stats.capacitor.capacity)} ${u.gj}`}
              hint={formatDuration(stats.capacitor.rechargeTime, f)}
            />
            <Row
              label={
                stats.capacitor.stablePercent !== null
                  ? s.capacitor.stable(f.percent(stats.capacitor.stablePercent / 100, 0))
                  : s.capacitor.depletes(formatDuration(stats.capacitor.depletesIn ?? 0, f))
              }
              value={`${stats.capacitor.peakDelta >= 0 ? "+" : ""}${n1(stats.capacitor.peakDelta)} ${u.gjPerSecond}`}
              strong
            />
            <Row label={s.capacitor.peakLoad} value={`${n1(stats.capacitor.peakLoad)} ${u.gjPerSecond}`} hint={`${s.capacitor.peakRecharge} ${n1(stats.capacitor.peakRecharge)}`} />
          </Section>

          <Section title={s.navigation.title}>
            <Row label={s.navigation.maxVelocity} value={`${n0(stats.navigation.maxVelocity)} ${u.metersPerSecond}`} strong />
            <Row label={s.navigation.alignTime} value={`${f.number(stats.navigation.alignTime, 2)} ${u.seconds}`} />
            <Row label={s.navigation.warpSpeed} value={`${f.number(stats.navigation.warpSpeed, 2)} ${u.au}`} />
            <Row label={s.navigation.signature} value={`${n0(stats.navigation.signatureRadius)} m`} />
            <Row label={s.navigation.mass} value={`${f.compact(stats.navigation.mass)} ${u.kg}`} hint={`${f.number(stats.navigation.inertia, 3)}x`} />
          </Section>

          <Section title={s.targeting.title}>
            <Row label={s.targeting.range} value={`${f.number(stats.targeting.maxTargetRange / 1000, 1)} ${u.km}`} />
            <Row label={s.targeting.scanRes} value={`${n0(stats.targeting.scanResolution)} ${u.mm}`} />
            <Row label={s.targeting.maxTargets} value={n0(stats.targeting.maxLockedTargets)} />
            <Row
              label={s.targeting.sensor}
              value={n1(stats.targeting.sensorStrength)}
              hint={stats.targeting.sensorType ? s.targeting.sensors[stats.targeting.sensorType] : undefined}
            />
          </Section>
        </>
      )}
    </Glass>
  );
}
