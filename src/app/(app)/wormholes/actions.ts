"use server";

import { z } from "zod";
import { audit } from "@/core/audit";
import { assertPermission } from "@/core/auth/dal";
import { getDb } from "@/core/db";
import { getI18n } from "@/i18n/server";
import { LIFE_STATES, MASS_STATES } from "@/modules/wormholes/lifetime";
import * as maps from "@/modules/wormholes/maps";
import { WH_PERMISSIONS } from "@/modules/wormholes/module";
import type { MapState } from "@/modules/wormholes/state";

export type MapActionResult = { ok: true; state: MapState } | { ok: false; error: string; state: MapState | null };

const systemId = z.number().int().min(30_000_000).max(31_999_999);
const connId = z.uuid();

type Permission = (typeof WH_PERMISSIONS)[keyof typeof WH_PERMISSIONS];

/**
 * Runs one edit of the corporation map and answers with the new state, so the
 * browser can replace its optimistic view without another request.
 */
async function edit(
  permission: Permission,
  fn: (ctx: { mapId: number; actor: maps.Actor; userId: string; actorName: string | undefined }) => Promise<unknown>,
): Promise<MapActionResult> {
  const user = await assertPermission(permission);
  const db = getDb();
  const map = await maps.getCorpMap(db);
  const actor = { id: user.id, name: user.main?.name ?? null };
  try {
    await fn({ mapId: map.id, actor, userId: user.id, actorName: user.main?.name });
  } catch (err) {
    const { t } = await getI18n();
    if (err instanceof maps.MapError) {
      return { ok: false, error: t.wormholes.errors[err.code], state: await maps.loadMapState(db, map.id) };
    }
    if (err instanceof z.ZodError) return { ok: false, error: t.wormholes.errors.failed, state: null };
    throw err;
  }
  return { ok: true, state: await maps.loadMapState(db, map.id) };
}

export async function setHomeAction(id: number) {
  return edit(WH_PERMISSIONS.manage, async ({ mapId, actor, userId, actorName }) => {
    await maps.setHome(getDb(), mapId, actor, systemId.parse(id));
    await audit({ actorUserId: userId, actorName, action: "wormholes.home.set", targetType: "system", targetId: id });
  });
}

export async function addSystemAction(input: { systemId: number; connectTo: number | null; connId: string }) {
  return edit(WH_PERMISSIONS.edit, async ({ mapId, actor }) => {
    const parsed = z
      .object({ systemId, connectTo: systemId.nullable(), connId })
      .parse(input);
    await maps.addSystem(getDb(), mapId, actor, parsed);
  });
}

export async function removeSystemAction(id: number) {
  return edit(WH_PERMISSIONS.edit, async ({ mapId, userId, actorName }) => {
    await maps.removeSystem(getDb(), mapId, systemId.parse(id));
    await audit({ actorUserId: userId, actorName, action: "wormholes.system.removed", targetType: "system", targetId: id });
  });
}

export async function moveSystemsAction(moves: { id: number; x: number; y: number }[]) {
  return edit(WH_PERMISSIONS.edit, async ({ mapId }) => {
    const coord = z.number().finite().min(-1e6).max(1e6);
    const parsed = z.array(z.object({ id: systemId, x: coord, y: coord })).min(1).max(200).parse(moves);
    await maps.moveSystems(getDb(), mapId, parsed);
  });
}

export async function setPinnedAction(id: number, pinned: boolean) {
  return edit(WH_PERMISSIONS.edit, async ({ mapId }) => {
    await maps.setPinned(getDb(), mapId, systemId.parse(id), z.boolean().parse(pinned));
  });
}

export async function setLabelAction(id: number, label: string | null) {
  return edit(WH_PERMISSIONS.edit, async ({ mapId }) => {
    await maps.setLabel(getDb(), mapId, systemId.parse(id), z.string().max(200).nullable().parse(label));
  });
}

export async function connectAction(input: { id: string; from: number; to: number }) {
  return edit(WH_PERMISSIONS.edit, async ({ mapId, actor }) => {
    const parsed = z.object({ id: connId, from: systemId, to: systemId }).parse(input);
    await maps.connect(getDb(), mapId, actor, parsed.id, parsed.from, parsed.to);
  });
}

const patchSchema = z
  .object({
    type: z.string().regex(/^[A-Z]\d{3}$/).nullable(),
    typeOn: systemId.nullable(),
    life: z.enum(LIFE_STATES),
    mass: z.enum(MASS_STATES),
    size: z.enum(["S", "M", "L", "XL"]).nullable(),
  })
  .partial();

export async function updateConnectionAction(id: string, patch: z.infer<typeof patchSchema>) {
  return edit(WH_PERMISSIONS.edit, async ({ mapId, actor }) => {
    await maps.updateConnection(getDb(), mapId, actor, connId.parse(id), patchSchema.parse(patch));
  });
}

export async function removeConnectionAction(id: string) {
  return edit(WH_PERMISSIONS.edit, async ({ mapId, userId, actorName }) => {
    await maps.removeConnection(getDb(), mapId, connId.parse(id));
    await audit({ actorUserId: userId, actorName, action: "wormholes.connection.removed", targetType: "connection", targetId: id });
  });
}

export async function arrangeAction(resetAll: boolean) {
  return edit(WH_PERMISSIONS.edit, async ({ mapId }) => {
    await maps.autoArrange(getDb(), mapId, z.boolean().parse(resetAll));
  });
}

export async function clearMapAction() {
  return edit(WH_PERMISSIONS.manage, async ({ mapId, userId, actorName }) => {
    await maps.clearMap(getDb(), mapId);
    await audit({ actorUserId: userId, actorName, action: "wormholes.map.cleared", targetType: "map", targetId: mapId });
  });
}
