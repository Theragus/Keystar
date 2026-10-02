"use server";

import { redirect } from "next/navigation";
import { assertPermission } from "@/core/auth/dal";
import { TRADE_PERMISSIONS } from "@/modules/trade/module";
import { appraise, MAX_INPUT_CHARS, saveAppraisal } from "@/modules/trade/appraisal/appraise";

export interface AppraisalFormState {
  error: string | null;
}

/** Appraises pasted items at current Jita prices, saves the snapshot and opens it. */
export async function createAppraisal(_prev: AppraisalFormState, formData: FormData): Promise<AppraisalFormState> {
  const user = await assertPermission(TRADE_PERMISSIONS.appraisal);
  const input = String(formData.get("input") ?? "");
  if (!input.trim()) return { error: "Paste some items first." };
  if (input.length > MAX_INPUT_CHARS) return { error: "That paste is too long (200,000 characters at most)." };
  const percent = Math.round(Number(formData.get("percent") ?? 100));
  const pricePercent = Number.isFinite(percent) ? Math.min(200, Math.max(1, percent)) : 100;

  const result = await appraise(input);
  if (!result.items.length) {
    return { error: "No known items found. Paste item names from EVE (inventory, contract, fitting, d-scan or a list)." };
  }
  const id = await saveAppraisal(result, { input, pricePercent, userId: user.id, userName: user.main?.name ?? null });
  redirect(`/trade/appraisal/${id}`);
}
