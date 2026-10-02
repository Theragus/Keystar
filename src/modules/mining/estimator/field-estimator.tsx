"use client";

import { ChevronDown, ChevronRight, ClipboardPaste, Eraser, Loader2, TriangleAlert } from "lucide-react";
import { Fragment, useEffect, useMemo, useState, useTransition } from "react";
import { TypeIcon } from "@/components/ui/eve-image";
import { Glass, Panel } from "@/components/ui/glass";
import { compact, integer, isk, percent, unitPrice } from "@/lib/format";
import { cn } from "@/lib/utils";
import { priceSurveyTypes, type SurveyPrice } from "./actions";
import { parseSurveyScan, summariseSurvey } from "./parse";

const EXAMPLE = `Scordite III-Grade	41.648	6.247 m3	787.000,00 ISK	21 km
Scordite III-Grade	49.146	7.371 m3	928.000,00 ISK	21 km
Scordite II-Grade	61.604	9.240 m3	1.110.000,00 ISK	15 km
Scordite II-Grade	70.246	10.536 m3	1.260.000,00 ISK	21 km
Scordite	74.748	11.212 m3	1.270.000,00 ISK	21 km
Scordite	75.468	11.320 m3	1.290.000,00 ISK	14 km
Veldspar III-Grade	133.506	13.350 m3	1.430.000,00 ISK	26 km
Veldspar III-Grade	135.830	13.583 m3	1.460.000,00 ISK	31 km
Veldspar II-Grade	147.552	14.755 m3	1.500.000,00 ISK	33 km
Veldspar	185.200	18.520 m3	1.840.000,00 ISK	19 km
Veldspar	180.364	18.036 m3	1.790.000,00 ISK	32 km
Plagioclase III-Grade	50.050	17.517 m3	1.440.000,00 ISK	18 km
Plagioclase II-Grade	64.304	22.506 m3	1.770.000,00 ISK	29 km
Plagioclase	73.736	25.807 m3	2.050.000,00 ISK	16 km
Pyroxeres III-Grade	24.530	7.359 m3	630.000,00 ISK	28 km
Pyroxeres II-Grade	28.264	8.479 m3	643.000,00 ISK	22 km
Pyroxeres	29.504	8.851 m3	669.000,00 ISK	18 km`;

function NumberField({
  label,
  value,
  onChange,
  placeholder,
  suffix,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  suffix: string;
}) {
  return (
    <label className="block min-w-0 flex-1">
      <span className="eve-label text-2xs text-ink-3">{label}</span>
      <span className="glass-inset mt-1.5 flex h-9 items-center rounded-lg pr-3">
        <input
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="h-full min-w-0 flex-1 bg-transparent px-3 text-sm text-ink outline-none placeholder:text-ink-3"
        />
        <span className="text-xs text-ink-3">{suffix}</span>
      </span>
    </label>
  );
}

export function FieldEstimator({ valuationLabel }: { valuationLabel: string }) {
  const [text, setText] = useState("");
  const [maxDistance, setMaxDistance] = useState("");
  const [fleetYield, setFleetYield] = useState("");
  const [prices, setPrices] = useState<Record<string, SurveyPrice>>({});
  const [priceError, setPriceError] = useState<string | null>(null);
  const [pricing, startPricing] = useTransition();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const parsed = useMemo(() => parseSurveyScan(text), [text]);
  const maxKm = Number(maxDistance.replace(",", "."));
  const rocks = useMemo(
    () =>
      maxDistance && Number.isFinite(maxKm)
        ? parsed.rocks.filter((r) => r.distanceKm === null || r.distanceKm <= maxKm)
        : parsed.rocks,
    [parsed.rocks, maxDistance, maxKm],
  );
  const summary = useMemo(() => summariseSurvey(rocks), [rocks]);
  const namesKey = useMemo(() => [...new Set(parsed.rocks.map((r) => r.name))].sort().join("\n"), [parsed.rocks]);

  useEffect(() => {
    if (!namesKey) return;
    const names = namesKey.split("\n").filter((n) => !prices[n.toLowerCase()]);
    if (!names.length) return;
    const t = setTimeout(() => {
      startPricing(async () => {
        try {
          const result = await priceSurveyTypes(names);
          setPrices((p) => ({ ...p, ...result }));
          setPriceError(null);
        } catch {
          setPriceError("Could not load Keystar prices — showing scanner values only.");
        }
      });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only when the set of ore names changes
  }, [namesKey]);

  const priceOf = (name: string) => prices[name.toLowerCase()]?.unitPrice ?? null;
  const keystarValue = (name: string, quantity: number) => {
    const p = priceOf(name);
    return p === null ? null : p * quantity;
  };

  const totals = summary.reduce(
    (t, ore) => {
      t.rocks += ore.rocks;
      t.volume += ore.volume;
      t.scanner += ore.scannerValue;
      for (const g of ore.grades) {
        const v = keystarValue(g.name, g.quantity);
        if (v === null) t.unpriced += 1;
        else t.keystar += v;
      }
      return t;
    },
    { rocks: 0, volume: 0, scanner: 0, keystar: 0, unpriced: 0 },
  );
  const yieldPerHour = Number(fleetYield.replace(/[.,\s]/g, ""));
  const hoursToClear = yieldPerHour > 0 ? totals.volume / yieldPerHour : null;
  const shareBase = totals.keystar || totals.scanner;

  const toggle = (base: string) =>
    setCollapsed((c) => {
      const n = new Set(c);
      if (n.has(base)) n.delete(base);
      else n.add(base);
      return n;
    });

  return (
    <div className="grid gap-4 xl:grid-cols-12">
      <Panel
        className="xl:col-span-4"
        title="Survey scan"
        subtitle="Survey scanner → select all → copy, then paste here"
        actions={
          <>
            <button
              type="button"
              onClick={() => setText(EXAMPLE)}
              className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-ink-3 hover:bg-white/6 hover:text-ink"
            >
              <ClipboardPaste className="size-3.5" aria-hidden /> Example
            </button>
            <button
              type="button"
              onClick={() => setText("")}
              className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-ink-3 hover:bg-white/6 hover:text-ink"
            >
              <Eraser className="size-3.5" aria-hidden /> Clear
            </button>
          </>
        }
      >
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
          placeholder={"Scordite III-Grade\t8.904\t1.335 m3\t168.000,00 ISK\t25 km\n…"}
          className="glass-inset h-[360px] w-full resize-y rounded-lg p-3 font-mono text-2xs leading-relaxed whitespace-pre text-ink outline-none placeholder:text-ink-3"
          aria-label="Survey scanner result"
        />
        {parsed.skipped.length > 0 && (
          <p className="mt-2 flex items-start gap-1.5 text-xs text-warning">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            Skipped {parsed.skipped.length} line{parsed.skipped.length > 1 ? "s" : ""} that didn&apos;t look like asteroids
            (line {parsed.skipped.slice(0, 3).map((s) => s.line).join(", ")}
            {parsed.skipped.length > 3 ? ", …" : ""}).
          </p>
        )}
        <div className="mt-4 flex gap-3">
          <NumberField label="Max distance" value={maxDistance} onChange={setMaxDistance} placeholder="any" suffix="km" />
          <NumberField label="Fleet yield" value={fleetYield} onChange={setFleetYield} placeholder="e.g. 60000" suffix="m³/h" />
        </div>
      </Panel>

      <div className="min-w-0 space-y-4 xl:col-span-8">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Glass className="px-5 py-4">
            <div className="eve-label text-2xs text-ink-3">Keystar value</div>
            <div className="mt-2 text-2xl font-semibold">
              {compact(totals.keystar)}
              <span className="ml-1 text-sm text-ink-2">ISK</span>
            </div>
            <div className="mt-1 truncate text-2xs text-ink-3" title={valuationLabel}>
              {pricing ? (
                <span className="inline-flex items-center gap-1">
                  <Loader2 className="size-3 animate-spin" aria-hidden /> pricing…
                </span>
              ) : totals.unpriced ? (
                `${totals.unpriced} type(s) unpriced`
              ) : (
                valuationLabel
              )}
            </div>
          </Glass>
          <Glass className="px-5 py-4">
            <div className="eve-label text-2xs text-ink-3">Scanner estimate</div>
            <div className="mt-2 text-2xl font-semibold">
              {compact(totals.scanner)}
              <span className="ml-1 text-sm text-ink-2">ISK</span>
            </div>
            <div className="mt-1 text-2xs text-ink-3">EVE average price</div>
          </Glass>
          <Glass className="px-5 py-4">
            <div className="eve-label text-2xs text-ink-3">Volume</div>
            <div className="mt-2 text-2xl font-semibold">
              {compact(totals.volume)}
              <span className="ml-1 text-sm text-ink-2">m³</span>
            </div>
            <div className="mt-1 text-2xs text-ink-3">
              {totals.volume ? `${unitPrice((totals.keystar || totals.scanner) / totals.volume)} per m³` : "—"}
            </div>
          </Glass>
          <Glass className="px-5 py-4">
            <div className="eve-label text-2xs text-ink-3">{hoursToClear !== null ? "Time to clear" : "Asteroids"}</div>
            <div className="mt-2 text-2xl font-semibold">
              {hoursToClear !== null
                ? `${Math.floor(hoursToClear)}h ${Math.round((hoursToClear % 1) * 60)}m`
                : integer(totals.rocks)}
            </div>
            <div className="mt-1 text-2xs text-ink-3">
              {hoursToClear !== null ? `${integer(totals.rocks)} asteroids` : `${summary.length} ore types`}
            </div>
          </Glass>
        </div>

        {priceError && (
          <p className="flex items-center gap-1.5 text-xs text-warning">
            <TriangleAlert className="size-3.5" aria-hidden /> {priceError}
          </p>
        )}

        <Glass className="overflow-hidden">
          {summary.length === 0 ? (
            <div className="px-6 py-16 text-center text-sm text-ink-3">
              Paste a survey scan to see the field broken down by ore and grade.
            </div>
          ) : (
            <div className="overflow-x-auto px-2 py-2">
              <table className="ks-table">
                <thead>
                  <tr>
                    <th>Ore</th>
                    <th className="num">Rocks</th>
                    <th className="num">Units</th>
                    <th className="num">Volume</th>
                    <th className="num">Unit price</th>
                    <th className="num">Scanner</th>
                    <th className="num">Keystar</th>
                    <th className="w-[120px]">Share</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.map((ore) => {
                    const open = !collapsed.has(ore.base);
                    const oreValue = ore.grades.reduce((s, g) => s + (keystarValue(g.name, g.quantity) ?? 0), 0);
                    const shareValue = totals.keystar ? oreValue : ore.scannerValue;
                    const iconId = prices[ore.grades[0].name.toLowerCase()]?.typeId;
                    return (
                      <Fragment key={ore.base}>
                        <tr className="cursor-pointer" onClick={() => toggle(ore.base)}>
                          <td>
                            <div className="flex items-center gap-2 whitespace-nowrap">
                              {open ? (
                                <ChevronDown className="size-4 text-ink-3" aria-hidden />
                              ) : (
                                <ChevronRight className="size-4 text-ink-3" aria-hidden />
                              )}
                              {iconId ? <TypeIcon id={iconId} size={24} /> : <span className="size-6" />}
                              <span className="font-semibold">{ore.base}</span>
                              <span className="text-xs text-ink-3">{ore.grades.length} grade{ore.grades.length > 1 ? "s" : ""}</span>
                            </div>
                          </td>
                          <td className="num">{ore.rocks}</td>
                          <td className="num">{integer(ore.quantity)}</td>
                          <td className="num">{integer(ore.volume)} m³</td>
                          <td className="num text-ink-3">—</td>
                          <td className="num">{isk(ore.scannerValue)}</td>
                          <td className="num font-semibold">{oreValue ? isk(oreValue) : "—"}</td>
                          <td>
                            <ShareBar value={shareBase ? shareValue / shareBase : 0} />
                          </td>
                        </tr>
                        {open &&
                          ore.grades.map((g) => {
                            const v = keystarValue(g.name, g.quantity);
                            const p = priceOf(g.name);
                            return (
                              <tr key={g.name} className="text-ink-2">
                                <td>
                                  <div className="flex items-center gap-2 pl-9 whitespace-nowrap" title={g.name}>
                                    <span className="rounded border border-white/10 px-1.5 py-px font-mono text-3xs text-ink-2">
                                      {g.grade}
                                    </span>
                                    {g.minDistanceKm !== null && (
                                      <span className="text-2xs text-ink-3">closest {g.minDistanceKm} km</span>
                                    )}
                                  </div>
                                </td>
                                <td className="num">{g.rocks}</td>
                                <td className="num">{integer(g.quantity)}</td>
                                <td className="num">{integer(g.volume)} m³</td>
                                <td className="num">{p !== null ? unitPrice(p) : pricing ? "…" : "—"}</td>
                                <td className="num">{isk(g.scannerValue)}</td>
                                <td className="num">{v !== null ? isk(v) : "—"}</td>
                                <td>
                                  <ShareBar value={shareBase ? (totals.keystar ? (v ?? 0) : g.scannerValue) / shareBase : 0} subtle />
                                </td>
                              </tr>
                            );
                          })}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Glass>
      </div>
    </div>
  );
}

function ShareBar({ value, subtle }: { value: number; subtle?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 rounded-full bg-white/5">
        <div
          className={cn("h-full rounded-full", subtle ? "bg-accent/45" : "bg-accent")}
          style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }}
        />
      </div>
      <span className="w-10 text-right text-2xs text-ink-3 tabular-nums">{percent(value, 0)}</span>
    </div>
  );
}
