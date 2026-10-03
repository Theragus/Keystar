"use client";

import { ChevronDown, ChevronsDownUp, ChevronsUpDown } from "lucide-react";
import { createContext, useContext, useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Portrait, TypeIcon } from "@/components/ui/eve-image";
import { usePendingNavigation } from "@/components/ui/pending";
import { SecurityStatus } from "@/components/ui/security";
import { Segmented } from "@/components/ui/segmented";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { oreClassColor } from "../class-colors";
import { miningQueryString, type LedgerGroup, type LedgerGrouping, type MiningFilters } from "../filters";
import type { LedgerDayGroup, LedgerSubgroup } from "../ledger-groups";
import type { LedgerRow, LedgerTotals } from "../queries";
import { GroupByToggle } from "./group-toggle";

/**
 * The mining ledger table: days, optional groups within each day, and their
 * rows, all collapsible.
 *
 * Day state is "all collapsed or not" plus the days toggled against that, so
 * "Collapse all" also holds for days on the next page. Groups start expanded.
 */
interface CollapseState {
  allDaysCollapsed: boolean;
  toggled: ReadonlySet<string>;
}

interface CollapseContextValue {
  isCollapsed(id: string, isDay: boolean): boolean;
  toggle(id: string): void;
  setAllDays(collapsed: boolean): void;
}

const CollapseContext = createContext<CollapseContextValue | null>(null);

function useCollapse(): CollapseContextValue {
  const ctx = useContext(CollapseContext);
  if (!ctx) throw new Error("Ledger table parts must be inside LedgerCollapseProvider");
  return ctx;
}

export function LedgerCollapseProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CollapseState>({ allDaysCollapsed: false, toggled: new Set() });
  const value: CollapseContextValue = {
    isCollapsed: (id, isDay) => (isDay && state.allDaysCollapsed) !== state.toggled.has(id),
    toggle: (id) =>
      setState((s) => {
        const toggled = new Set(s.toggled);
        if (!toggled.delete(id)) toggled.add(id);
        return { ...s, toggled };
      }),
    setAllDays: (collapsed) => setState({ allDaysCollapsed: collapsed, toggled: new Set() }),
  };
  return <CollapseContext value={value}>{children}</CollapseContext>;
}

export function LedgerCollapseAll({ dates }: { dates: string[] }) {
  const { t } = useI18n();
  const { isCollapsed, setAllDays } = useCollapse();
  const everyCollapsed = dates.length > 0 && dates.every((d) => isCollapsed(d, true));
  const Icon = everyCollapsed ? ChevronsUpDown : ChevronsDownUp;
  return (
    <button
      type="button"
      onClick={() => setAllDays(!everyCollapsed)}
      className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-ink-3 transition hover:bg-white/6 hover:text-ink"
    >
      <Icon className="size-3.5" aria-hidden />
      {everyCollapsed ? t.mining.ledger.expandAll : t.mining.ledger.collapseAll}
    </button>
  );
}

/** Second-level grouping, plus the Pilots / Characters switch when grouping by members of the corporation. */
export function LedgerGroupControls({ filters, grouping, corpScope }: { filters: MiningFilters; grouping: LedgerGrouping; corpScope: boolean }) {
  const { t } = useI18n();
  const { navigate } = usePendingNavigation();
  const g = t.mining.ledger.groupBy;
  const value: LedgerGroup = grouping === "pilot" || grouping === "character" ? "member" : grouping;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Segmented<LedgerGroup>
        size="sm"
        label={g.label}
        value={value}
        onChange={(ledgerGroup) => navigate(miningQueryString(filters, { ledgerGroup, page: 1 }))}
        options={[
          { value: "none", label: g.none },
          { value: "member", label: corpScope ? g.members : g.characters },
          { value: "system", label: g.systems },
        ]}
      />
      {corpScope && value === "member" && <GroupByToggle filters={filters} />}
    </div>
  );
}

const COLUMNS = 8;
/** Descriptive columns (character, ore, location, source) that a group header's label spans. */
const LABEL_SPAN = 4;

export function LedgerTable({ days, grouping }: { days: LedgerDayGroup[]; grouping: LedgerGrouping }) {
  const { t } = useI18n();
  const col = t.mining.columns;
  return (
    <table className="ks-table">
      <thead>
        <tr>
          <th>{col.character}</th>
          <th>{col.ore}</th>
          <th>{col.location}</th>
          <th>{col.source}</th>
          <th className="num">{col.units}</th>
          <th className="num">{col.volume}</th>
          <th className="num">{col.unitPrice}</th>
          <th className="num">{col.value}</th>
        </tr>
      </thead>
      {days.length === 0 && (
        <tbody>
          <tr>
            <td colSpan={COLUMNS} className="py-10 text-center text-ink-3">
              {t.mining.ledger.empty}
            </td>
          </tr>
        </tbody>
      )}
      {days.map((day) => (
        <Day key={day.date} day={day} grouping={grouping} />
      ))}
    </table>
  );
}

function Day({ day, grouping }: { day: LedgerDayGroup; grouping: LedgerGrouping }) {
  const { t, f } = useI18n();
  const l = t.mining.ledger;
  const { isCollapsed } = useCollapse();
  const collapsed = isCollapsed(day.date, true);
  return (
    <tbody>
      <HeaderRow
        id={day.date}
        isDay
        className="ks-group-row"
        totals={day.totals}
        label={
          <span className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <span className="font-semibold text-ink tabular-nums">{day.date}</span>
            <span className="text-ink-2">{f.weekday(day.date)}</span>
            <Meta text={l.dayMeta(day.totals.entries, day.totals.characters)} shown={day.rows.length} totals={day.totals} />
          </span>
        }
      />
      {day.groups
        ? day.groups.map((group) => (
            <Group key={group.key} date={day.date} group={group} grouping={grouping} hidden={collapsed} />
          ))
        : day.rows.map((r, i) => <Row key={rowKey(r, i)} row={r} hidden={collapsed} />)}
    </tbody>
  );
}

function Group({
  date,
  group,
  grouping,
  hidden,
}: {
  date: string;
  group: LedgerSubgroup;
  grouping: LedgerGrouping;
  hidden: boolean;
}) {
  const { t } = useI18n();
  const l = t.mining.ledger;
  const { isCollapsed } = useCollapse();
  const id = `${date}|${group.key}`;
  const collapsed = isCollapsed(id, false);
  const first = group.rows[0];
  const meta =
    grouping === "character" ? l.groupEntries(group.totals.entries) : l.dayMeta(group.totals.entries, group.totals.characters);
  return (
    <>
      <HeaderRow
        id={id}
        className="ks-subgroup-row"
        hidden={hidden}
        totals={group.totals}
        label={
          <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5">
            <GroupName row={first} grouping={grouping} />
            <Meta text={meta} shown={group.rows.length} totals={group.totals} />
          </span>
        }
      />
      {group.rows.map((r, i) => (
        <Row key={rowKey(r, i)} row={r} hidden={hidden || collapsed} />
      ))}
    </>
  );
}

/** What a group is: the pilot (named after their main), the character or the system. */
function GroupName({ row, grouping }: { row: LedgerRow; grouping: LedgerGrouping }) {
  const { t } = useI18n();
  if (grouping === "system") {
    return (
      <span className="flex items-center gap-2">
        <SecurityStatus value={row.security} />
        <span className="font-medium text-ink">{row.systemName ?? t.mining.ledger.unknownSystem}</span>
      </span>
    );
  }
  const pilot = grouping === "pilot";
  return (
    <span className="flex items-center gap-2">
      <Portrait id={pilot ? (row.mainCharacterId ?? row.characterId) : row.characterId} size={20} />
      <span className="font-medium text-ink">{pilot ? (row.ownerName ?? row.characterName) : row.characterName}</span>
    </span>
  );
}

function Meta({ text, shown, totals }: { text: string; shown: number; totals: LedgerTotals }) {
  const { t } = useI18n();
  return (
    <span className="text-xs text-ink-3">
      {text}
      {shown < totals.entries && ` · ${t.mining.ledger.dayPartial(shown, totals.entries)}`}
    </span>
  );
}

/**
 * A day or group header: the label spans the descriptive columns, followed by
 * the totals. The whole row is a click target for the mouse; the button is the
 * keyboard and screen-reader control.
 */
function HeaderRow({
  id,
  isDay = false,
  className,
  hidden = false,
  label,
  totals,
}: {
  id: string;
  isDay?: boolean;
  className: string;
  hidden?: boolean;
  label: ReactNode;
  totals: LedgerTotals;
}) {
  const { f } = useI18n();
  const { isCollapsed, toggle } = useCollapse();
  const collapsed = isCollapsed(id, isDay);
  return (
    <tr className={cn(className, "cursor-pointer")} data-hidden={hidden || undefined} onClick={() => toggle(id)}>
      <th scope={isDay ? "rowgroup" : "row"} colSpan={LABEL_SPAN}>
        <button
          type="button"
          aria-expanded={!collapsed}
          tabIndex={hidden ? -1 : undefined}
          onClick={(e) => {
            e.stopPropagation();
            toggle(id);
          }}
          className="flex w-full items-center gap-2 rounded text-left"
        >
          <ChevronDown
            className={cn("size-4 shrink-0 text-ink-3 transition-transform", collapsed && "-rotate-90")}
            aria-hidden
          />
          {label}
        </button>
      </th>
      <td className="num">{f.integer(totals.quantity)}</td>
      <td className="num">{f.volume(totals.volume, { compact: false })}</td>
      <td />
      <td className="num">
        <span className="font-semibold text-ink">{f.isk(totals.value)}</span>
      </td>
    </tr>
  );
}

const rowKey = (r: LedgerRow, i: number) => `${r.characterId}-${r.typeId}-${r.systemId}-${r.source}-${i}`;

/**
 * One ledger entry. Hidden rows stay in the table, flattened and invisible (see
 * `.ks-table tr[data-hidden]`), so they keep sizing the columns: dropping them
 * would reflow every column when everything is collapsed.
 */
function Row({ row: r, hidden }: { row: LedgerRow; hidden: boolean }) {
  const { t, f } = useI18n();
  const l = t.mining.ledger;
  return (
    <tr data-hidden={hidden || undefined}>
      <td>
        <div className="flex items-center gap-2.5">
          <Portrait id={r.characterId} size={26} />
          <div className="min-w-0 leading-tight">
            <div className="truncate font-medium">{r.characterName}</div>
            {r.ownerName && r.ownerName !== r.characterName && (
              <div className="truncate text-2xs text-ink-3">{r.ownerName}</div>
            )}
          </div>
        </div>
      </td>
      <td>
        <div className="flex items-center gap-2.5">
          <TypeIcon id={r.typeId} size={24} />
          <div className="leading-tight">
            <div className="font-medium">{r.typeName}</div>
            <div className="flex items-center gap-1 text-2xs text-ink-3">
              <span className="size-1.5 rounded-full" style={{ background: oreClassColor(r.oreClass) }} aria-hidden />
              {t.eve.oreClasses[r.oreClass].short}
            </div>
          </div>
        </div>
      </td>
      <td>
        <div className="flex items-center gap-2">
          <SecurityStatus value={r.security} />
          <div className="leading-tight">
            <div>{r.systemName ?? l.unknownSystem}</div>
            {r.observerName && <div className="text-2xs text-ink-3">{r.observerName}</div>}
          </div>
        </div>
      </td>
      <td>
        <Badge tone={r.source === "observer" ? "accent" : "neutral"}>{l.sourceBadge[r.source]}</Badge>
      </td>
      <td className="num">{f.integer(r.quantity)}</td>
      <td className="num">{f.volume(r.volume, { compact: false })}</td>
      <td className="num text-ink-2">{r.unitPrice ? f.unitPrice(r.unitPrice) : "—"}</td>
      <td className="num font-semibold">{f.isk(r.value)}</td>
    </tr>
  );
}
