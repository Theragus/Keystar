# Writing a module

Every feature beyond the core (mining today; skills, assets, wallets, fleets, threat intel later) is a **module**.
A module declares what it needs and what it offers; the core takes care of tokens, scheduling, permissions and
navigation. Use `src/modules/mining` as the reference implementation.

## 1. Manifest — `src/modules/<name>/module.ts`

```ts
import { GraduationCap } from "lucide-react";
import type { KeystarModule } from "@/core/modules/types";

export const skillsModule: KeystarModule = {
  id: "skills",
  name: "Skills",
  description: "Character skills, queues and corporation skill plans.",
  scopes: [
    { scope: "esi-skills.read_skills.v1", level: "character", reason: "Reads your trained skills." },
    { scope: "esi-skills.read_skillqueue.v1", level: "character", reason: "Shows your training queue." },
  ],
  permissions: [
    { key: "skills.view.own", label: "View own skills", description: "…", group: "Skills", defaultMinRole: "member" },
    { key: "skills.view.corp", label: "View corp skills", description: "…", group: "Skills", defaultMinRole: "viewer" },
    { key: "skills.plans.manage", label: "Manage skill plans", description: "…", group: "Skills", defaultMinRole: "contributor" },
  ],
  nav: [
    {
      id: "pilots",
      label: "Pilots",
      order: 20,
      items: [{ href: "/skills", label: "Skills", icon: GraduationCap, anyPermission: ["skills.view.own", "skills.view.corp"] }],
    },
  ],
};
```

Register it in `src/core/modules/registry.ts` (`MODULES`). That alone:

- adds its scopes to the SSO requests (`character` scopes for every member, `corporation` scopes for the "link with
  corporation access" flow) and to the scope checklists in the UI,
- adds its permissions to the role system and the Settings → Permissions matrix,
- adds its navigation (filtered by permission).

Remember to enable new scopes on the EVE developer application, and tell members to re-authorise (My Characters
shows "missing scopes" automatically).

Sensitive scopes that only some users want can be **optional**: `{ scope, level: "character", optional: true, reason }`.
They are left out of the member and corporation scope sets and never reported as missing. Let users enable them per
character with `reauthorizeHref(grantedScopes, { add: [scope] })` (and `{ remove: [scope] }` to stop); jobs that
require the scope are only planned for characters that granted it. See the wallet module for an example.

## 2. Schema — `src/modules/<name>/schema.ts`

Define Drizzle tables, then export them from `src/core/db/index.ts` (add the import to `schema` and an
`export * from`). Generate a migration:

```bash
pnpm db:generate --name skills
```

Store raw ESI data keyed by its natural identity (character, date, type …) and upsert on sync. Don't add foreign
keys from history tables to `characters` — history should survive a character being unlinked.

## 3. Jobs — `src/modules/<name>/jobs.ts`

```ts
import type { JobDefinition } from "@/core/sync/types";

export const skillsJob: JobDefinition = {
  key: "skills.character-skills",
  label: "Character skills",
  module: "skills",
  owner: "character",                       // character | corporation | global
  requiredScopes: ["esi-skills.read_skills.v1"],
  intervalSeconds: 3600,
  async run({ esi, db, characterId }) {
    const res = await esi.get<{ skills: unknown[] }>(`/characters/${characterId}/skills`, { characterId: characterId! });
    // … upsert into your tables, then resolve names: ensureTypes(...), ensureNames(...)
    return { summary: `${res.data.skills.length} skills`, nextRunAt: res.expiresAt };
  },
};
```

Add the jobs to `src/modules/jobs.ts`. The scheduler creates one row per eligible owner and keeps it in sync with
tokens. For corporation jobs set `preferredCorpRoles` so the scheduler tries the right members' tokens first; a `403`
moves on to the next candidate automatically.

If the module needs item prices, add a `PriceInterestProvider` to `PRICE_INTEREST` in `src/modules/jobs.ts`.

## 4. Pages

Add routes under `src/app/(app)/<name>/`. In every page, start with the data access layer:

```ts
const user = await requirePermission("skills.view.own", "skills.view.corp");
const corpWide = user.can("skills.view.corp");
// scope queries to user.characterIds unless corpWide
```

Server actions must call `assertPermission(...)` themselves — never rely on the page having checked.

Reuse the UI kit in `src/components/ui` (`Panel`, `StatTile`, `MultiSelect`, `DateRangePicker`, `Segmented`,
`StatusBadge`, `Portrait`, `TypeIcon`, …) and keep filters in the URL like the mining pages do (`PendingProvider`
dims the previous render while new data loads).

## Checklist

- [ ] Manifest registered in `MODULES`
- [ ] Schema exported from `src/core/db/index.ts`, migration generated
- [ ] Jobs registered in `src/modules/jobs.ts`
- [ ] Pages check permissions; member views scoped to own characters
- [ ] New scopes added to the EVE application and listed in `docs/deployment.md`
- [ ] Tests for parsing/aggregation logic (`tests/`)
- [ ] ROADMAP.md updated
