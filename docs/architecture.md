# Architecture

Keystar is one TypeScript codebase that runs as two processes against one PostgreSQL database:

```
                ┌──────────────┐     HTTPS      ┌──────────────────────────────┐
   Browser ───▶ │    Caddy     │ ─────────────▶ │  app  (Next.js, server.js)   │
                └──────────────┘                │  pages · server actions ·    │
                                                │  /auth/* SSO routes          │
   EVE SSO ◀──── login / token exchange ─────── │                              │
                                                └──────────────┬───────────────┘
                                                               │ Drizzle (postgres.js)
                                                        ┌──────▼──────┐
                                                        │  PostgreSQL │
                                                        └──────▲──────┘
                                                               │
   ESI ◀──── scheduled, cached, rate-limited requests ──┌──────┴───────────────────┐
                                                        │  worker (dist/worker.mjs)│
                                                        │  planner · runner · jobs │
                                                        └──────────────────────────┘
```

- The **app** never calls authenticated ESI routes on page loads; pages read from Postgres. It only talks to EVE
  during sign-in and for small public lookups (e.g. the ore field estimator pricing a new ore type).
- The **worker** owns all background ESI traffic and token refreshes.

## Source layout

```
src/
  app/                 Next.js routes
    (app)/             signed-in area (sidebar shell): dashboard, mining, characters, admin
    auth/              SSO login / callback / logout / demo routes
    setup/             first-start walkthrough for the first admin
    login/, join/      public pages
  core/                framework-level code shared by every module
    auth/              SSO (sso.ts), sessions, provisioning, role policy, data access layer (dal.ts)
    db/                Drizzle client and core schemas (core, eve, sync)
    esi/               ESI client, token refresh, DB-backed response cache
    eve/               EVE data: resolver (names/types/systems), prices, ore classes, image URLs
    rbac/              roles and permissions
    sync/              job types, scheduler, core jobs
    modules/           module contract and registry
    settings.ts        typed app settings (stored as JSON rows)
  modules/
    mining/            the mining module: schema, jobs, queries, filters, UI components, estimator
    jobs.ts            registry of background jobs (worker only)
  worker/index.ts      worker entry point
  scripts/             migrate, demo-seed
drizzle/               generated SQL migrations
docker/                entrypoint, Caddyfile
```

## Authentication and accounts

1. `/auth/login?intent=…` creates a PKCE pair and a random `state`, stores them in an encrypted, short-lived
   cookie and redirects to `login.eveonline.com/v2/oauth/authorize`.
   - `login` — identity only, no scopes
   - `join` — sign in and grant member scopes in one go (the `/join` link)
   - `link` / `link-corp` — add a character (member scopes / plus corporation scopes) to the signed-in account
2. `/auth/callback` exchanges the code, validates the JWT (signature via CCP's JWKS, issuer, audience contains the
   client id **and** `"EVE Online"`, expiry) and calls `provisionFromSso()`.
3. Provisioning creates or finds the user, links the character, stores the encrypted refresh token, applies the role
   policy and detects **character transfers** (the SSO `owner` hash changes → the old account loses the character;
   an account left without characters is disabled and signed out).
4. Sessions are random 32-byte tokens; only their SHA-256 hash is stored. 30-day sliding expiry: the database row
   is extended on activity (authoritative) and `src/proxy.ts` renews the cookie on each navigation.

Authorisation is enforced in the **data access layer** (`src/core/auth/dal.ts`): `requireUser()`,
`requirePermission()` for pages and `assertPermission()` for server actions. `src/proxy.ts` only does an optimistic
redirect for visitors without a session cookie.

## Roles and permissions

Roles are hierarchical: `guest < member < viewer < contributor < director < admin`. Every permission has a default
minimum role; admins can override the minimum per permission (Settings → Permissions), except locked ones such as
`app.settings.manage`. Users can only manage, and assign roles to, users strictly below them (admins excepted).

New users get a role from configuration: `ADMIN_CHARACTER_IDS` → admin; otherwise the first user ever → admin; home
corporation (optionally alliance) members → member; everyone else → guest awaiting approval. Logging in never
demotes anyone.

## ESI client

`src/core/esi/client.ts` handles the ESI rules introduced in 2025:

- versionless routes with an `X-Compatibility-Date` header (`ESI_COMPATIBILITY_DATE`, check `/meta/changelog`
  before bumping it)
- `ETag` / `If-None-Match` revalidation and `Expires`-based caching in the `esi_cache` table, so jobs can run on a
  timer without spending rate-limit tokens
- `X-Pages` pagination
- back-off when the legacy error budget runs low (`X-ESI-Error-Limit-*`) and per rate-limit group on `429`
  (`Retry-After`, `X-Ratelimit-Group`)
- one automatic token refresh on `401`; `403` raises `EsiForbiddenError` (missing scope or in-game role)

Tokens are refreshed in `src/core/esi/tokens.ts` under a row lock; `invalid_grant` marks the token invalid so the
pilot sees "Re-authorise".

## Sync engine

Jobs are declared with an owner type:

| Owner         | Rows planned for                                                             |
| ------------- | ---------------------------------------------------------------------------- |
| `character`   | every character with an active token that has the job's scopes               |
| `corporation` | the home corporation, if at least one member token has the scopes           |
| `global`      | one row                                                                      |

The worker re-plans every 30 s (new tokens get rows, revoked ones are disabled), claims due rows with
`FOR UPDATE SKIP LOCKED` (several workers are safe), and records the outcome on the row: next run (at least the job
interval, later if ESI's `Expires` says so), status, summary, duration, error, exponential back-off. Corporation jobs
try characters that hold the preferred in-game role first and fall back to the next character on `403`.

Current jobs:

| Job                              | Interval | Purpose                                                    |
| -------------------------------- | -------- | ---------------------------------------------------------- |
| `core.server-status`             | 5 min    | Tranquility player count                                   |
| `core.affiliations`              | 1 h      | Character corp/alliance changes                            |
| `core.character-roles`           | 1 h      | In-game roles (picks the right token for corp jobs)        |
| `core.corporation-members`       | 1 h      | Corp roster for the member audit                           |
| `core.market-prices`             | 1 h      | ESI average + Jita 4-4 buy/sell, valuations, daily history |
| `core.housekeeping`              | 6 h      | Expired sessions and cache entries                         |
| `mining.character-ledger`        | 15 min   | Personal mining ledgers                                    |
| `mining.corporation-observers`   | 1 h      | Moon-refinery observer ledgers (Accountant)                |
| `mining.corporation-structures`  | 6 h      | Refinery names and locations (Station Manager)             |

## Mining data model

- `mining_character_ledger` — one row per character, day, system, ore (ESI aggregates per day; rows are upserted).
- `mining_observer_ledger` — one row per refinery, character, day, ore; includes pilots outside the corporation.
- The **combined** view adds observer rows only when the same character/day/ore is not already in a personal ledger,
  so moon mining by registered members is never counted twice.
- **Corporation-wide views** include characters currently in the home corporation and refineries owned by it —
  guests from other corporations or a previous home corporation's data never show up. A member's own view always
  includes all of their characters. Until a home corporation is set, everyone sees only their own characters.
- Values come from `type_values` (current) or `type_value_history` (price on the day mined). Raw ore without its own
  market falls back to its compressed variant (by portion size), then the ESI average and adjusted prices.

ESI keeps 30 days of ledger history; Keystar keeps everything it has synced.

## Security notes

- Refresh/access tokens are encrypted with AES-256-GCM using keys derived from `APP_SECRET` via HKDF (separate keys
  for tokens and OAuth state).
- Cookies are `HttpOnly`, `SameSite=Lax`, and `Secure` when `APP_URL` is https.
- Every server action re-checks permissions; members' queries are scoped to their own character IDs in SQL.
- CSV export neutralises spreadsheet formulas; security headers are set in `next.config.ts` and Caddy.
- Administrative actions are written to the audit log.
