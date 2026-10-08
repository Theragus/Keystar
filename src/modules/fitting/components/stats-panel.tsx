"use client";

import type { DamageProfile } from "@eveshipfit/dogma-engine";
import type { ReactNode } from "react";
import { Glass } from "@/components/ui/glass";
import { Segmented } from "@/components/ui/segmented";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { DAMAGE_TYPES, type DamageType, type FitStats, type Layer, type SensorType } from "../engine/stats";
import type { FitIconName } from "../icons";
import { FitIcon } from "./fit-icon";
import { formatDuration } from "./shared";

/*
 * The numbers, in the shape pilots know from the game and from EVEShip.fit: a bar per section with its headline
 * value on the right, then compact icon-and-value cells in two columns. The icons carry the meaning; every cell
 * names itself in its tooltip.
 */

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

/*
 * EVE's own damage-type colours (EM blue, thermal red, kinetic grey, explosive orange) and meta colours are used
 * on purpose in this module instead of the colour-vision-safe chart palette (`src/modules/mining/class-colors.ts`):
 * pilots read them from the game, and every cell is labelled by its icon too.
 */
const DAMAGE_COLOR: Record<DamageType, string> = { em: "#3d7bf2", thermal: "#e5403f", kinetic: "#a7adb8", explosive: "#f0a030" };
const DAMAGE_ICON: Record<DamageType, FitIconName> = { em: "resistEm", thermal: "resistThermal", kinetic: "resistKinetic", explosive: "resistExplosive" };
const SENSOR_ICON: Record<SensorType, FitIconName> = {
  radar: "sensorRadar",
  ladar: "sensorLadar",
  magnetometric: "sensorMagnetometric",
  gravimetric: "sensorGravimetric",
};

/** A section's title bar with its headline value. */
function Bar({ title, value, tone }: { title: string; value: ReactNode; tone?: "good" | "critical" }) {
  return (
    <div className="glass-inset flex items-center justify-between gap-3 rounded px-2.5 py-1 text-sm">
      <span className="text-ink-2">{title}</span>
      <span className={cn("tabular font-medium", tone === "good" ? "text-good-text" : tone === "critical" ? "text-critical-text" : "text-ink")}>{value}</span>
    </div>
  );
}

/** Icon and value, named by its tooltip. */
function Cell({ icon, value, hint, title, lines }: { icon: FitIconName; value: string; hint?: string; title: string; lines?: [string, string] }) {
  return (
    <div className="flex min-w-0 items-center gap-2 text-[13px]" title={title}>
      <FitIcon name={icon} size={20} />
      {lines ? (
        <span className="tabular leading-tight">
          <span className="block text-ink">{lines[0]}</span>
          <span className="block text-2xs text-ink-3">{lines[1]}</span>
        </span>
      ) : (
        <span className="tabular whitespace-nowrap text-ink">
          {value}
          {hint && <span className="ml-1 text-2xs text-ink-3">{hint}</span>}
        </span>
      )}
    </div>
  );
}

function ResistCells({ layer }: { layer: Layer }) {
  return (
    <div className="grid grid-cols-4 gap-1">
      {DAMAGE_TYPES.map((d) => (
        <div key={d} className="glass-inset relative h-6 overflow-hidden rounded" title={d}>
          <div className="absolute inset-y-0 left-0 opacity-75" style={{ width: `${Math.round(layer.resists[d] * 100)}%`, background: DAMAGE_COLOR[d] }} />
          <span className="tabular relative block text-center text-xs leading-6 text-ink">{Math.round(layer.resists[d] * 100)} %</span>
        </div>
      ))}
    </div>
  );
}

/** Defence, offence, capacitor, targeting, navigation and drones, with the incoming-damage profile. */
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

  if (!stats) {
    return (
      <Glass className="space-y-2 p-3">
        <h2 className="eve-label text-xs text-ink-2">{s.title}</h2>
        <p className="text-xs text-ink-3">–</p>
      </Glass>
    );
  }

  const cap = stats.capacitor;
  const d = stats.defence;
  const showDrones = stats.resources.droneBay.total > 0 || stats.resources.droneBandwidth.used > 0;

  return (
    <Glass className="space-y-3 p-3">
      <section className="space-y-1.5">
        <Bar
          title={s.capacitor.title}
          value={cap.stablePercent !== null ? s.capacitor.stableShort : s.capacitor.depletes(formatDuration(cap.depletesIn ?? 0, f))}
          tone={cap.stablePercent !== null ? "good" : "critical"}
        />
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 px-1">
          <Cell icon="capacitor" value={`${n1(cap.capacity)} ${u.gj}`} hint={`/ ${formatDuration(cap.rechargeTime, f)}`} title={`${s.capacitor.capacity} / ${s.capacitor.rechargeTime}`} />
          <Cell
            icon="capacitor"
            value={`Δ ${cap.peakDelta >= 0 ? "+" : ""}${n1(cap.peakDelta)} ${u.gjPerSecond}`}
            hint={cap.stablePercent !== null ? `(${f.percent(cap.stablePercent / 100, 1)})` : undefined}
            title={s.capacitor.delta}
          />
        </div>
      </section>

      <section className="space-y-1.5">
        <Bar title={s.offence.title} value={`${n1(stats.offence.totalDps)} dps`} />
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 px-1">
          <Cell icon="offence" value={`${n1(stats.offence.dps)} dps`} hint={`(${n1(stats.offence.dpsNoReload)} dps)`} title={s.offence.withReload} />
          <Cell icon="volley" value={`${n0(stats.offence.volley)} ${u.hp}`} title={s.offence.volley} />
          {stats.offence.droneDps > 0 && <Cell icon="droneDps" value={`${n1(stats.offence.droneDps)} dps`} title={s.offence.droneDps} />}
          {stats.offence.fighterDps > 0 && <Cell icon="fighterDps" value={`${n1(stats.offence.fighterDps)} dps`} title={s.offence.fighterDps} />}
        </div>
      </section>

      <section className="space-y-1.5">
        <Bar title={s.defence.title} value={`${n0(d.ehp)} ehp`} />
        <div className="flex items-baseline justify-between px-1 text-2xs text-ink-3">
          <span>{s.defence.rawHp}</span>
          <span className="tabular">{n0(d.rawHp)} {u.hp}</span>
        </div>
        <div className="grid grid-cols-[1fr_minmax(0,1.3fr)] items-center gap-x-3 gap-y-1.5 px-1">
          <Cell icon="passiveRecharge" value={`${n1(d.passiveRecharge)} ${u.hpPerSecond}`} title={s.defence.passiveRecharge} />
          <div className="grid grid-cols-4 gap-1">
            {DAMAGE_TYPES.map((dt) => (
              <div key={dt} className="grid place-items-center" title={s.defence.resists[dt]}>
                <FitIcon name={DAMAGE_ICON[dt]} size={18} />
              </div>
            ))}
          </div>
          <Cell icon="shield" value="" title={`${s.defence.shield} ${u.hp} / ${s.defence.shieldRecharge}`} lines={[`${n0(d.shield.hp)} ${u.hp}`, formatDuration(d.shieldRechargeTime, f)]} />
          <ResistCells layer={d.shield} />
          <Cell icon="armor" value={`${n0(d.armor.hp)} ${u.hp}`} title={s.defence.armor} />
          <ResistCells layer={d.armor} />
          <Cell icon="structure" value={`${n0(d.hull.hp)} ${u.hp}`} title={s.defence.hull} />
          <ResistCells layer={d.hull} />
        </div>
        {(d.shieldBoost > 0 || d.armorRepair > 0 || d.hullRepair > 0) && (
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 px-1">
            {d.shieldBoost > 0 && <Cell icon="shieldBoost" value={`${n1(d.shieldBoost)} ${u.hpPerSecond}`} hint={`(${n1(d.effective.shieldBoost)})`} title={`${s.defence.shieldBoost} (${s.defence.effective})`} />}
            {d.armorRepair > 0 && <Cell icon="armorRepair" value={`${n1(d.armorRepair)} ${u.hpPerSecond}`} hint={`(${n1(d.effective.armorRepair)})`} title={`${s.defence.armorRepair} (${s.defence.effective})`} />}
            {d.hullRepair > 0 && <Cell icon="hullRepair" value={`${n1(d.hullRepair)} ${u.hpPerSecond}`} hint={`(${n1(d.effective.hullRepair)})`} title={`${s.defence.hullRepair} (${s.defence.effective})`} />}
          </div>
        )}
        <div className="px-1 pt-0.5">
          <Segmented
            size="sm"
            label={s.damageProfile.label}
            value={preset === "custom" ? "uniform" : preset}
            onChange={(p) => onProfile(PRESETS[p])}
            options={(["uniform", "em", "thermal", "kinetic", "explosive"] as const).map((p) => ({ value: p, label: s.damageProfile[p] }))}
          />
        </div>
      </section>

      <section className="space-y-1.5">
        <Bar title={s.targeting.title} value={`${f.number(stats.targeting.maxTargetRange / 1000, 2)} ${u.km}`} />
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 px-1">
          <Cell
            icon={stats.targeting.sensorType ? SENSOR_ICON[stats.targeting.sensorType] : "sensorStrength"}
            value={`${n1(stats.targeting.sensorStrength)} points`}
            title={`${s.targeting.sensor}${stats.targeting.sensorType ? ` (${s.targeting.sensors[stats.targeting.sensorType]})` : ""}`}
          />
          <Cell icon="scanResolution" value={`${n0(stats.targeting.scanResolution)} ${u.mm}`} title={s.targeting.scanRes} />
          <Cell icon="signature" value={`${n0(stats.navigation.signatureRadius)} m`} title={s.navigation.signature} />
          <Cell icon="maxTargets" value={`${n0(stats.targeting.maxLockedTargets)}x`} title={s.targeting.maxTargets} />
        </div>
      </section>

      <section className="space-y-1.5">
        <Bar title={s.navigation.title} value={`${n1(stats.navigation.maxVelocity)} ${u.metersPerSecond}`} />
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 px-1">
          <Cell icon="mass" value={`${f.integer(Math.round(stats.navigation.mass / 1000))} ${u.tonnes}`} title={s.navigation.mass} />
          <Cell icon="inertia" value={`${f.number(stats.navigation.inertia, 4)}x`} title={s.navigation.inertia} />
          <Cell icon="warpSpeed" value={`${f.number(stats.navigation.warpSpeed, 2)} ${u.au}`} title={s.navigation.warpSpeed} />
          <Cell icon="alignTime" value={`${f.number(stats.navigation.alignTime, 2)}${u.seconds}`} title={s.navigation.alignTime} />
        </div>
      </section>

      {showDrones && (
        <section className="space-y-1.5">
          <Bar title={s.drones.title} value={`${n1(stats.offence.droneDps)} dps`} />
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 px-1">
            <Cell
              icon="droneBandwidth"
              value={`${n0(stats.resources.droneBandwidth.used)}/${n0(stats.resources.droneBandwidth.total)} ${u.mbit}`}
              title={s.drones.bandwidth}
            />
            <Cell icon="droneRange" value={`${f.number(stats.drones.controlRange / 1000, 2)} ${u.km}`} title={s.drones.range} />
            <Cell icon="drones" value={s.drones.active(Math.round(stats.resources.drones.used))} hint={`/ ${n0(stats.resources.drones.total)}`} title={s.resources.drones} />
          </div>
        </section>
      )}
    </Glass>
  );
}
