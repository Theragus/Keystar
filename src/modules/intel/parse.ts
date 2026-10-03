/**
 * Reads pilot names out of what people paste from EVE:
 *
 * - the local (or any chat channel) member list: one name per line,
 * - the fleet window ("Copy fleet composition"): tab separated, name first,
 * - chat log lines: `[ 2026.10.02 19:00:00 ] Pilot Name > text` (the speaker),
 * - or names typed by hand, one per line or separated by commas.
 *
 * Names follow EVE's naming policy: 3–37 characters of letters, digits,
 * spaces, hyphens and apostrophes, never starting or ending with the latter
 * three. Very old characters may also contain dots or underscores.
 */

export type PasteFormat = "list" | "fleet" | "chat" | "mixed" | "empty";

export interface ParsedPilotList {
  /** Unique names in paste order (case-insensitive de-duplication keeps the first spelling). */
  names: string[];
  /** Lines that did not look like a name (the first few, for feedback). */
  skipped: string[];
  skippedCount: number;
  /** D-scan lines found in the pilot box. */
  dscanLines: number;
  format: PasteFormat;
}

const NAME = /^[A-Za-z0-9._](?:[A-Za-z0-9 '._-]{1,35})[A-Za-z0-9._]$/;
const CHAT_LINE = /^\[\s*\d{4}\.\d{2}\.\d{2}\s+\d{2}:\d{2}:\d{2}\s*\]\s*(.+?)\s+>\s?/;
const DSCAN_LINE = /^\d+\t/;
/** Senders of chat lines that are not pilots. */
const SYSTEM_SENDERS = new Set(["eve system", "eve-system", "message"]);
const MAX_SKIPPED_SHOWN = 20;

export function isValidPilotName(name: string): boolean {
  return NAME.test(name) && !/\s{2,}/.test(name);
}

function clean(value: string): string {
  // EVE clients sometimes copy zero-width or non-breaking characters.
  return value.replace(/[​-‍﻿]/g, "").replace(/ /g, " ").trim();
}

export function parsePilotList(text: string): ParsedPilotList {
  const names: string[] = [];
  const seen = new Set<string>();
  const skipped: string[] = [];
  let skippedCount = 0;
  let dscanLines = 0;
  const kinds = new Set<"list" | "fleet" | "chat">();

  const add = (raw: string, line: string) => {
    const name = clean(raw);
    if (!name) return;
    if (!isValidPilotName(name)) {
      skippedCount++;
      if (skipped.length < MAX_SKIPPED_SHOWN) skipped.push(line.slice(0, 80));
      return;
    }
    const key = name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    names.push(name);
  };

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/ /g, " ").trim();
    if (!line) continue;
    if (DSCAN_LINE.test(line)) {
      dscanLines++;
      continue;
    }
    const chat = CHAT_LINE.exec(line);
    if (chat) {
      kinds.add("chat");
      if (!SYSTEM_SENDERS.has(chat[1].trim().toLowerCase())) add(chat[1], line);
      continue;
    }
    if (line.includes("\t")) {
      kinds.add("fleet");
      add(line.split("\t")[0], line);
      continue;
    }
    kinds.add("list");
    if (/[,;]/.test(line)) {
      for (const part of line.split(/[,;]/)) add(part, line);
    } else {
      add(line, line);
    }
  }

  const format: PasteFormat = kinds.size === 0 ? "empty" : kinds.size > 1 ? "mixed" : [...kinds][0];
  return { names, skipped, skippedCount, dscanLines, format };
}
