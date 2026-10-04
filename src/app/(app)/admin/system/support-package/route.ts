import { NextResponse, type NextRequest } from "next/server";
import { audit } from "@/core/audit";
import { getCurrentUser } from "@/core/auth/dal";
import { runChecks } from "@/core/system/checks";
import { collectSystemSnapshot } from "@/core/system/collect";
import { originFromHeaders } from "@/core/system/config";
import { buildSupportPackage, supportPackageFilename } from "@/core/system/support-package";

export const dynamic = "force-dynamic";

/**
 * The support package as a JSON download, collected afresh. What it contains
 * (and never contains) is decided in src/core/system/support-package.ts.
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!user.can("system.view")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const snapshot = await collectSystemSnapshot({ source: "web", origin: originFromHeaders(request.headers) });
  const pkg = buildSupportPackage(snapshot, runChecks(snapshot));
  const filename = supportPackageFilename(pkg);
  await audit({
    actorUserId: user.id,
    actorName: user.main?.name,
    action: "system.support_package",
    details: { filename },
  });

  return new NextResponse(JSON.stringify(pkg, null, 2) + "\n", {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
