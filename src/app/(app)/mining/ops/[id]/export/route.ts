import { NextResponse } from "next/server";
import { getCurrentUser } from "@/core/auth/dal";
import { getSettings } from "@/core/settings";
import { SHARE_ID_PATTERN } from "@/lib/share-id";
import { csvNumber, csvText } from "@/modules/mining/csv";
import { MINING_PERMISSIONS } from "@/modules/mining/module";
import { getOp, getOpResult } from "@/modules/mining/ops/queries";

const HEADER = ["payee_character_id", "payee", "character_ids", "volume_m3", "ore_value_isk", "payout_isk"];

/** The op's payout list as CSV, for whoever may see the op. */
export async function GET(_request: Request, ctx: RouteContext<"/mining/ops/[id]/export">) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const canManage = user.can(MINING_PERMISSIONS.manageOps);
  if (!canManage && !user.canAny(MINING_PERMISSIONS.viewOwn, MINING_PERMISSIONS.viewCorp)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const settings = await getSettings();
  const op = SHARE_ID_PATTERN.test(id) ? await getOp(id) : null;
  if (!op || op.corporationId !== settings["corp.homeCorporationId"]) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const result = await getOpResult(op);
  const own = new Set(user.characterIds);
  if (!canManage && !user.can(MINING_PERMISSIONS.viewCorp) && !result.pilots.some((p) => own.has(p.characterId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const lines = result.payees.map((p) =>
    [
      csvNumber(p.payeeCharacterId),
      csvText(p.name),
      csvText(p.characterIds.join(" ")),
      csvNumber(p.volume, 2),
      csvNumber(p.value, 2),
      csvNumber(p.share, 0),
    ].join(","),
  );
  const slug = op.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || op.id;
  return new NextResponse([HEADER.join(","), ...lines].join("\n") + "\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="keystar-op-${slug}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
