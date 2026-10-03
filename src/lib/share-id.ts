import { randomBytes } from "node:crypto";

/** Without look-alike characters (0/O, 1/l/I), so ids survive being read aloud or retyped. */
const ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** An unguessable id for shareable links (appraisals, intel scans). */
export function shareId(length = 10): string {
  const bytes = randomBytes(length);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

/** Ids accepted in URLs. */
export const SHARE_ID_PATTERN = /^[A-Za-z0-9]{6,20}$/;
