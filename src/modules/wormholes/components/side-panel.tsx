"use client";

import { Pin, PinOff, Star, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { useI18n } from "@/i18n/client";
import { spanningTree } from "../layout";
import { LIFE_STATES, MASS_STATES, timeLeft, type LifeState, type MassState } from "../lifetime";
import { connectionLabel } from "../presentation";
import { shortClass, sizeOf, typesForClass, type HoleSize, type StaticFile, type WormholeType } from "../static";
import { connectionSize, LABEL_MAX, type ConnectionPatch, type MapConnection, type MapState, type MapSystem } from "../state";
import { ClassBadge } from "./class-badge";
import type { Selection } from "./map-view";
import { DataCredit, EffectTable, SystemLinks } from "./system-details";

const SIZES: HoleSize[] = ["S", "M", "L", "XL"];

export interface SidePanelProps {
  state: MapState;
  selection: Selection;
  types: Record<string, WormholeType>;
  effects: StaticFile["effects"];
  now: number;
  canEdit: boolean;
  canManage: boolean;
  onSelect: (selection: Selection) => void;
  onLabel: (id: number, label: string | null) => void;
  onPin: (id: number, pinned: boolean) => void;
  onSetHome: (system: MapSystem) => void;
  onRemoveSystem: (system: MapSystem) => void;
  onUpdate: (conn: MapConnection, patch: ConnectionPatch) => void;
  onRemoveConnection: (conn: MapConnection) => void;
}

export function SidePanel(props: SidePanelProps) {
  const { t } = useI18n();
  const { state, selection } = props;
  const system = selection?.kind === "system" ? state.systems.find((s) => s.id === selection.id) : undefined;
  const conn = selection?.kind === "connection" ? state.connections.find((c) => c.id === selection.id) : undefined;
  return (
    <aside className="glass flex min-h-0 flex-col overflow-hidden rounded-[var(--radius-glass)]">
      {system ? (
        <SystemPanel key={system.id} system={system} {...props} />
      ) : conn ? (
        <ConnectionPanel key={conn.id} conn={conn} {...props} />
      ) : (
        <p className="p-5 text-sm leading-relaxed text-ink-3">{t.wormholes.panel.empty}</p>
      )}
    </aside>
  );
}

function PanelHeader({ title, children, onClose }: { title: string; children?: React.ReactNode; onClose: () => void }) {
  const { t } = useI18n();
  return (
    <div className="flex items-start gap-2 border-b border-surface-contrast/6 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="eve-label text-2xs text-ink-3">{title}</div>
        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2">{children}</div>
      </div>
      <button type="button" onClick={onClose} className="rounded-md p-1 text-ink-3 hover:bg-surface-contrast/6 hover:text-ink">
        <X className="size-4" aria-hidden />
        <span className="sr-only">{t.wormholes.panel.close}</span>
      </button>
    </div>
  );
}

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="space-y-2">
    <h3 className="eve-label text-2xs text-ink-3">{title}</h3>
    {children}
  </section>
);

function SystemPanel({
  system,
  state,
  types,
  effects,
  now,
  canEdit,
  canManage,
  onSelect,
  onLabel,
  onPin,
  onSetHome,
  onRemoveSystem,
}: SidePanelProps & { system: MapSystem }) {
  const { t } = useI18n();
  const tw = t.wormholes;
  const [label, setLabel] = useState(system.label ?? "");
  const home = system.id === state.home;
  const connections = state.connections.filter((c) => c.a === system.id || c.b === system.id);
  const nameOf = (id: number) => state.systems.find((s) => s.id === id)?.name ?? String(id);
  return (
    <>
      <PanelHeader title={home ? tw.panel.home : tw.classNames[system.cls]} onClose={() => onSelect(null)}>
        <ClassBadge cls={system.cls} sec={system.sec} />
        <span className="text-base font-semibold text-ink">{system.name}</span>
        {home && <Star className="size-4 fill-gold text-gold" aria-hidden />}
        <span className="w-full text-xs text-ink-3">{system.region}</span>
      </PanelHeader>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
        {system.sec === null && (
          <Section title={tw.lookup.effect}>
            <EffectTable effect={system.effect} cls={system.cls} effects={effects} />
          </Section>
        )}
        {system.statics.length > 0 && (
          <Section title={tw.lookup.statics}>
            <ul className="space-y-1 text-xs">
              {system.statics.map((st) => {
                const type = types[st.code];
                const size = sizeOf(type?.jump ?? null);
                return (
                  <li key={st.code} className="flex items-center gap-2">
                    <span className="w-11 font-mono text-ink">{st.code}</span>
                    {st.dest ? <ClassBadge cls={st.dest} sec={null} /> : null}
                    <span className="ml-auto text-ink-3">
                      {[type?.life ? tw.lookup.hours(type.life) : null, type?.mass ? tw.mt(type.mass) : null, size]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Section>
        )}
        <Section title={tw.panel.connections}>
          {connections.length === 0 ? (
            <p className="text-xs text-ink-3">{tw.panel.noConnections}</p>
          ) : (
            <ul className="space-y-1">
              {connections.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => onSelect({ kind: "connection", id: c.id })}
                    className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-xs hover:bg-surface-contrast/6"
                  >
                    <span className="truncate text-ink">{nameOf(c.a === system.id ? c.b : c.a)}</span>
                    <span className="ml-auto shrink-0 text-2xs font-medium text-ink-2 tabular-nums">{connectionLabel(c, types, now, tw)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Section>
        {canEdit && (
          <Section title={tw.panel.label}>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                onLabel(system.id, label.trim() || null);
              }}
            >
              <input
                value={label}
                maxLength={LABEL_MAX}
                onChange={(e) => setLabel(e.target.value)}
                placeholder={tw.panel.labelPlaceholder}
                className="glass-inset h-8 min-w-0 flex-1 rounded-lg px-2.5 text-sm text-ink placeholder:text-ink-3"
              />
              <Button type="submit" size="sm" disabled={(system.label ?? "") === label.trim()}>
                {tw.panel.save}
              </Button>
            </form>
          </Section>
        )}
        <Section title={tw.lookup.links}>
          <SystemLinks system={system} />
          <Link href={`/wormholes/systems/${encodeURIComponent(system.name)}`} className="block text-xs text-accent hover:underline">
            {tw.panel.lookup}
          </Link>
        </Section>
        <DataCredit />
      </div>
      {(canEdit || (canManage && !home)) && (
        <div className="flex flex-wrap gap-2 border-t border-surface-contrast/6 px-4 py-3">
          {canEdit && (
            <Button size="sm" variant="ghost" onClick={() => onPin(system.id, !system.pinned)} title={tw.panel.pinned}>
              {system.pinned ? <PinOff className="size-3.5" aria-hidden /> : <Pin className="size-3.5" aria-hidden />}
              {system.pinned ? tw.panel.unpin : tw.panel.pin}
            </Button>
          )}
          {/* Choosing home is its own permission (manage), independent of editing. */}
          {canManage && !home && (
            <Button size="sm" variant="ghost" onClick={() => onSetHome(system)}>
              <Star className="size-3.5" aria-hidden />
              {tw.panel.setHome}
            </Button>
          )}
          {canEdit && !home && (
            <Button size="sm" variant="danger" className="ml-auto" onClick={() => onRemoveSystem(system)}>
              <Trash2 className="size-3.5" aria-hidden />
              {tw.panel.remove}
            </Button>
          )}
        </div>
      )}
    </>
  );
}

function ConnectionPanel({
  conn,
  state,
  types,
  now,
  canEdit,
  onSelect,
  onUpdate,
  onRemoveConnection,
}: SidePanelProps & { conn: MapConnection }) {
  const { t, f } = useI18n();
  const tw = t.wormholes;
  const a = state.systems.find((s) => s.id === conn.a);
  const b = state.systems.find((s) => s.id === conn.b);
  if (!a || !b) return null;
  // Unknown type: offer the types that spawn on the side the chain came from.
  const parent = spanningTree(state.systems, state.connections, state.home).parent;
  const typedSide = conn.typeSide ? (conn.typeSide === "b" ? b : a) : parent.get(a.id) === b.id ? b : a;
  const candidates = typesForClass(
    types,
    typedSide.cls,
    typedSide.statics.map((s) => s.code),
  );
  const left = timeLeft(conn.expiresBy, new Date(now));
  const size = connectionSize(conn, types);
  const typeSize = conn.type ? sizeOf(types[conn.type]?.jump ?? null) : null;
  const disabled = !canEdit;

  return (
    <>
      <PanelHeader title={tw.panel.connection} onClose={() => onSelect(null)}>
        {[a, b].map((s, i) => (
          <span key={s.id} className="flex items-center gap-1.5">
            {i === 1 && <span className="text-ink-3">↔</span>}
            <button type="button" onClick={() => onSelect({ kind: "system", id: s.id })} className="flex items-center gap-1.5">
              <ClassBadge cls={s.cls} sec={s.sec} />
              <span className="text-sm font-semibold text-ink hover:text-accent">{s.name}</span>
            </button>
          </span>
        ))}
      </PanelHeader>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
        <Section title={tw.panel.type}>
          <select
            value={conn.type ?? ""}
            disabled={disabled}
            onChange={(e) => onUpdate(conn, { type: e.target.value || null, typeOn: typedSide.id })}
            className="glass-inset h-9 w-full rounded-lg px-2.5 font-mono text-sm text-ink"
          >
            <option value="">{tw.panel.unknownType}</option>
            {candidates.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} → {shortClass(c.dest)}
                {typedSide.statics.some((s) => s.code === c.code) ? ` (${tw.panel.staticMark})` : ""}
              </option>
            ))}
            {conn.type && !candidates.some((c) => c.code === conn.type) && <option value={conn.type}>{conn.type}</option>}
          </select>
          {conn.type && (
            <>
              <div className="text-2xs text-ink-3">{tw.panel.signatureSide}</div>
              <Segmented
                size="sm"
                label={tw.panel.signatureSide}
                value={String(typedSide.id)}
                options={[a, b].map((s) => ({ value: String(s.id), label: s.name }))}
                onChange={(v) => !disabled && onUpdate(conn, { typeOn: Number(v) })}
              />
              <p className="text-2xs text-ink-3">{tw.panel.signatureSideNote}</p>
            </>
          )}
        </Section>
        <Section title={tw.panel.lifetime}>
          <Segmented<LifeState>
            size="sm"
            label={tw.panel.lifetime}
            value={conn.life}
            options={LIFE_STATES.map((s) => ({ value: s, label: tw.lifeShort[s], title: tw.life[s] }))}
            onChange={(v) => !disabled && onUpdate(conn, { life: v })}
          />
          <p className="text-xs text-ink-2">
            {tw.panel.timeLeft}:{" "}
            <span className="text-ink">
              {left > 0 ? tw.panel.atMost(tw.duration(Math.floor(left / 60_000))) : tw.panel.expired}
            </span>
          </p>
        </Section>
        <Section title={tw.panel.mass}>
          <Segmented<MassState>
            size="sm"
            label={tw.panel.mass}
            value={conn.mass}
            options={MASS_STATES.map((s) => ({ value: s, label: tw.mass[s] }))}
            onChange={(v) => !disabled && onUpdate(conn, { mass: v })}
          />
        </Section>
        <Section title={tw.panel.size}>
          <select
            value={conn.size ?? ""}
            disabled={disabled}
            onChange={(e) => onUpdate(conn, { size: (e.target.value || null) as HoleSize | null })}
            className="glass-inset h-9 w-full rounded-lg px-2.5 text-sm text-ink"
          >
            <option value="">
              {tw.panel.sizeAuto}
              {typeSize ? `: ${typeSize} · ${tw.sizes[typeSize]}` : ""}
            </option>
            {SIZES.map((s) => (
              <option key={s} value={s}>
                {s} · {tw.sizes[s]}
              </option>
            ))}
          </select>
          {size && !conn.size && !typeSize && <p className="text-2xs text-ink-3">{tw.sizes[size]}</p>}
        </Section>
        <div className="space-y-1 text-2xs text-ink-3">
          <div>
            {tw.panel.firstSeen}: {f.relativeTime(conn.firstSeenAt, new Date(now))}
          </div>
          {conn.updatedByName && <div>{tw.panel.updatedBy(conn.updatedByName, f.relativeTime(conn.updatedAt, new Date(now)))}</div>}
        </div>
      </div>
      {canEdit && (
        <div className="flex border-t border-surface-contrast/6 px-4 py-3">
          <Button size="sm" variant="danger" className="ml-auto" onClick={() => onRemoveConnection(conn)}>
            <Trash2 className="size-3.5" aria-hidden />
            {tw.panel.removeConnection}
          </Button>
        </div>
      )}
    </>
  );
}
