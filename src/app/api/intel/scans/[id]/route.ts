import { getCurrentUser } from "@/core/auth/dal";
import { SHARE_ID_PATTERN } from "@/lib/share-id";
import { INTEL_PERMISSIONS } from "@/modules/intel/module";
import { getScan, scanProgress } from "@/modules/intel/scans";

/** Progress of a scan, polled by the scan page while zKillboard data comes in. */
export async function GET(_request: Request, ctx: RouteContext<"/api/intel/scans/[id]">) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Not signed in" }, { status: 401 });
  if (!user.can(INTEL_PERMISSIONS.use)) return Response.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await ctx.params;
  if (!SHARE_ID_PATTERN.test(id)) return Response.json({ error: "Not found" }, { status: 404 });
  const scan = await getScan(id);
  if (!scan) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(await scanProgress(scan), { headers: { "Cache-Control": "no-store" } });
}
