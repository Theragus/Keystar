import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { Panel } from "@/components/ui/glass";
import { requirePermission } from "@/core/auth/dal";
import { appraisals, getDb } from "@/core/db";
import { compact, relativeTime } from "@/lib/format";
import { AppraisalForm } from "@/modules/trade/components/appraisal-form";
import { TRADE_PERMISSIONS } from "@/modules/trade/module";
import type { AppraisalItem, AppraisalTotals } from "@/modules/trade/appraisal/types";
import { createAppraisal } from "./actions";

export const metadata = { title: "Appraisal" };

export default async function AppraisalPage() {
  const user = await requirePermission(TRADE_PERMISSIONS.appraisal);
  const recent = await getDb()
    .select({ id: appraisals.id, createdAt: appraisals.createdAt, totals: appraisals.totals, items: appraisals.items })
    .from(appraisals)
    .where(eq(appraisals.createdBy, user.id))
    .orderBy(desc(appraisals.createdAt))
    .limit(12);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Trade"
        title="Appraisal"
        description="Value cargo, contracts, fittings, d-scans or item lists at Jita 4-4 prices and share the result with a link."
      />
      <div className="grid items-start gap-4 xl:grid-cols-12">
        <Panel title="Paste items" className="xl:col-span-8">
          <AppraisalForm action={createAppraisal} />
        </Panel>
        <Panel title="Your recent appraisals" className="xl:col-span-4">
          {recent.length ? (
            <ul className="divide-y divide-white/6">
              {recent.map((a) => {
                const totals = a.totals as AppraisalTotals;
                const items = a.items as AppraisalItem[];
                return (
                  <li key={a.id}>
                    <Link href={`/trade/appraisal/${a.id}`} className="flex items-center gap-3 py-2.5 hover:text-accent">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">
                          {items.slice(0, 2).map((i) => i.name).join(", ")}
                          {items.length > 2 ? ` +${items.length - 2}` : ""}
                        </div>
                        <div className="text-xs text-ink-3">{relativeTime(a.createdAt)}</div>
                      </div>
                      <div className="text-right text-sm font-semibold tabular-nums">{compact(totals.sell)}</div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-ink-3">Nothing appraised yet.</p>
          )}
        </Panel>
      </div>
    </div>
  );
}
