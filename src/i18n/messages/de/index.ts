import type { Messages } from "../en";
import { admin } from "./admin";
import { auth } from "./auth";
import { characters } from "./characters";
import { common } from "./common";
import { core } from "./core";
import { dashboard } from "./dashboard";
import { eve } from "./eve";
import { intel } from "./intel";
import { killboard } from "./killboard";
import { mining } from "./mining";
import { setup } from "./setup";
import { shell } from "./shell";
import { trade } from "./trade";

/** German dictionary. Informal "du", EVE terms as German players use them (Corporation, Killboard, ISK, ESI). */
export const de: Messages = { common, shell, auth, setup, core, eve, dashboard, characters, admin, mining, killboard, intel, trade };
