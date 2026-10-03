"use server";

import { redirect } from "next/navigation";
import { assertPermission } from "@/core/auth/dal";
import { getI18n } from "@/i18n/server";
import { TRADE_PERMISSIONS } from "@/modules/trade/module";
import { appraise, AppraisalLimitError, MAX_INPUT_CHARS, saveAppraisal } from "@/modules/trade/appraisal/appraise";
import { countItemLines, MAX_LINES } from "@/modules/trade/appraisal/parse";

export interface AppraisalFormState {
  error: string | null;
}

/** Appraises pasted items at current Jita prices, saves the snapshot and opens it. */
export async function createAppraisal(_prev: AppraisalFormState, formData: FormData): Promise<AppraisalFormState> {
  const user = await assertPermission(TRADE_PERMISSIONS.appraisal);
  const { t } = await getI18n();
  const errors = t.trade.errors;
  const input = String(formData.get("input") ?? "");
  if (!input.trim()) return { error: errors.empty };
  if (input.length > MAX_INPUT_CHARS) return { error: errors.tooLong(MAX_INPUT_CHARS) };
  const lines = countItemLines(input);
  if (lines > MAX_LINES) return { error: errors.tooManyLines(lines, MAX_LINES) };
  const percent = Math.round(Number(formData.get("percent") ?? 100));
  const pricePercent = Number.isFinite(percent) ? Math.min(200, Math.max(1, percent)) : 100;

  let result: Awaited<ReturnType<typeof appraise>>;
  try {
    result = await appraise(input);
  } catch (err) {
    if (err instanceof AppraisalLimitError) return { error: errors.tooManyTypes(err.types, err.max) };
    throw err;
  }
  if (!result.items.length) return { error: errors.noItems };
  const id = await saveAppraisal(result, { input, pricePercent, userId: user.id, userName: user.main?.name ?? null });
  redirect(`/trade/appraisal/${id}`);
}
