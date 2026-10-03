import { CHART_CLASS_COLOR } from "@/modules/mining/class-colors";
import { EXPENSE_COLOR, NET_COLOR } from "@/modules/mining/pnl/colors";

/**
 * The wallet chart reuses validated slots: income takes the first categorical colour, expenses the neutral slate
 * slot (growing downwards) and net the neutral ink line of the mining P&L, so no new hues are introduced.
 */
export const INCOME_COLOR = CHART_CLASS_COLOR.moon;
export { EXPENSE_COLOR, NET_COLOR };
