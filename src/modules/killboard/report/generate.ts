import { and, desc, eq } from "drizzle-orm";
import { getCorporation } from "@/core/corp";
import { getDb, killboardReports, type Db } from "@/core/db";
import { env } from "@/core/env";
import { createLogger } from "@/core/logger";
import { reportWindow, type DateRange } from "../filters";
import { claudeReport } from "./claude";
import { buildReportFacts } from "./facts";
import { templateReport } from "./template";
import type { ReportFacts, SituationReport, StoredReport } from "./types";

const log = createLogger("killboard-report");

export interface WrittenReport {
  report: SituationReport;
  source: "claude" | "template";
  model: string | null;
  error: string | null;
}

/** Claude when configured and there is something to report; the template otherwise or on failure. */
export async function writeReport(facts: ReportFacts, deps: { claude?: typeof claudeReport } = {}): Promise<WrittenReport> {
  const { ANTHROPIC_API_KEY: apiKey, KILLBOARD_REPORT_MODEL: model } = env();
  const active = facts.week.kills + facts.week.losses > 0;
  if (apiKey && active) {
    try {
      const out = await (deps.claude ?? claudeReport)(facts, { apiKey, model });
      return { report: out.report, source: "claude", model: out.model, error: null };
    } catch (err) {
      const message = (err as Error).message;
      log.warn("Claude report failed, using the template", { error: message });
      return { report: templateReport(facts), source: "template", model: null, error: message };
    }
  }
  return { report: templateReport(facts), source: "template", model: null, error: null };
}

export async function findReport(db: Db, corporationId: number, week: DateRange) {
  const [row] = await db
    .select()
    .from(killboardReports)
    .where(
      and(
        eq(killboardReports.corporationId, corporationId),
        eq(killboardReports.periodFrom, week.from),
        eq(killboardReports.periodTo, week.to),
      ),
    );
  return row ?? null;
}

/** Writes and stores the report for the window that just closed (if not written yet). */
export async function generateSituationReport(
  db: Db,
  corporationId: number,
  now: Date,
  opts: { force?: boolean; write?: typeof writeReport } = {},
): Promise<{ created: boolean; week: DateRange; source?: WrittenReport["source"]; error?: string | null }> {
  const { week, prevWeek } = reportWindow(now);
  if (!opts.force && (await findReport(db, corporationId, week))) return { created: false, week };

  const corp = await getCorporation(corporationId);
  const facts = await buildReportFacts(
    { id: corporationId, name: corp?.name ?? `Corporation ${corporationId}`, ticker: corp?.ticker ?? null },
    week,
    prevWeek,
  );
  const written = await (opts.write ?? writeReport)(facts);
  const values = {
    corporationId,
    periodFrom: week.from,
    periodTo: week.to,
    source: written.source,
    model: written.model,
    content: written.report,
    facts,
    error: written.error,
    createdAt: new Date(),
  };
  await db
    .insert(killboardReports)
    .values(values)
    .onConflictDoUpdate({
      target: [killboardReports.corporationId, killboardReports.periodFrom, killboardReports.periodTo],
      set: { source: values.source, model: values.model, content: values.content, facts, error: values.error, createdAt: values.createdAt },
    });
  return { created: true, week, source: written.source, error: written.error };
}

export async function getLatestReport(corporationId: number): Promise<StoredReport | null> {
  const [row] = await getDb()
    .select()
    .from(killboardReports)
    .where(eq(killboardReports.corporationId, corporationId))
    .orderBy(desc(killboardReports.periodTo), desc(killboardReports.createdAt))
    .limit(1);
  if (!row) return null;
  return {
    report: row.content as SituationReport,
    facts: row.facts as ReportFacts,
    source: row.source === "claude" ? "claude" : "template",
    model: row.model,
    error: row.error,
    createdAt: row.createdAt.toISOString(),
    periodFrom: row.periodFrom,
    periodTo: row.periodTo,
  };
}
