import { eq } from "drizzle-orm";
import { characters } from "@/core/db/schema/core";
import type { JobDefinition } from "@/core/sync/types";
import { MAIL_JOB_KEY, MAIL_SCOPE } from "./module";
import { syncMailbox } from "./sync";

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * EVE mail of characters whose owner opted in. The summary carries counts
 * only: sync status is visible to admins, mail contents are not.
 */
export const mailJob: JobDefinition = {
  key: MAIL_JOB_KEY,
  label: (t) => t.social.module.jobs.mail,
  module: "social",
  owner: "character",
  requiredScopes: [MAIL_SCOPE],
  // ESI caches mail for 30 seconds; five minutes keeps new mail close without spending the char-social budget.
  intervalSeconds: 300,
  async run({ esi, db, characterId }) {
    const [owner] = await db.select({ userId: characters.userId }).from(characters).where(eq(characters.characterId, characterId!));
    if (!owner) return { summary: "Character is not linked" };

    const res = await syncMailbox(db, esi, characterId!, owner.userId);
    if (!res.stillOwned) return { summary: "Character changed owner during the import" };
    const parts = [count(res.added, "new mail", "new mails"), count(res.bodies, "body", "bodies")];
    if (res.removed) parts.push(`${res.removed} deleted in game`);
    return {
      summary: `${parts.join(", ")}${res.truncated ? " (older mail skipped)" : ""}`,
      nextRunAt: res.expiresAt,
    };
  },
};

export const socialJobs: JobDefinition[] = [mailJob];
