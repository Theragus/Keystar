"use client";

import { ArrowRight, ExternalLink, ServerCog, Sparkles } from "lucide-react";
import Link from "next/link";
import type { Ref } from "react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClass } from "@/components/ui/button";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import type { WhatsNewDigest } from "@/core/help/onboarding";
import { highlightDef, highlightText, upgradeText } from "@/core/help/releases";
import { useI18n } from "@/i18n/client";

/**
 * "Keystar updated to vX": the release's highlights as cards, upgrade notes for admins, and a
 * link to the full release notes on GitHub. Opens by itself once after an update, or from the
 * help and the sidebar's version link.
 */
export function WhatsNewDialog({ ref, digest, onClose }: { ref: Ref<HTMLDialogElement>; digest: WhatsNewDigest; onClose: () => void }) {
  const { t } = useI18n();
  const w = t.whatsNew;
  const several = digest.versions.length > 1;
  return (
    <Dialog
      ref={ref}
      size="md"
      icon={<Sparkles className="size-5" aria-hidden />}
      title={digest.mode === "update" ? w.updatedTitle(digest.version) : w.latestTitle(digest.version)}
      intro={digest.from ? w.since(digest.from) : w.intro}
      closeLabel={w.close}
      footer={
        <DialogFooter className="justify-end">
          <form method="dialog">
            <Button type="submit" data-initial-focus>
              {w.close}
            </Button>
          </form>
          <a href={digest.href} target="_blank" rel="noopener noreferrer" className={buttonClass("primary")}>
            {w.read} <ExternalLink className="size-4" aria-hidden />
            <span className="sr-only">{t.common.opensInNewTab}</span>
          </a>
        </DialogFooter>
      }
    >
      <div className="min-h-0 space-y-4 overflow-y-auto overscroll-contain px-6 py-5">
        {digest.upgrades.length > 0 && (
          <section className="rounded-lg bg-warning/10 px-4 py-3 text-sm ring-1 ring-warning/30 ring-inset">
            <h3 className="flex items-center gap-2 font-medium text-warning">
              <ServerCog className="size-4" aria-hidden /> {w.actionNeeded.title}
            </h3>
            <p className="mt-1 text-xs text-ink-2">{w.actionNeeded.intro}</p>
            <ul className="mt-2 space-y-2">
              {digest.upgrades.map(({ version, href }) => (
                <li key={version} className="text-xs">
                  <p className="text-ink">{upgradeText(t, version)}</p>
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-0.5 inline-flex items-center gap-1 text-accent hover:underline"
                  >
                    {w.actionNeeded.link(version)} <ExternalLink className="size-3" aria-hidden />
                    <span className="sr-only">{t.common.opensInNewTab}</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}
        {digest.highlights.length > 0 && (
          <ul className="divide-y divide-surface-contrast/[0.07]">
            {digest.highlights.map((ref) => {
              const def = highlightDef(ref);
              const text = highlightText(t, ref);
              const Icon = def?.icon ?? Sparkles;
              return (
                <li key={`${ref.version}:${ref.key}`} className="flex gap-3.5 py-3.5 first:pt-0 last:pb-0">
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent/12 text-accent">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <h3 className="font-semibold">{text.title}</h3>
                      {def && <Badge tone={def.kind === "new" ? "good" : "accent"}>{w.kind[def.kind]}</Badge>}
                      {several && <span className="font-mono text-3xs text-ink-3">v{ref.version}</span>}
                      {def?.href && (
                        <Link href={def.href} onClick={onClose} className="ml-auto inline-flex items-center gap-1 text-xs text-accent hover:underline">
                          {w.open} <ArrowRight className="size-3" aria-hidden />
                        </Link>
                      )}
                    </div>
                    <p className="mt-1 text-sm leading-relaxed text-ink-2">{text.body}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {digest.more > 0 && <p className="text-sm text-ink-3">{w.more(digest.more)}</p>}
      </div>
    </Dialog>
  );
}
