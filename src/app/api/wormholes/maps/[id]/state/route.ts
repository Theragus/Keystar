import { getCurrentUser } from "@/core/auth/dal";
import { getDb } from "@/core/db";
import { getI18n } from "@/i18n/server";
import { MapError, mapStateSince } from "@/modules/wormholes/maps";
import { WH_PERMISSIONS } from "@/modules/wormholes/module";

/**
 * Polled by the chain map every few seconds: answers with just the revision
 * while nothing changed, and with the whole map once someone edited it.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/wormholes/maps/[id]/state">) {
  const user = await getCurrentUser();
  const errors = (await getI18n()).t.wormholes.api;
  if (!user) return Response.json({ error: errors.unauthorized }, { status: 401 });
  if (!user.can(WH_PERMISSIONS.view)) return Response.json({ error: errors.forbidden }, { status: 403 });
  const { id } = await ctx.params;
  const mapId = Number(id);
  const since = Number(new URL(request.url).searchParams.get("since") ?? -1);
  if (!Number.isSafeInteger(mapId) || mapId <= 0 || !Number.isSafeInteger(since)) {
    return Response.json({ error: errors.badRequest }, { status: 400 });
  }
  try {
    return Response.json(await mapStateSince(getDb(), mapId, since), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof MapError) return Response.json({ error: errors.notFound }, { status: 404 });
    throw err;
  }
}
