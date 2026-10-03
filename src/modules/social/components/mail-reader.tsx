import { ArrowLeft, Eye, Hourglass } from "lucide-react";
import Link from "next/link";
import { Portrait } from "@/components/ui/eve-image";
import type { Messages } from "@/i18n/messages";
import type { Formatter } from "@/lib/format";
import { BUILTIN_LABELS } from "../esi";
import { mailHref, type MailParams } from "../filters";
import { recipientKey, type OpenMail } from "../queries";
import { EntityAvatar } from "./entity-avatar";
import { LabelDot } from "./label-dot";
import { MailBody } from "./mail-body";

type T = Messages["social"];

const BUILTIN_NAMES: Record<number, keyof T["folders"]> = {
  [BUILTIN_LABELS.inbox]: "inbox",
  [BUILTIN_LABELS.sent]: "sent",
  [BUILTIN_LABELS.corp]: "corp",
  [BUILTIN_LABELS.alliance]: "alliance",
};

export function BackToList({ params, t }: { params: MailParams; t: T }) {
  return (
    <Link href={mailHref(params, { open: null })} scroll={false} className="inline-flex items-center gap-1.5 text-xs text-ink-2 hover:text-ink 2xl:hidden">
      <ArrowLeft className="size-3.5" aria-hidden /> {t.reader.back}
    </Link>
  );
}

export function MailReader({
  mail,
  params,
  characterNames,
  t,
  f,
  now,
}: {
  mail: OpenMail;
  params: MailParams;
  characterNames: Map<number, string>;
  t: T;
  f: Formatter;
  now: Date;
}) {
  const r = t.reader;
  const fromName = mail.from?.name ?? t.fallback.entity(mail.fromId);
  const fromKind = mail.from?.category ? t.links.kinds[mail.from.category === "solar_system" ? "system" : mail.from.category] : null;
  const labels = mail.labels
    .map((l) => ({ ...l, name: BUILTIN_NAMES[l.id] ? (t.folders[BUILTIN_NAMES[l.id]] as string) : l.name }))
    .filter((l) => l.name);

  return (
    <article className="space-y-5">
      <BackToList params={params} t={t} />
      <header className="space-y-4">
        <h2 className="text-xl leading-snug font-semibold break-words text-ink">{mail.subject || <span className="text-ink-3 italic">{t.list.noSubject}</span>}</h2>
        <div className="flex flex-wrap items-center gap-3">
          <EntityAvatar id={mail.fromId} category={mail.from?.category} size={44} />
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold text-ink">{fromName}</div>
            {fromKind && <div className="text-xs text-ink-3">{fromKind}</div>}
          </div>
          <time dateTime={mail.sentAt.toISOString()} className="text-right text-xs text-ink-3 tabular-nums">
            <span className="block text-ink-2">{f.dateTime(mail.sentAt)}</span>
            {f.relativeTime(mail.sentAt, now)}
          </time>
        </div>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-4 gap-y-2 text-xs">
          <dt className="pt-1 text-ink-3">{r.to}</dt>
          <dd className="flex flex-wrap gap-1.5">
            {mail.recipients.map((rc) => {
              const named = mail.names.get(recipientKey(rc));
              const name = named?.name ?? (rc.type === "mailing_list" ? t.fallback.mailingList(rc.id) : t.fallback.entity(rc.id));
              return (
                <span
                  key={`${rc.type}:${rc.id}`}
                  title={t.recipientTypes[rc.type]}
                  className="glass-chip inline-flex max-w-full items-center gap-1.5 rounded-full py-0.5 pr-2.5 pl-0.5 text-ink-2"
                >
                  <EntityAvatar id={rc.id} category={rc.type} size={18} />
                  <span className="truncate">{name}</span>
                </span>
              );
            })}
          </dd>
          {mail.characterIds.length > 0 && characterNames.size > 1 && (
            <>
              <dt className="pt-1 text-ink-3">{r.receivedBy}</dt>
              <dd className="flex flex-wrap gap-1.5">
                {mail.characterIds.map((id) => (
                  <span key={id} className="inline-flex items-center gap-1.5 py-0.5 text-ink-2">
                    <Portrait id={id} size={18} />
                    {characterNames.get(id) ?? t.fallback.entity(id)}
                  </span>
                ))}
              </dd>
            </>
          )}
          {labels.length > 0 && (
            <>
              <dt className="pt-0.5 text-ink-3">{r.labels}</dt>
              <dd className="flex flex-wrap gap-1.5">
                {labels.map((l) => (
                  <span key={l.id} className="inline-flex items-center gap-1.5 rounded-full bg-surface-contrast/6 px-2 py-0.5 text-ink-2">
                    <LabelDot color={l.color} />
                    {l.name}
                  </span>
                ))}
              </dd>
            </>
          )}
        </dl>
      </header>

      <div className="glass-inset rounded-2xl px-5 py-4">
        {mail.body === null ? (
          <p className="flex items-center gap-2 text-sm text-ink-3">
            <Hourglass className="size-4" aria-hidden /> {r.bodyPending}
          </p>
        ) : mail.body.length === 0 ? (
          <p className="text-sm text-ink-3 italic">{r.empty}</p>
        ) : (
          <MailBody nodes={mail.body} links={mail.links} t={t} />
        )}
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-2 text-2xs text-ink-3">
        <span className="inline-flex items-center gap-1.5">
          <Eye className="size-3" aria-hidden /> {r.readOnly}
        </span>
        <span className="tabular-nums">{r.mailId(mail.mailId)}</span>
      </footer>
    </article>
  );
}
