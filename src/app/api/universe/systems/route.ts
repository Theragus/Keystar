import { and, asc, eq } from "drizzle-orm";
import { getCurrentUser } from "@/core/auth/dal";
import { eveConstellations, eveEntities, eveSystems, getDb } from "@/core/db";
import { isListedSystem, type SystemOption } from "@/core/eve/systems";

/** Every cached known-space and wormhole system with its region, loaded once by the system picker. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new Response(null, { status: 401 });
  const rows = await getDb()
    .select({ id: eveSystems.systemId, name: eveSystems.name, sec: eveSystems.securityStatus, region: eveEntities.name })
    .from(eveSystems)
    .leftJoin(eveConstellations, eq(eveConstellations.constellationId, eveSystems.constellationId))
    .leftJoin(eveEntities, and(eq(eveEntities.id, eveConstellations.regionId), eq(eveEntities.category, "region")))
    .orderBy(asc(eveSystems.name));
  const systems: SystemOption[] = rows
    .filter((r) => isListedSystem(r.id))
    .map((r) => [r.id, r.name, Math.round(r.sec * 1000) / 1000, r.region]);
  return Response.json(systems, { headers: { "Cache-Control": "private, max-age=300" } });
}
