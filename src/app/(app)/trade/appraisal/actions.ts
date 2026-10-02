"use server";

import { redirect } from "next/navigation";
import { assertPermission } from "@/core/auth/dal";
import { TRADE_PERMISSIONS } from "@/modules/trade/module";
import { appraise, AppraisalLimitError, MAX_INPUT_CHARS, saveAppraisal } from "@/modules/trade/appraisal/appraise";
import { countItemLines, MAX_LINES } from "@/modules/trade/appraisal/parse";

export interface AppraisalFormState {
  error: string | null;
}

/** Appraises pasted items at current Jita prices, saves the snapshot and opens it. */
export async function createAppraisal(_prev: AppraisalFormState, formData: FormData): Promise<AppraisalFormState> {
  const user = await assertPermission(TRADE_PERMISSIONS.appraisal);
  const input = String(formData.get("input") ?? "");
  if (!input.trim()) return { error: "Paste some items first." };
  if (input.length > MAX_INPUT_CHARS) return { error: "That paste is too long (200,000 characters at most)." };
  const lines = countItemLines(input);
  if (lines > MAX_LINES) {
    return { error: `That paste has ${lines.toLocaleString("en-US")} lines; appraise at most ${MAX_LINES.toLocaleString("en-US")} at a time.` };
  }
  const percent = Math.round(Number(formData.get("percent") ?? 100));
  const pricePercent = Number.isFinite(percent) ? Math.min(200, Math.max(1, percent)) : 100;

  let result: Awaited<ReturnType<typeof appraise>>;
  try {
    result = await appraise(input);
  } catch (err) {
    if (err instanceof AppraisalLimitError) return { error: err.message };
    throw err;
  }
  if (!result.items.length) {
    return { error: "No known items found. Paste item names from EVE (inventory, contract, fitting, d-scan or a list)." };
  }
  const id = await saveAppraisal(result, { input, pricePercent, userId: user.id, userName: user.main?.name ?? null });
  redirect(`/trade/appraisal/${id}`);
}
