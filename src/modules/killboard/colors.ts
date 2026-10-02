import { CHART_CLASS_COLOR } from "@/modules/mining/class-colors";

/**
 * Kills and losses reuse two slots of the validated categorical palette
 * (blue and orange: distinguishable under all common colour-vision
 * deficiencies on the glass surface), so no new hues are introduced.
 */
export const KILL_COLOR = CHART_CLASS_COLOR.moon;
export const LOSS_COLOR = CHART_CLASS_COLOR.ore;
