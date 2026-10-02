import { eq } from "drizzle-orm";
import { ArrowLeft, TriangleAlert } from "lucide-react";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shell/page-header";
import { ButtonLink } from "@/components/ui/button";
import { CopyField } from "@/components/ui/copy-button";
import { Glass, Panel } from "@/components/ui/glass";
import { StatTile } from "@/components/ui/stat-tile";
import { requirePermission } from "@/core/auth/dal";
import { appraisals, getDb } from "@/core/db";
import { env } from "@/core/env";
import { compact, dateTime, integer } from "@/lib/format";
import { SortableTable, type Column, type EntityRow } from "@/components/ui/sortable-table";
import { AppraisalForm } from "@/modules/trade/components/appraisal-form";
import { TRADE_PERMISSIONS } from "@/modules/trade/module";
import { splitPrice, type AppraisalItem, type AppraisalTotals, type UnparsedLine } from "@/modules/trade/appraisal/types";
import { createAppraisal } from "../actions";

export const metadata = { title: "Appraisal" };

const COLUMNS: Column[] = [
  { key: "quantity", label: "Qty", format: "int" },
  { key: "buy", label: "Buy / unit", format: "unitIsk" },
  { key: "sell", label: "Sell / unit", format: "unitIsk" },
  { key: "totalBuy", label: "Buy total", format: "isk" },
  { key: "totalSell", label: "Sell total", format: "isk" },
  { key: "volume", label: "Volume", format: "m3" },
];

const full = (v: number) => `${Math.round(v).toLocaleString("en-US")} ISK`;

export default async function AppraisalResultPage({ params }: PageProps<"/trade/appraisal/[id]">) {
  await requirePermission(TRADE_PERMISSIONS.appraisal);
  const { id } = await params;
  if (!/^[A-Za-z0-9]{6,20}$/.test(id)) notFound();
  const [row] = await getDb().select().from(appraisals).where(eq(appraisals.id, id));
  if (!row) notFound();

  const items = row.items as AppraisalItem[];
  const totals = row.totals as AppraisalTotals;
  const unparsed = row.unparsed as UnparsedLine[];
  const pct = row.pricePercent;

  const rows: EntityRow[] = items.map((i) => ({
    id: i.typeId,
    name: i.name,
    image: "type",
    href: `https://everef.net/types/${i.typeId}`,
    values: {
      quantity: i.quantity,
      buy: i.buy,
      sell: i.sell,
      totalBuy: i.buy === null ? null : i.buy * i.quantity,
      totalSell: i.sell === null ? null : i.sell * i.quantity,
      split: splitPrice(i),
      volume: i.volume * i.quantity,
    },
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Trade"
        title="Appraisal"
        description={`Jita 4-4 prices from ${dateTime(row.createdAt)}${row.createdByName ? ` · by ${row.createdByName}` : ""}`}
        actions={
          <ButtonLink href="/trade/appraisal" size="sm">
            <ArrowLeft className="size-4" aria-hidden /> New appraisal
          </ButtonLink>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Jita sell" value={compact(totals.sell)} unit="ISK" hint={full(totals.sell)} />
        <StatTile label="Jita buy" value={compact(totals.buy)} unit="ISK" hint={full(totals.buy)} />
        <StatTile label="Split" value={compact(totals.split)} unit="ISK" hint={full(totals.split)} />
        <StatTile
          label="Volume"
          value={compact(totals.volume)}
          unit="m³"
          hint={`${integer(totals.types)} types · ${integer(totals.quantity)} items`}
        />
      </div>

      {pct !== 100 && (
        <Glass className="flex flex-wrap items-baseline gap-x-6 gap-y-2 px-5 py-4">
          <div className="eve-label text-[0.66rem] text-gold">{pct}% of Jita</div>
          <div className="text-sm text-ink-2">
            Buy <span className="ml-1 font-semibold text-ink tabular-nums">{full((totals.buy * pct) / 100)}</span>
          </div>
          <div className="text-sm text-ink-2">
            Split <span className="ml-1 font-semibold text-ink tabular-nums">{full((totals.split * pct) / 100)}</span>
          </div>
          <div className="text-sm text-ink-2">
            Sell <span className="ml-1 font-semibold text-ink tabular-nums">{full((totals.sell * pct) / 100)}</span>
          </div>
        </Glass>
      )}

      <Panel title="Share" subtitle="Anyone signed in to Keystar with appraisal access can open this link.">
        <CopyField value={`${env().APP_URL}/trade/appraisal/${row.id}`} />
      </Panel>

      <Panel
        title="Items"
        subtitle={totals.unpriced ? `${totals.unpriced} item types have no Jita price and count as 0.` : "Sorted by Jita sell value"}
      >
        <SortableTable entityLabel="Item" columns={COLUMNS} rows={rows} defaultSort="totalSell" initialRows={50} />
      </Panel>

      {unparsed.length > 0 && (
        <Panel title={`Not recognised (${unparsed.length})`} subtitle="These lines didn't match an item name and were skipped.">
          <ul className="space-y-1 font-mono text-xs text-ink-2">
            {unparsed.slice(0, 200).map((u) => (
              <li key={u.line} className="flex gap-3">
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
                <span className="w-10 shrink-0 text-right text-ink-3">{u.line}</span>
                <span className="break-all">{u.raw}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel title="Appraise again" subtitle="Same input at today's prices, as a new appraisal.">
        <AppraisalForm action={createAppraisal} defaultInput={row.input} defaultPercent={pct} />
      </Panel>
    </div>
  );
}
