"use client";

import { Check, Copy, Download, Upload } from "lucide-react";
import { useState, type Ref } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { TypeIcon } from "@/components/ui/eve-image";
import { useI18n } from "@/i18n/client";
import { FITTING_MANAGE_HREF } from "../module";
import type { EsiFittingSummary, SkillSourceCharacter } from "../queries";
import type { Sde } from "../sde/reader";

/** Paste a fit, or open one of the characters' in-game fittings. */
export function ImportDialog({
  ref,
  sde,
  characters,
  esiFittings,
  onImport,
  onOpenEsi,
}: {
  ref: Ref<HTMLDialogElement>;
  sde: Sde;
  characters: SkillSourceCharacter[];
  esiFittings: EsiFittingSummary[];
  /** Returns true when the text was imported (the dialog closes). */
  onImport: (text: string) => boolean;
  onOpenEsi: (fitting: EsiFittingSummary) => boolean;
}) {
  const { t } = useI18n();
  const m = t.fitting.importExport;
  const [text, setText] = useState("");
  const names = new Map(characters.map((c) => [c.characterId, c.name]));
  const byCharacter = new Map<number, EsiFittingSummary[]>();
  for (const fit of esiFittings) byCharacter.set(fit.characterId, [...(byCharacter.get(fit.characterId) ?? []), fit]);

  return (
    <Dialog ref={ref} icon={<Upload className="size-5" aria-hidden />} title={m.importTitle} intro={m.importIntro} closeLabel={m.close} size="lg">
      <div className="grid min-h-0 flex-1 grid-cols-2 gap-5 overflow-y-auto px-6 py-5">
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (onImport(text)) {
              setText("");
              e.currentTarget.closest("dialog")?.close();
            }
          }}
        >
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={m.placeholder}
            rows={14}
            spellCheck={false}
            className="glass-inset field-focus min-h-[280px] flex-1 resize-y rounded-lg p-3 font-mono text-xs text-ink outline-none placeholder:text-ink-3"
          />
          <div>
            <Button type="submit" variant="primary" disabled={!text.trim()}>
              <Upload className="size-3.5" aria-hidden /> {m.importButton}
            </Button>
          </div>
        </form>
        <div className="min-w-0 space-y-2">
          <h3 className="eve-label text-xs text-ink-2">{m.esiTitle}</h3>
          <p className="text-xs text-ink-3">{m.esiIntro}</p>
          {esiFittings.length === 0 ? (
            <div className="space-y-3 pt-2">
              <p className="text-sm text-ink-2">{m.esiNone}</p>
              <ButtonLink href={FITTING_MANAGE_HREF} size="sm">
                {m.esiEnable}
              </ButtonLink>
            </div>
          ) : (
            [...byCharacter].map(([characterId, fits]) => (
              <div key={characterId} className="space-y-1">
                <div className="pt-1 text-2xs font-medium text-ink-3">{names.get(characterId) ?? characterId}</div>
                <ul className="space-y-0.5">
                  {fits.map((fit) => (
                    <li key={fit.fittingId}>
                      <button
                        type="button"
                        onClick={(e) => {
                          if (onOpenEsi(fit)) e.currentTarget.closest("dialog")?.close();
                        }}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm text-ink-2 hover:bg-surface-contrast/6 hover:text-ink"
                      >
                        <TypeIcon id={fit.shipTypeId} size={24} />
                        <span className="min-w-0 flex-1 truncate">
                          {fit.name}
                          <span className="ml-2 text-2xs text-ink-3">{sde.types.get(fit.shipTypeId)?.name}</span>
                        </span>
                        <span className="text-2xs text-accent">{m.open}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>
      </div>
    </Dialog>
  );
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const { t } = useI18n();
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  return (
    <Button
      size="sm"
      onClick={async () => {
        const ok = await navigator.clipboard?.writeText(value).then(
          () => true,
          () => false,
        );
        setState(ok ? "copied" : "failed");
        setTimeout(() => setState("idle"), ok ? 1500 : 3000);
      }}
      title={state === "failed" ? t.common.copy.failedHint : undefined}
    >
      {state === "copied" ? <Check className="size-3.5 text-good-text" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
      {state === "copied" ? t.common.copy.copied : state === "failed" ? t.common.copy.failed : label}
    </Button>
  );
}

/** The fit as EFT text and as a share link. */
export function ExportDialog({ ref, eft, link }: { ref: Ref<HTMLDialogElement>; eft: string; link: string }) {
  const { t } = useI18n();
  const m = t.fitting.importExport;
  return (
    <Dialog ref={ref} icon={<Download className="size-5" aria-hidden />} title={m.exportTitle} closeLabel={m.close} size="md">
      <div className="space-y-5 overflow-y-auto px-6 py-5">
        <section className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-ink">{m.eft}</h3>
              <p className="text-xs text-ink-3">{m.eftHint}</p>
            </div>
            <CopyButton value={eft} label={t.common.copy.copy} />
          </div>
          <textarea readOnly value={eft} rows={12} className="glass-inset w-full resize-y rounded-lg p-3 font-mono text-xs text-ink-2 outline-none" />
        </section>
        <section className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-ink">{m.link}</h3>
              <p className="text-xs text-ink-3">{m.linkHint}</p>
            </div>
            <CopyButton value={link} label={t.common.copy.copy} />
          </div>
          <input readOnly value={link} className="glass-inset w-full rounded-lg px-3 py-2 font-mono text-xs text-ink-2 outline-none" />
        </section>
      </div>
    </Dialog>
  );
}
