import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/core/db";

export const dynamic = "force-dynamic";

/** Liveness/readiness probe for Docker and reverse proxies. */
export async function GET() {
  try {
    await getDb().execute(sql`SELECT 1`);
    return NextResponse.json({ status: "ok" });
  } catch {
    return NextResponse.json({ status: "error", database: "unreachable" }, { status: 503 });
  }
}
