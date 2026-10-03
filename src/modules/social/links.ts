/**
 * Link schemes inside EVE HTML. Most open a window in the EVE client; Keystar
 * turns the ones with a web equivalent into web links and shows the rest as
 * labelled chips. Anything unknown (javascript:, data: …) is never a link.
 * Isomorphic and pure.
 */

export type MailLink =
  | { kind: "showinfo"; typeId: number; itemId: number | null }
  | { kind: "killReport"; killmailId: number; hash: string }
  | { kind: "fitting"; dna: string; shipTypeId: number }
  | { kind: "web"; url: string }
  | { kind: "client"; scheme: string }
  | { kind: "invalid" };

/** Schemes that only the EVE client can open (lower-cased). */
const CLIENT_SCHEMES = new Set([
  "joinchannel",
  "contract",
  "warreport",
  "recruitmentad",
  "bookmarkfolder",
  "fleet",
  "shipskinlisting",
  "shipskindesign",
  "opportunity",
  "careerprogramnode",
  "helppointer",
  "localsvc",
  "opencareeragents",
  "hypernet",
]);

const positiveInt = (s: string | undefined): number | null => {
  if (!s || !/^\d{1,19}$/.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
};

export function classifyLink(href: string): MailLink {
  const m = /^([A-Za-z][A-Za-z0-9+.-]*):(.*)$/s.exec(href.trim());
  if (!m) return { kind: "invalid" };
  const scheme = m[1].toLowerCase();
  const payload = m[2].trim();
  switch (scheme) {
    case "showinfo": {
      const [typePart, itemPart] = payload.split("//");
      const typeId = positiveInt(typePart);
      if (!typeId) return { kind: "invalid" };
      return { kind: "showinfo", typeId, itemId: positiveInt(itemPart) };
    }
    case "killreport": {
      const [id, hash] = payload.split(":");
      const killmailId = positiveInt(id);
      if (!killmailId || !hash || !/^[0-9a-f]{40}$/i.test(hash)) return { kind: "invalid" };
      return { kind: "killReport", killmailId, hash: hash.toLowerCase() };
    }
    case "fitting": {
      // Ship DNA: "<shipTypeId>:<moduleTypeId>;<qty>:…::"
      const shipTypeId = positiveInt(payload.split(":")[0]);
      if (!shipTypeId) return { kind: "client", scheme: "fitting" };
      return { kind: "fitting", dna: payload, shipTypeId };
    }
    case "http":
    case "https": {
      try {
        const url = new URL(href.trim());
        return url.protocol === "http:" || url.protocol === "https:" ? { kind: "web", url: url.toString() } : { kind: "invalid" };
      } catch {
        return { kind: "invalid" };
      }
    }
    default:
      return CLIENT_SCHEMES.has(scheme) ? { kind: "client", scheme } : { kind: "invalid" };
  }
}

export type ShowinfoKind =
  | "character"
  | "corporation"
  | "alliance"
  | "faction"
  | "region"
  | "constellation"
  | "system"
  | "station"
  | "structure"
  | "celestial"
  | "item"
  | "type";

export interface ShowinfoContext {
  /** Group and category of the link's type, when known (eve_types / eve_groups). */
  groupId?: number | null;
  categoryId?: number | null;
  /** ESI /universe/names category of the item id, when known (eve_entities). */
  entityCategory?: string | null;
}

/** Type ids used for entity links in practice, so links resolve before the type is known locally. */
const WELL_KNOWN_TYPES: Record<number, ShowinfoKind> = {
  2: "corporation",
  3: "region",
  4: "constellation",
  5: "system",
  30: "faction",
  16159: "alliance",
};
/** Character types (group 1, one per bloodline). */
const isCharacterType = (typeId: number) => typeId >= 1373 && typeId <= 1386;

const BY_GROUP: Record<number, ShowinfoKind> = {
  1: "character",
  2: "corporation",
  32: "alliance",
  19: "faction",
  3: "region",
  4: "constellation",
  5: "system",
};
const BY_CATEGORY: Record<number, ShowinfoKind> = { 3: "station", 65: "structure", 2: "celestial" };
const BY_ENTITY: Record<string, ShowinfoKind> = {
  character: "character",
  corporation: "corporation",
  alliance: "alliance",
  faction: "faction",
  region: "region",
  constellation: "constellation",
  solar_system: "system",
  station: "station",
};

/** What a `showinfo:typeID//itemID` link points at (CCP's resolution table). */
export function resolveShowinfo(link: { typeId: number; itemId: number | null }, ctx: ShowinfoContext = {}): ShowinfoKind {
  if (link.itemId === null) return "type";
  if (ctx.groupId != null && BY_GROUP[ctx.groupId]) return BY_GROUP[ctx.groupId];
  if (ctx.categoryId != null && BY_CATEGORY[ctx.categoryId]) return BY_CATEGORY[ctx.categoryId];
  if (ctx.groupId != null) return "item";
  if (WELL_KNOWN_TYPES[link.typeId]) return WELL_KNOWN_TYPES[link.typeId];
  if (isCharacterType(link.typeId)) return "character";
  if (ctx.entityCategory && BY_ENTITY[ctx.entityCategory]) return BY_ENTITY[ctx.entityCategory];
  return "item";
}

/** Kinds whose item id is an entity /universe/names can resolve. */
export const NAMED_KINDS = new Set<ShowinfoKind>(["character", "corporation", "alliance", "faction", "region", "constellation", "system", "station"]);

/** Web page for a resolved link, or null when only the client can show it. */
export function webUrlFor(kind: ShowinfoKind, typeId: number, itemId: number | null): string | null {
  const zkill = (path: string) => `https://zkillboard.com/${path}/${itemId}/`;
  switch (kind) {
    case "character":
    case "corporation":
    case "alliance":
    case "faction":
    case "region":
    case "constellation":
      return zkill(kind);
    case "system":
      return zkill("system");
    case "type":
    case "item":
      return `https://everef.net/types/${typeId}`;
    default:
      return null;
  }
}

export const killReportUrl = (killmailId: number) => `https://zkillboard.com/kill/${killmailId}/`;

/** Ids worth resolving for a set of links: type ids and item ids that fit /universe/names. */
export function linkIds(hrefs: string[]): { typeIds: number[]; itemIds: number[] } {
  const typeIds = new Set<number>();
  const itemIds = new Set<number>();
  for (const href of hrefs) {
    const link = classifyLink(href);
    if (link.kind === "showinfo") {
      typeIds.add(link.typeId);
      // Structures and items have 64-bit ids; /universe/names only knows 32-bit ones.
      if (link.itemId !== null && link.itemId <= 2_147_483_647) itemIds.add(link.itemId);
    } else if (link.kind === "fitting") typeIds.add(link.shipTypeId);
  }
  return { typeIds: [...typeIds], itemIds: [...itemIds] };
}
