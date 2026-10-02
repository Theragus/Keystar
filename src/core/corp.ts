import { eq } from "drizzle-orm";
import { eveCorporations, getDb } from "@/core/db";

export async function getCorporation(corporationId: number | null) {
  if (!corporationId) return null;
  const [row] = await getDb().select().from(eveCorporations).where(eq(eveCorporations.corporationId, corporationId));
  return row ?? null;
}
