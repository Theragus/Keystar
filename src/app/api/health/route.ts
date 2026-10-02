import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/core/db";
import { KEYSTAR_VERSION } from "@/core/version";

export const dynamic = "force-dynamic";

/** Liveness/readiness probe for Docker and reverse proxies. */
export async function GET() {
  try {
    await getDb().execute(sql`SELECT 1`);
    return NextResponse.json({ status: "ok", version: KEYSTAR_VERSION });
  } catch {
    return NextResponse.json({ status: "error", database: "unreachable", version: KEYSTAR_VERSION }, { status: 503 });
  }
}
