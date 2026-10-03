import { CHART_CLASS_COLOR } from "../class-colors";

/**
 * Income bars reuse the validated resource colours; expenses take the neutral
 * slate slot and grow downwards, and net is a neutral ink line, so the P&L
 * introduces no new hues.
 */
export const EXPENSE_COLOR = CHART_CLASS_COLOR.other;
export const NET_COLOR = "var(--series-net)";
