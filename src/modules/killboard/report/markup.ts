/**
 * Parses the situation report's inline markup into typed segments. The UI
 * renders segments as React text nodes, so model output can style words but
 * never inject HTML. Isomorphic.
 */
export type SegmentKind = "text" | "bold" | "good" | "bad" | "pilot";

export interface Segment {
  kind: SegmentKind;
  text: string;
}

const TOKEN = /\*\*([^*\n]+?)\*\*|\{([+\-@])([^{}\n]+?)\}/g;
const KIND: Record<string, SegmentKind> = { "+": "good", "-": "bad", "@": "pilot" };

export function parseMarkup(input: string): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  for (const m of input.matchAll(TOKEN)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ kind: "text", text: input.slice(last, at) });
    if (m[1] !== undefined) out.push({ kind: "bold", text: m[1] });
    else out.push({ kind: KIND[m[2]], text: m[3].trim() });
    last = at + m[0].length;
  }
  if (last < input.length) out.push({ kind: "text", text: input.slice(last) });
  return out.filter((s) => s.text.length > 0);
}

/** Plain text without markup, e.g. for previews or logs. */
export function stripMarkup(input: string): string {
  return parseMarkup(input)
    .map((s) => s.text)
    .join("");
}
