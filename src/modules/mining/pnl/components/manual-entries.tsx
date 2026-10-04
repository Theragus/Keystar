import { Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { Portrait } from "@/components/ui/eve-image";
import { Panel } from "@/components/ui/glass";
import type { Messages } from "@/i18n/messages";
import { getI18n } from "@/i18n/server";
import { SPREAD_DAYS } from "../spread";
import { SubmitButton } from "./form-controls";

const inputClass = "glass-inset h-9 w-full rounded-lg px-3 text-sm text-ink";

interface Entry {
  id: number;
  characterId: number | null;
  characterName: string | null;
  date: string;
  spreadDays: number;
  category: string;
  description: string;
  amount: number;
}

/**
 * "Add a cost" / "Add income" form and the list of manual entries overlapping the period, shared by the expenses
 * and income pages. Texts come from the page's dictionary section.
 */
export async function ManualEntries<C extends string>({
  text,
  addAction,
  deleteAction,
  categories,
  defaultCategory,
  entries,
  characters,
  today,
  backHref,
}: {
  text: { add: Messages["pnl"]["expenses"]["add"]; manual: Messages["pnl"]["expenses"]["manual"] };
  addAction: (formData: FormData) => Promise<void>;
  deleteAction: (entryId: number) => Promise<void>;
  categories: { id: C; label: string }[];
  defaultCategory: C;
  entries: (Entry & { category: C })[];
  characters: { characterId: number; name: string }[];
  today: string;
  backHref: string;
}) {
  const { t, f } = await getI18n();
  const { add, manual } = text;
  const label = new Map<string, string>(categories.map((c) => [c.id, c.label]));
  return (
    <div className="grid gap-4 xl:grid-cols-12">
      <Panel className="xl:col-span-5" title={add.title} subtitle={add.subtitle}>
        <form action={addAction} className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-xs text-ink-3">
            {add.date}
            <input type="date" name="date" required defaultValue={today} max="2100-01-01" className={inputClass} />
          </label>
          <label className="space-y-1 text-xs text-ink-3">
            {add.amount}
            <input name="amount" required inputMode="decimal" placeholder={add.amountPlaceholder} className={inputClass} />
          </label>
          <label className="space-y-1 text-xs text-ink-3">
            {add.category}
            <select name="category" defaultValue={defaultCategory} className={inputClass}>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-xs text-ink-3">
            {add.spread}
            <select name="spreadDays" defaultValue="1" className={inputClass}>
              {SPREAD_DAYS.map((days) => (
                <option key={days} value={days}>
                  {t.pnl.spread(days)}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-xs text-ink-3">
            {add.character}
            <select name="characterId" defaultValue="" className={inputClass}>
              <option value="">{add.accountWide}</option>
              {characters.map((c) => (
                <option key={c.characterId} value={c.characterId}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-xs text-ink-3">
            {add.note}
            <input name="description" maxLength={200} placeholder={add.notePlaceholder} className={inputClass} />
          </label>
          <div className="sm:col-span-2">
            <SubmitButton variant="primary" size="md">
              <Plus className="size-4" aria-hidden /> {add.submit}
            </SubmitButton>
          </div>
        </form>
      </Panel>

      <Panel className="xl:col-span-7" title={manual.title} subtitle={manual.subtitle}>
        {entries.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-3">{manual.empty}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="ks-table">
              <thead>
                <tr>
                  <th>{manual.columns.date}</th>
                  <th>{manual.columns.category}</th>
                  <th>{manual.columns.character}</th>
                  <th>{manual.columns.note}</th>
                  <th className="num">{manual.columns.amount}</th>
                  <th className="num" aria-label={manual.columns.actions} />
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id}>
                    <td className="whitespace-nowrap text-ink-2 tabular-nums">
                      {f.shortDate(e.date)}
                      {e.spreadDays > 1 && <span className="ml-1 text-2xs text-ink-3">{manual.spreadDays(e.spreadDays)}</span>}
                    </td>
                    <td>{label.get(e.category) ?? e.category}</td>
                    <td className="text-ink-2">
                      {e.characterId === null ? (
                        <span className="whitespace-nowrap">{add.accountWide}</span>
                      ) : (
                        <span className="flex items-center gap-2 whitespace-nowrap">
                          <Portrait id={e.characterId} size={24} />
                          {e.characterName ?? t.pnl.characterFallback(e.characterId)}
                        </span>
                      )}
                    </td>
                    <td className="max-w-[16rem] truncate text-ink-2">{e.description || "—"}</td>
                    <td className="num font-semibold">{f.compact(e.amount)}</td>
                    <td className="num">
                      <form action={deleteAction.bind(null, e.id)}>
                        <SubmitButton variant="ghost" title={manual.deleteHint}>
                          <Trash2 className="size-3.5" aria-hidden />
                        </SubmitButton>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-2xs text-ink-3">
          {manual.footer(
            <Link href={backHref} className="text-accent hover:underline">
              {manual.back}
            </Link>,
          )}
        </p>
      </Panel>
    </div>
  );
}
