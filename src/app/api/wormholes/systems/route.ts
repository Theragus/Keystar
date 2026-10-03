import { getCurrentUser } from "@/core/auth/dal";
import { getI18n } from "@/i18n/server";
import { WH_PERMISSIONS } from "@/modules/wormholes/module";
import { summarise } from "@/modules/wormholes/static";
import { WH } from "@/modules/wormholes/static-data";

/** System name typeahead for the lookup page and the chain map (all of New Eden and Anoikis, from bundled data). */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  const errors = (await getI18n()).t.wormholes.api;
  if (!user) return Response.json({ error: errors.unauthorized }, { status: 401 });
  if (!user.can(WH_PERMISSIONS.view)) return Response.json({ error: errors.forbidden }, { status: 403 });
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2 || q.length > 32) return Response.json({ systems: [] }, { headers: { "Cache-Control": "no-store" } });
  const systems = WH.search(q, 10).map((s) => summarise(s, WH.types));
  return Response.json({ systems }, { headers: { "Cache-Control": "private, max-age=300" } });
}
