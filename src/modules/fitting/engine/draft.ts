import type { Fit } from "@eveshipfit/dogma-engine";

/*
 * The fit being edited survives a reload in this browser (localStorage). Nothing leaves the browser: sharing is
 * explicit, by link or EFT.
 */

export const DRAFT_KEY = "keystar.fitting.draft";

export type SkillSource = { kind: "allV" } | { kind: "none" } | { kind: "character"; characterId: number };

export interface Draft {
  fit: Fit;
  source: SkillSource;
}

export function readDraft(storage: Pick<Storage, "getItem"> | null | undefined): Draft | null {
  try {
    const raw = storage?.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Draft>;
    if (!parsed.fit || typeof parsed.fit !== "object" || !parsed.fit.ship?.type_id || !Array.isArray(parsed.fit.items)) return null;
    const source: SkillSource =
      parsed.source?.kind === "none" || (parsed.source?.kind === "character" && typeof parsed.source.characterId === "number")
        ? parsed.source
        : { kind: "allV" };
    return { fit: parsed.fit, source };
  } catch {
    return null;
  }
}

export function writeDraft(storage: Pick<Storage, "setItem" | "removeItem"> | null | undefined, draft: Draft | null): void {
  try {
    if (!draft) storage?.removeItem(DRAFT_KEY);
    else storage?.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // Private mode or a full store: the draft just isn't kept.
  }
}
