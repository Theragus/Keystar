"use client";

import type { DamageProfile, Fit } from "@eveshipfit/dogma-engine";
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/i18n/client";
import { loadCharacterSkills } from "@/app/(app)/fitting/actions";
import { readDraft, writeDraft, type SkillSource } from "../engine/draft";
import type { FittingRuntime } from "../engine/engine";
import { bayFor, emptyFit, fitReducer, freeSlotIndex, nextState, type FitAction } from "../engine/fit-state";
import { exportEft, extractLinkPayload, importFit, shareUrl } from "../engine/formats";
import { fitStats } from "../engine/stats";
import { describeViolations } from "../engine/violations";
import { allSkills, chargeFits, kindOf, MODULE_SLOTS, type ModuleSlot } from "../sde/catalog";
import type { EsiFittingSummary, SkillSourceCharacter } from "../queries";
import { ExportDialog, ImportDialog } from "./fit-dialogs";
import { FitIconsContext } from "./fit-icon";
import { ItemBrowser } from "./item-browser";
import type { BrowserRoot } from "./shared";
import { ShipPanel, type Selection } from "./ship-panel";
import { StatsPanel } from "./stats-panel";

export interface EditorProps {
  runtime: FittingRuntime;
  characters: SkillSourceCharacter[];
  esiFittings: EsiFittingSummary[];
}

/** No hull yet: only loading a fit or picking a hull does anything. */
function editorReducer(fit: Fit | null, action: FitAction): Fit | null {
  if (fit === null) {
    if (action.type === "load") return action.fit;
    if (action.type === "setShip") return emptyFit(action.typeId);
    return null;
  }
  return fitReducer(fit, action);
}

interface Initial {
  fit: Fit | null;
  source: SkillSource;
  restored: boolean;
}

/** A share link in the URL wins; otherwise the draft this browser kept. */
function initialState(runtime: FittingRuntime): Initial {
  const payload = typeof window !== "undefined" ? extractLinkPayload(window.location.href) : null;
  if (payload) {
    try {
      const fit = runtime.engine.load_esf_link(payload);
      window.history.replaceState(null, "", window.location.pathname);
      return { fit: { ...fit, character: { skills: allSkills(runtime.sde) } }, source: { kind: "allV" }, restored: false };
    } catch {
      // A broken link falls through to the draft.
    }
  }
  const draft = readDraft(typeof window !== "undefined" ? window.localStorage : null);
  if (draft) return { fit: draft.fit, source: draft.source, restored: true };
  return { fit: null, source: { kind: "allV" }, restored: false };
}

const ZERO_SLOTS: Record<ModuleSlot, number> = { high: 0, medium: 0, low: 0, rig: 0, subsystem: 0, service: 0 };

/** The fitting tool once the engine and static data are loaded: the browser, the ship and the numbers. */
export function Editor({ runtime, characters, esiFittings }: EditorProps) {
  const { t, f } = useI18n();
  const s = t.fitting;
  const { toast } = useToast();
  const { sde, engine } = runtime;
  const [initial] = useState(() => initialState(runtime));
  const [fit, dispatch] = useReducer(editorReducer, initial.fit);
  const [source, setSource] = useState<SkillSource>(initial.source);
  const [skillsLoading, setSkillsLoading] = useState(false);
  const [selection, setSelection] = useState<Selection>(null);
  const [root, setRoot] = useState<BrowserRoot>(initial.fit ? "equipment" : "ships");
  const importRef = useRef<HTMLDialogElement>(null);
  const exportRef = useRef<HTMLDialogElement>(null);
  const skillCache = useRef(new Map<number, Record<number, number>>());
  const announced = useRef(false);

  const calc = useMemo(() => {
    if (!fit) return null;
    try {
      return runtime.calculate(fit, { validate: true });
    } catch (err) {
      console.error("Fit calculation failed", err);
      return null;
    }
  }, [fit, runtime]);
  const stats = useMemo(() => (fit && calc ? fitStats(fit, calc, sde) : null), [fit, calc, sde]);
  const violations = useMemo(() => (fit && calc ? describeViolations(fit, calc, sde, s.violations, f) : []), [fit, calc, sde, s, f]);
  const slotCounts = stats?.slots ?? ZERO_SLOTS;

  // Keep the draft in this browser.
  useEffect(() => {
    writeDraft(window.localStorage, fit ? { fit, source } : null);
  }, [fit, source]);

  // Say once that the last fit came back, and fetch a character's skills the draft remembered.
  useEffect(() => {
    if (announced.current) return;
    announced.current = true;
    if (initial.restored) toast({ tone: "neutral", title: s.editor.draftRestored, durationMs: 6000 });
    if (initial.source.kind === "character") void applySkills(initial.source);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function applySkills(next: SkillSource): Promise<void> {
    setSource(next);
    if (next.kind === "allV") return dispatch({ type: "setSkills", skills: allSkills(sde) });
    if (next.kind === "none") return dispatch({ type: "setSkills", skills: {} });
    const cached = skillCache.current.get(next.characterId);
    if (cached) return dispatch({ type: "setSkills", skills: cached });
    setSkillsLoading(true);
    try {
      const res = await loadCharacterSkills(next.characterId);
      if (!res.ok) throw new Error(res.error);
      skillCache.current.set(next.characterId, res.skills);
      dispatch({ type: "setSkills", skills: res.skills });
    } catch {
      toast({ tone: "critical", title: s.skills.failed });
      setSource({ kind: "allV" });
      dispatch({ type: "setSkills", skills: allSkills(sde) });
    } finally {
      setSkillsLoading(false);
    }
  }

  const currentSkills = (): Record<number, number> => (fit?.character?.skills as Record<number, number> | undefined) ?? allSkills(sde);

  /** Puts a type where it belongs: hull, first free slot, a module's charge, or a bay. */
  function pick(typeId: number) {
    const type = sde.types.get(typeId);
    if (!type) return;
    const kind = kindOf(sde, typeId);
    if (kind === "ship") {
      if (fit) dispatch({ type: "setShip", typeId });
      else dispatch({ type: "load", fit: emptyFit(typeId, currentSkills()) });
      setRoot("equipment");
      return;
    }
    if (!fit) return;
    if ((MODULE_SLOTS as readonly string[]).includes(kind)) {
      const slot = kind as ModuleSlot;
      if (freeSlotIndex(fit, slot, slotCounts[slot]) === null) {
        toast({ tone: "warning", title: s.editor.noFreeSlot(s.editor.slot[slot]) });
        return;
      }
      dispatch({ type: "addModule", typeId, slot, slotCounts });
      return;
    }
    if (kind === "charge") {
      const selected = selection?.kind === "item" ? selection.index : null;
      const targets =
        selected !== null && fit.items[selected] && chargeFits(sde, fit.items[selected].type_id, typeId)
          ? [selected]
          : fit.items.flatMap((item, i) => (chargeFits(sde, item.type_id, typeId) ? [i] : []));
      if (!targets.length) {
        toast({ tone: "warning", title: s.editor.noModuleForCharge });
        return;
      }
      for (const index of targets) dispatch({ type: "setCharge", index, chargeTypeId: typeId });
      return;
    }
    const bay = bayFor(kind);
    if (bay) dispatch({ type: "addToBay", typeId, bay });
  }

  function drop(typeId: number, target: { slot: ModuleSlot; index: number } | { item: number }) {
    if (!fit) return;
    const kind = kindOf(sde, typeId);
    if ("item" in target) {
      const item = fit.items[target.item];
      if (!item) return;
      if (kind === "charge") {
        if (chargeFits(sde, item.type_id, typeId)) dispatch({ type: "setCharge", index: target.item, chargeTypeId: typeId });
        else toast({ tone: "warning", title: s.violations.chargeGroup });
      } else if ((MODULE_SLOTS as readonly string[]).includes(kind) && "index" in item.slot) {
        dispatch({ type: "placeModule", typeId, slot: item.slot.type as ModuleSlot, index: item.slot.index });
      }
      return;
    }
    if ((MODULE_SLOTS as readonly string[]).includes(kind)) dispatch({ type: "placeModule", typeId, slot: target.slot, index: target.index });
    else pick(typeId);
  }

  function importText(text: string): boolean {
    try {
      const imported = importFit(engine, text);
      dispatch({ type: "load", fit: { ...imported, character: { skills: currentSkills() } } });
      setRoot("equipment");
      toast({ tone: "good", title: s.importExport.imported(imported.name || sde.types.get(imported.ship.type_id)?.name || "") });
      return true;
    } catch (err) {
      const reason = (err as Error).message === "unknown format" ? s.importExport.unknownFormat : (err as Error).message;
      toast({ tone: "critical", title: s.importExport.importFailed(reason) });
      return false;
    }
  }

  function openEsi(fitting: EsiFittingSummary): boolean {
    try {
      const imported = engine.load_esi_fitting({
        fitting_id: fitting.fittingId,
        name: fitting.name,
        description: fitting.description,
        ship_type_id: fitting.shipTypeId,
        items: fitting.items,
      });
      dispatch({ type: "load", fit: { ...engine.post_load({ ...imported, character: { skills: currentSkills() } }) } });
      setRoot("equipment");
      return true;
    } catch (err) {
      toast({ tone: "critical", title: s.importExport.esiLoadFailed((err as Error).message) });
      return false;
    }
  }

  const selectedSlot: ModuleSlot | null =
    selection?.kind === "slot"
      ? selection.slot
      : selection?.kind === "item" && fit?.items[selection.index] && "index" in fit.items[selection.index].slot
        ? (fit.items[selection.index].slot.type as ModuleSlot)
        : null;

  const exported = useMemo(() => {
    if (!fit) return { eft: "", link: "" };
    try {
      return { eft: exportEft(engine, fit), link: shareUrl(engine, fit, window.location.origin) };
    } catch {
      return { eft: "", link: "" };
    }
  }, [fit, engine]);

  return (
    <FitIconsContext.Provider value={runtime.manifest.icons ?? {}}>
      <div className="overflow-x-auto">
        <div className="grid min-w-[1100px] grid-cols-[320px_minmax(0,1fr)_340px] items-start gap-4">
          <ItemBrowser
            sde={sde}
            shipTypeId={fit?.ship.type_id ?? null}
            skills={currentSkills()}
            selectedSlot={selectedSlot}
            root={root}
            onRootChange={setRoot}
            onPick={pick}
          />
          <ShipPanel
            sde={sde}
            fit={fit}
            calc={calc}
            stats={stats}
            violations={violations}
            selection={selection}
            onSelect={setSelection}
            onName={(name) => dispatch({ type: "setName", name })}
            onRemove={(index) => {
              dispatch({ type: "removeItem", index });
              setSelection(null);
            }}
            onCycleState={(index) => {
              const item = fit?.items[index];
              if (!item) return;
              const max = calc?.items[index]?.max_state ?? "active";
              dispatch({ type: "setState", index, state: nextState(calc?.items[index]?.state ?? item.state, max) });
            }}
            onCharge={(index, chargeTypeId) => dispatch({ type: "setCharge", index, chargeTypeId })}
            onQuantity={(index, quantity) => dispatch({ type: "setQuantity", index, quantity })}
            onDrop={drop}
            source={source}
            characters={characters}
            onSource={(next) => void applySkills(next)}
            skillsLoading={skillsLoading}
            onImport={() => importRef.current?.showModal()}
            onExport={() => exportRef.current?.showModal()}
            onClear={() => {
              if (fit?.items.length && !window.confirm(s.editor.clearConfirm)) return;
              dispatch({ type: "clearItems" });
              setSelection(null);
            }}
            onChangeHull={() => setRoot("ships")}
          />
          <StatsPanel
            stats={stats}
            profile={fit?.environment?.damage_profile}
            onProfile={(profile: DamageProfile) => dispatch({ type: "setDamageProfile", profile })}
          />
        </div>
        <p className="mt-3 text-2xs text-ink-3">
          {s.page.data(f.integer(sde.buildNumber), f.shortDate(sde.releaseDate.slice(0, 10)))} · {s.page.engine(runtime.manifest.engineVersion)} ·{" "}
          {s.page.attribution}
        </p>
        <ImportDialog ref={importRef} sde={sde} characters={characters} esiFittings={esiFittings} onImport={importText} onOpenEsi={openEsi} />
        <ExportDialog ref={exportRef} eft={exported.eft} link={exported.link} />
      </div>
    </FitIconsContext.Provider>
  );
}
