/**
 * EVE HTML: the markup of mail bodies, bios and descriptions. It looks like
 * HTML but isn't (`<color=0xAARRGGBB>`, unquoted attributes, alpha-first
 * colours, tags that are never closed), so it is parsed into typed nodes and
 * rendered as React elements, never injected as HTML. Follows CCP's reference:
 * https://developers.eveonline.com/docs/guides/eve-html/ (tokenise, re-nest,
 * render). Isomorphic and pure.
 */

export type EveNode =
  | { t: "text"; text: string }
  | { t: "br" }
  | { t: "tab" }
  | { t: "bold" | "italic" | "underline" | "uppercase"; children: EveNode[] }
  | { t: "style"; color?: string; size?: number; letterSpacing?: number; children: EveNode[] }
  | { t: "hint"; title: string; children: EveNode[] }
  | { t: "link"; href: string; title?: string; children: EveNode[] };

type Attrs = Record<string, string>;

type Token =
  | { k: "text"; text: string }
  | { k: "open"; name: string; attrs: Attrs }
  | { k: "close"; name: string };

/** Tags without a closing tag. Alignment is per line in the client; Keystar keeps text left-aligned. */
const VOID = new Set(["br", "t", "left", "right", "center"]);
/** Deeper nesting is malformed input; such tags are dropped (their text is kept). */
const MAX_DEPTH = 48;
const MAX_TITLE = 300;

const TAG = /<(\/?)([A-Za-z][A-Za-z0-9]*)([^>]*)>/g;

/** Only these four entities exist in EVE HTML; everything else stays literal. */
function decodeEntities(s: string): string {
  return s.replace(/&(amp|lt|gt|nbsp);/gi, (_, name: string) => {
    switch (name.toLowerCase()) {
      case "amp":
        return "&";
      case "lt":
        return "<";
      case "gt":
        return ">";
      default:
        return " ";
    }
  });
}

/** Attributes of a tag body: `=value` (attribtag form) then `name=value` pairs; values quoted or bare. */
export function parseAttributes(tagName: string, body: string): Attrs {
  const attrs: Attrs = {};
  const src = body.replace(/&nbsp;/gi, " ");
  let i = 0;
  const skipSpace = () => {
    while (i < src.length && /[\s/]/.test(src[i])) i++;
  };
  const readValue = (): string => {
    while (i < src.length && /\s/.test(src[i])) i++;
    const q = src[i];
    if (q === '"' || q === "'") {
      const end = src.indexOf(q, i + 1);
      const value = src.slice(i + 1, end === -1 ? src.length : end);
      i = end === -1 ? src.length : end + 1;
      return value;
    }
    const start = i;
    while (i < src.length && !/\s/.test(src[i])) i++;
    return src.slice(start, i);
  };

  if (/^\s*=/.test(src)) {
    i = src.indexOf("=") + 1;
    attrs[tagName] = decodeEntities(readValue());
  }
  for (;;) {
    skipSpace();
    const m = /^([A-Za-z][A-Za-z0-9-]*)\s*/.exec(src.slice(i));
    if (!m) break;
    i += m[0].length;
    const name = m[1].toLowerCase();
    if (src[i] === "=") {
      i++;
      attrs[name] ??= decodeEntities(readValue());
    } else {
      attrs[name] ??= "";
    }
  }
  return attrs;
}

export function tokenize(input: string): Token[] {
  // Legacy `<url:…>` links are the attribtag form with a colon.
  const src = input.replace(/\r\n/g, "\n").replace(/<url:/gi, "<url=");
  const tokens: Token[] = [];
  let last = 0;
  const pushText = (raw: string) => {
    if (!raw) return;
    const text = decodeEntities(raw.replace(/\t/g, " "));
    const prev = tokens[tokens.length - 1];
    if (prev?.k === "text") prev.text += text;
    else tokens.push({ k: "text", text });
  };
  for (const m of src.matchAll(TAG)) {
    const at = m.index ?? 0;
    pushText(src.slice(last, at));
    last = at + m[0].length;
    const name = m[2].toLowerCase();
    if (m[1]) tokens.push({ k: "close", name });
    else tokens.push({ k: "open", name, attrs: parseAttributes(name, m[3]) });
  }
  pushText(src.slice(last));
  return tokens;
}

/** EVE colours are alpha first: `0xAARRGGBB` / `#AARRGGBB` (a trailing `L` leaks from Python longs). */
export function parseColor(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const v = value.trim().replace(/L$/i, "");
  let a = 255;
  let rgb: string;
  const long = /^(?:0x|#)([0-9a-f]{8})$/i.exec(v);
  const short = /^#([0-9a-f]{6})$/i.exec(v);
  if (long) {
    a = parseInt(long[1].slice(0, 2), 16);
    rgb = long[1].slice(2);
  } else if (short) {
    rgb = short[1];
  } else if (/^white$/i.test(v)) {
    rgb = "ffffff";
  } else if (/^yellow$/i.test(v)) {
    rgb = "ffff00";
  } else {
    return undefined;
  }
  const r = parseInt(rgb.slice(0, 2), 16);
  const g = parseInt(rgb.slice(2, 4), 16);
  const b = parseInt(rgb.slice(4, 6), 16);
  // Colours assume the client's dark background. Keystar is dark too, but text that would
  // vanish (near black, nearly transparent) falls back to the regular text colour.
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  if (luminance < 0.05 || a < 90) return undefined;
  const alpha = Math.round((a / 255) * 100) / 100;
  return alpha >= 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Font size in pixels (EVE's body text is 12) as a clamped multiple of the surrounding text; 1 means "unchanged". */
export function parseFontSize(value: string | undefined): number | undefined {
  const px = Number.parseFloat(value ?? "");
  if (!Number.isFinite(px) || px <= 0) return undefined;
  const em = Math.min(1.75, Math.max(0.75, px / 12));
  return Math.abs(em - 1) < 0.01 ? undefined : Math.round(em * 100) / 100;
}

function parseLetterSpacing(value: string | undefined): number | undefined {
  const px = Number.parseFloat(value ?? "");
  if (!Number.isFinite(px) || px === 0) return undefined;
  return Math.min(8, Math.max(-2, px));
}

const title = (s: string | undefined) => (s ? s.slice(0, MAX_TITLE) : undefined);

/** Index of the close tag matching the open tag at `start`, or `end` when it is never closed. */
function matchingClose(tokens: Token[], start: number, end: number, name: string): number {
  let depth = 0;
  for (let i = start + 1; i < end; i++) {
    const tok = tokens[i];
    if (tok.k === "open" && tok.name === name) depth++;
    else if (tok.k === "close" && tok.name === name) {
      if (depth === 0) return i;
      depth--;
    }
  }
  return end;
}

function element(tok: Extract<Token, { k: "open" }>, children: EveNode[]): EveNode[] {
  const a = tok.attrs;
  switch (tok.name) {
    case "b":
    case "strong":
      return [{ t: "bold", children }];
    case "i":
    case "em":
      return [{ t: "italic", children }];
    case "u":
      return [{ t: "underline", children }];
    case "uppercase":
      return [{ t: "uppercase", children }];
    case "font":
    case "color":
    case "fontsize":
    case "letterspace": {
      const color = parseColor(tok.name === "font" || tok.name === "color" ? a.color : undefined);
      const size = parseFontSize(tok.name === "fontsize" ? a.fontsize : tok.name === "font" ? a.size : undefined);
      const letterSpacing = parseLetterSpacing(tok.name === "letterspace" ? a.letterspace : undefined);
      if (color === undefined && size === undefined && letterSpacing === undefined) return children;
      return [{ t: "style", color, size, letterSpacing, children }];
    }
    case "a":
    case "url": {
      const href = (tok.name === "a" ? a.href : a.url)?.trim();
      if (!href) return children;
      return [{ t: "link", href, title: title(a.alt || a.title), children }];
    }
    case "hint":
    case "localized": {
      const hint = title(tok.name === "hint" ? a.hint : a.hint || a.title);
      return hint ? [{ t: "hint", title: hint, children }] : children;
    }
    default:
      // <loc>, <p>, <div>, <span>, <script> … : the tag goes, its text stays (as text).
      return children;
  }
}

function build(tokens: Token[], start: number, end: number, depth: number): EveNode[] {
  const out: EveNode[] = [];
  for (let i = start; i < end; i++) {
    const tok = tokens[i];
    if (tok.k === "text") {
      const prev = out[out.length - 1];
      if (prev?.t === "text") prev.text += tok.text;
      else out.push({ t: "text", text: tok.text });
    } else if (tok.k === "close") {
      // A close tag without an open one is dropped.
    } else if (VOID.has(tok.name)) {
      if (tok.name === "br") out.push({ t: "br" });
      else if (tok.name === "t") out.push({ t: "tab" });
    } else if (depth >= MAX_DEPTH) {
      // Too deep: drop the tag and keep reading its contents at this level (its close tag is then a stray).
    } else {
      const close = matchingClose(tokens, i, end, tok.name);
      const children = build(tokens, i + 1, close, depth + 1);
      for (const node of element(tok, children)) {
        const prev = out[out.length - 1];
        if (node.t === "text" && prev?.t === "text") prev.text += node.text;
        else out.push(node);
      }
      i = close;
    }
  }
  return out;
}

/** Parses EVE HTML into a tree. Malformed input never throws: unclosed tags own the rest, strays are dropped. */
export function parseEveHtml(input: string): EveNode[] {
  const tokens = tokenize(input ?? "");
  return build(tokens, 0, tokens.length, 0);
}

/** Every link in a tree, in document order. */
export function collectLinks(nodes: EveNode[]): string[] {
  const out: string[] = [];
  const walk = (list: EveNode[]) => {
    for (const n of list) {
      if (n.t === "link") out.push(n.href);
      if ("children" in n) walk(n.children);
    }
  };
  walk(nodes);
  return out;
}

/** Plain text of a tree; line breaks become spaces when `singleLine`. */
export function plainText(nodes: EveNode[], singleLine = false): string {
  let s = "";
  const walk = (list: EveNode[]) => {
    for (const n of list) {
      if (n.t === "text") s += n.text;
      else if (n.t === "br") s += singleLine ? " " : "\n";
      else if (n.t === "tab") s += " ";
      else if (n.t === "uppercase") {
        const before = s;
        s = "";
        walk(n.children);
        s = before + s.toUpperCase();
      } else walk(n.children);
    }
  };
  walk(nodes);
  return singleLine ? s.replace(/\s+/g, " ").trim() : s;
}

/** A one-line preview of a mail body for lists. */
export function mailPreview(body: string | null | undefined, max = 160): string {
  if (!body) return "";
  const text = plainText(parseEveHtml(body), true);
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}
