import { NextResponse, type NextRequest } from "next/server";
import { audit } from "@/core/audit";
import { getCurrentUser } from "@/core/auth/dal";
import { getSettings } from "@/core/settings";
import { parseMiningFilters } from "@/modules/mining/filters";
import { MINING_PERMISSIONS } from "@/modules/mining/module";
import { getLedgerRows } from "@/modules/mining/queries";

const MAX_ROWS = 200_000;

function csvCell(value: string | number | null): string {
  if (value === null) return "";
  const s = String(value);
  // Quote, and neutralise spreadsheet formula injection from names.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) || safe !== s ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** CSV download of the ledger with the same filters and data scope as the UI. */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!user.can(MINING_PERMISSIONS.export) || !user.canAny(MINING_PERMISSIONS.viewOwn, MINING_PERMISSIONS.viewCorp)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const filters = parseMiningFilters(Object.fromEntries(request.nextUrl.searchParams));
  const settings = await getSettings();
  const scope = { corp: user.can(MINING_PERMISSIONS.viewCorp), ownCharacterIds: user.characterIds };
  const { rows } = await getLedgerRows(
    filters,
    scope,
    { source: settings["mining.valuationSource"], mode: settings["mining.valuationMode"] },
    { limit: MAX_ROWS, offset: 0 },
  );

  const header = [
    "date",
    "source",
    "character_id",
    "character",
    "main",
    "type_id",
    "ore",
    "class",
    "system_id",
    "system",
    "security",
    "refinery",
    "quantity",
    "volume_m3",
    "unit_price_isk",
    "value_isk",
  ];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.date,
        r.source,
        r.characterId,
        r.characterName,
        r.ownerName,
        r.typeId,
        r.typeName,
        r.oreClass,
        r.systemId,
        r.systemName,
        r.security === null ? null : r.security.toFixed(2),
        r.observerName,
        r.quantity,
        r.volume.toFixed(2),
        r.unitPrice.toFixed(2),
        r.value.toFixed(2),
      ]
        .map(csvCell)
        .join(","),
    );
  }

  await audit({
    actorUserId: user.id,
    actorName: user.main?.name,
    action: "mining.export",
    details: { from: filters.from, to: filters.to, rows: rows.length },
  });

  return new NextResponse(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="keystar-mining-${filters.from}_${filters.to}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
