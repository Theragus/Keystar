import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import Link from "next/link";
import { Portrait } from "@/components/ui/eve-image";
import type { Messages } from "@/i18n/messages";
import type { Formatter } from "@/lib/format";
import { cn } from "@/lib/utils";
import { folderKey, mailHref, PAGE_SIZE, type MailParams } from "../filters";
import { recipientKey, type MailListItem, type NamedEntity } from "../queries";
import { EntityAvatar } from "./entity-avatar";
import { LabelDot } from "./label-dot";

type T = Messages["social"];

const DAY = 86400_000;

/** Recent mail by relative time, older mail by date (with the year once it isn't this year). */
export function listDate(date: Date, now: Date, f: Formatter): string {
  if (now.getTime() - date.getTime() < 7 * DAY) return f.relativeTime(date, now);
  const iso = date.toISOString().slice(0, 10);
  return date.getUTCFullYear() === now.getUTCFullYear() ? f.shortDate(iso) : iso;
}

export function MailSearch({ params, t }: { params: MailParams; t: T }) {
  return (
    <form action="/mail" className="flex items-center gap-2" role="search">
      {params.characterId && <input type="hidden" name="character" value={params.characterId} />}
      {params.folder.kind !== "all" && <input type="hidden" name="folder" value={folderKey(params.folder)} />}
      <label className="glass-inset flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg px-3">
        <Search className="size-4 shrink-0 text-ink-3" aria-hidden />
        <span className="sr-only">{t.list.searchLabel}</span>
        <input
          type="search"
          name="q"
          defaultValue={params.q}
          placeholder={t.list.search}
          maxLength={100}
          className="min-w-0 flex-1 bg-transparent text-sm text-ink placeholder:text-ink-3 focus:outline-none"
        />
      </label>
      {params.q && (
        <Link href={mailHref(params, { q: "" })} title={t.list.clear} className="glass-chip grid size-9 place-items-center rounded-lg text-ink-2 hover:text-ink">
          <X className="size-4" aria-hidden />
          <span className="sr-only">{t.list.clear}</span>
        </Link>
      )}
    </form>
  );
}

export function MailList({
  items,
  total,
  params,
  names,
  labels,
  characterNames,
  t,
  f,
  now,
}: {
  items: MailListItem[];
  total: number;
  params: MailParams;
  names: Map<string, NamedEntity>;
  labels: Map<string, { name: string; color: string | null }>;
  characterNames: Map<number, string>;
  t: T;
  f: Formatter;
  now: Date;
}) {
  const showReceivers = characterNames.size > 1 && params.characterId === null;
  const from = (params.page - 1) * PAGE_SIZE + 1;
  return (
    <div>
      <ul className="-mx-2 divide-y divide-white/5">
        {items.map((m) => {
          const open = params.open?.mailId === m.mailId;
          const firstRecipient = m.recipients[0];
          const recipientNames = m.recipients.map(
            (r) => names.get(recipientKey(r))?.name ?? (r.type === "mailing_list" ? t.fallback.mailingList(r.id) : t.fallback.entity(r.id)),
          );
          const who = m.sent ? t.list.to(recipientNames.join(", ")) : (m.from?.name ?? t.fallback.entity(m.fromId));
          const avatar = m.sent && firstRecipient ? (
            <EntityAvatar id={firstRecipient.id} category={names.get(recipientKey(firstRecipient))?.category ?? firstRecipient.type} size={36} />
          ) : (
            <EntityAvatar id={m.fromId} category={m.from?.category} size={36} />
          );
          const custom = m.labels.map((id) => labels.get(`${m.characterId}:${id}`)).filter((l) => l !== undefined);
          return (
            <li key={m.mailId}>
              <Link
                href={mailHref(params, { open: { characterId: m.characterId, mailId: m.mailId } })}
                scroll={false}
                aria-current={open ? "true" : undefined}
                className={cn(
                  "relative flex gap-3 rounded-xl px-2 py-3 transition-colors hover:bg-white/5",
                  open && "bg-accent/10 hover:bg-accent/12",
                )}
              >
                {m.unread && <span className="absolute top-1/2 -left-0.5 size-1.5 -translate-y-1/2 rounded-full bg-accent" title={t.list.unread} />}
                {avatar}
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className={cn("min-w-0 flex-1 truncate text-sm", m.unread ? "font-semibold text-ink" : "text-ink-2")}>{who}</span>
                    <time dateTime={m.sentAt.toISOString()} title={f.dateTime(m.sentAt)} className="shrink-0 text-2xs text-ink-3 tabular-nums">
                      {listDate(m.sentAt, now, f)}
                    </time>
                  </div>
                  <div className={cn("truncate text-sm", m.unread ? "font-medium text-ink" : "text-ink-2")}>
                    {m.subject || <span className="text-ink-3 italic">{t.list.noSubject}</span>}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    {custom.map((l) => (
                      <LabelDot key={l.name} color={l.color} title={l.name} />
                    ))}
                    <span className="min-w-0 flex-1 truncate text-xs text-ink-3">{m.hasBody ? m.preview : t.list.bodyPending}</span>
                    {showReceivers && (
                      <span className="flex shrink-0 -space-x-1.5" title={t.list.receivedBy(m.characterIds.map((id) => characterNames.get(id) ?? id).join(", "))}>
                        {m.characterIds.slice(0, 3).map((id) => (
                          <Portrait key={id} id={id} size={16} />
                        ))}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
      {total > PAGE_SIZE && (
        <nav className="mt-3 flex items-center justify-between gap-2 border-t border-white/5 pt-3 text-xs text-ink-3">
          {params.page > 1 ? (
            <Link href={mailHref(params, { page: params.page - 1, open: null })} className="inline-flex items-center gap-1 hover:text-ink">
              <ChevronLeft className="size-3.5" aria-hidden /> {t.list.newer}
            </Link>
          ) : (
            <span />
          )}
          <span className="tabular-nums">{t.list.range(from, from + items.length - 1, total)}</span>
          {params.page * PAGE_SIZE < total ? (
            <Link href={mailHref(params, { page: params.page + 1, open: null })} className="inline-flex items-center gap-1 hover:text-ink">
              {t.list.older} <ChevronRight className="size-3.5" aria-hidden />
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}
