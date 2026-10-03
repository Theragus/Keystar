import type { Locale } from "../config";
import { de } from "./de";
import { en, type Messages } from "./en";

export type { Messages };

/** Selects one message from a dictionary; lets isomorphic data (module manifests) name text without a locale. */
export type Msg = (t: Messages) => string;

export const MESSAGES: Record<Locale, Messages> = { en, de };
