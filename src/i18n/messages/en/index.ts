import { admin } from "./admin";
import { auth } from "./auth";
import { characters } from "./characters";
import { common } from "./common";
import { core } from "./core";
import { dashboard } from "./dashboard";
import { eve } from "./eve";
import { killboard } from "./killboard";
import { mining } from "./mining";
import { pnl } from "./pnl";
import { setup } from "./setup";
import { shell } from "./shell";
import { trade } from "./trade";
import { wallet } from "./wallet";

/**
 * English source dictionary, one namespace per area. Its shape is the
 * `Messages` type every other language must match exactly.
 */
export const en = { common, shell, auth, setup, core, eve, dashboard, characters, admin, mining, pnl, killboard, trade, wallet };

export type Messages = typeof en;
