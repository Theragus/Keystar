/**
 * The mail page's state lives in the URL (character, folder, search, page,
 * open mail), so every view is a plain server render and links can be shared
 * between your own tabs. Isomorphic and pure.
 */

export type MailFolder =
  | { kind: "all" | "inbox" | "sent" | "corp" | "alliance" | "lists" }
  | { kind: "list"; id: number }
  | { kind: "label"; name: string };

export interface MailParams {
  /** One of the viewer's characters, or null for all of them. */
  characterId: number | null;
  folder: MailFolder;
  q: string;
  page: number;
  open: { characterId: number; mailId: number } | null;
}

export const PAGE_SIZE = 50;
const SIMPLE = new Set(["all", "inbox", "sent", "corp", "alliance", "lists"]);

type SearchParams = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const positive = (s: string) => (/^\d{1,19}$/.test(s) && Number.isSafeInteger(Number(s)) && Number(s) > 0 ? Number(s) : null);

export function parseFolder(value: string): MailFolder {
  if (SIMPLE.has(value)) return { kind: value as "all" };
  if (value.startsWith("list:")) {
    const id = positive(value.slice(5));
    if (id) return { kind: "list", id };
  }
  if (value.startsWith("label:") && value.length > 6) return { kind: "label", name: value.slice(6, 46) };
  return { kind: "all" };
}

export function folderKey(folder: MailFolder): string {
  if (folder.kind === "list") return `list:${folder.id}`;
  if (folder.kind === "label") return `label:${folder.name}`;
  return folder.kind;
}

/** Reads the page state; characters that aren't the viewer's are ignored. */
export function parseMailParams(sp: SearchParams, ownCharacterIds: number[]): MailParams {
  const character = positive(first(sp.character));
  const open = /^(\d+)-(\d+)$/.exec(first(sp.mail));
  const openCharacter = open ? positive(open[1]) : null;
  const openMail = open ? positive(open[2]) : null;
  return {
    characterId: character && ownCharacterIds.includes(character) ? character : null,
    folder: parseFolder(first(sp.folder)),
    q: first(sp.q).trim().slice(0, 100),
    page: Math.min(1000, positive(first(sp.page)) ?? 1),
    open: openCharacter && openMail && ownCharacterIds.includes(openCharacter) ? { characterId: openCharacter, mailId: openMail } : null,
  };
}

/**
 * Link to the mail page with some state changed. Changing the character,
 * folder or search starts again at page 1 with no mail open.
 */
export function mailHref(current: MailParams, change: Partial<MailParams> = {}): string {
  const resets = "characterId" in change || "folder" in change || "q" in change;
  const next: MailParams = { ...current, ...(resets ? { page: 1, open: null } : {}), ...change };
  const params = new URLSearchParams();
  if (next.characterId) params.set("character", String(next.characterId));
  if (next.folder.kind !== "all") params.set("folder", folderKey(next.folder));
  if (next.q) params.set("q", next.q);
  if (next.page > 1) params.set("page", String(next.page));
  if (next.open) params.set("mail", `${next.open.characterId}-${next.open.mailId}`);
  const s = params.toString();
  return s ? `/mail?${s}` : "/mail";
}
