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
  during sign-in and for public lookups a user asks for (the ore field estimator and the appraisal resolving and
  pricing item types they haven't seen before).
- The **worker** owns all background ESI traffic and token refreshes, and also pulls public killmails from
  zKillboard and (optionally) asks the Claude API to write the killboard's weekly situation report.

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
    killboard/         zKillboard client and sync, combat aggregates, situation report (Claude or template), UI
    trade/             appraisal: paste parser, name resolution, Jita pricing, saved shareable snapshots
    wallet/            opt-in character wallet transactions (raw data used by the mining P&L)
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

**Optional scopes.** A module can mark a scope `optional` (e.g. wallet read for the mining P&L): it is never part of
the member or corporation scope sets and never shown as missing. A user enables it per character; the link
(`/auth/login?intent=link&with=<scope>`) is built by `reauthorizeHref()` in `src/core/modules/registry.ts`, which also
re-requests the corporation and optional scopes the character already holds, because EVE replaces a token's scopes
on every login. Re-linking a character through the generic "Link a character" or `/join` therefore drops optional
scopes (the P&L settings then show wallet import as off; imported history is kept).

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
| `mining.character-ledger`        | 15 min   | Personal mining ledgers; records mining activity windows   |
| `mining.corporation-observers`   | 1 h      | Moon-refinery observer ledgers (Accountant)                |
| `mining.corporation-structures`  | 6 h      | Refinery names and locations (Station Manager)             |
| `killboard.zkill-sync`           | 1 h      | Home corporation kills/losses from zKillboard (no token)   |
| `killboard.situation-report`     | 1 h      | Writes the weekly situation report once a week has closed  |
| `wallet.character-transactions`  | 1 h      | Market transactions of characters that opted in to wallets |

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

## Mining P&L

A personal income/expense sheet (Industry → Mining P&L), only ever showing the signed-in account's own characters,
whatever corporation-wide permissions the user has (`mining.pnl`, default member).

- **Income** reuses the mining `ledger` CTE (own characters, combined sources, the corporation's valuation setting) and
  applies the account's income rate (`mining_pnl_settings`, e.g. 90% for buyback sellers) unless a per-ore price rule
  (`mining_pnl_price_rules`, optional date range, latest start wins) sets the price.
- **Wallet import** is opt-in per character (optional `esi-wallet.read_character_wallet.v1` scope). The wallet job
  pages back with `from_id` until it reaches stored transactions and stores personal transactions in
  `wallet_transactions` with the owning account (`user_id`), so wallet data never follows a sold character and is
  deleted with the account or when the character is removed.
- **Expenses**: buys are auto-tagged by item group/type (`src/modules/mining/pnl/categories.ts`, with an SQL twin):
  mining crystals, Heavy Water, Mining Foreman burst charges, mining drones, mining hulls and fittings. A tagged
  purchase is *suggested* until the user includes it, or counted automatically for characters where the user
  switched that on (`mining_pnl_characters`, off by default); the user's category/include decisions
  (`mining_pnl_tx_overrides`) always win. Everything else stays out unless tagged. Manual entries
  (`mining_pnl_entries`) cover PLEX/Omega, contracts etc. and can be spread evenly over up to a year.
- **Sale hints**: wallet sells of a mined ore or its compressed variant, converted to raw units with the valuation's
  compression ratio, offered as one-click price rules.
- **Active hours / ISK per hour**: the ledger job compares each fresh ESI snapshot with the stored ledger in one
  transaction and records the window in which a character's quantities grew (`mining_activity`, per ledger day and
  ore; `mining_activity_coverage` per character). Observation time is ESI's `Last-Modified` when it is a plausible
  snapshot time; snapshots from Keystar's own cache are ignored; gaps over 40 minutes are not guessed at; growth
  within 35 minutes of the previous growth continues the session. Hours are unions of those windows (`range_agg`):
  wall-clock across characters, and per character and activity. ISK/h values the measured growth itself, so it only
  covers mining since the feature was deployed. Expenses are split across activities by active hours when measured
  activity covers ≥ 90% of income, otherwise by m³.

## Killboard

- `src/modules/killboard/zkill.ts` is the only code that talks to zKillboard: a descriptive User-Agent (with
  `ESI_CONTACT`), gzip, requests spaced ≥ 1.1 s apart, retries on 429/5xx. zKillboard caches API responses for an
  hour, so the sync runs hourly.
- The first sync imports 90 days month by month (`/corporationID/{id}/year/{y}/month/{m}/`); afterwards an hourly
  7-day sweep (`/pastSeconds/604800/`) also catches killmails zKillboard receives late. A gap longer than six days,
  or a new home corporation, triggers another backfill.
- `killmails` stores the victim and zKillboard's values (total/fitted/destroyed/dropped, points, solo, npc, awox,
  labels); `killmail_attackers` stores every attacker. Corporation ids are the ones recorded at the time of the kill.
- A **kill** is a killmail with a home-corporation attacker and a victim from another corporation; a **loss** is a
  killmail whose victim flew for the home corporation (an awox counts as a loss only). ISK counts in full for every
  pilot and hull involved, as on zKillboard. Week-over-week figures compare the last 7 complete EVE days with the 7
  days before.
- **Situation report**: once a 7-day window has closed (plus a 2-hour grace period for late killmails),
  `killboard.situation-report` gathers the week's facts (totals, leaders, movers, hot systems, biggest kill and
  loss), and Claude writes the report via structured outputs (JSON validated with zod) when `ANTHROPIC_API_KEY` is
  set; otherwise, or if the call fails, a deterministic template writes it. Reports use a tiny inline markup
  (`**bold**`, `{+good}`, `{-bad}`, `{@Pilot}`) rendered as React text — model output is never rendered as HTML.
  Reports are stored with the facts they were written from (`killboard_reports`).

## Security notes

- Refresh/access tokens are encrypted with AES-256-GCM using keys derived from `APP_SECRET` via HKDF (separate keys
  for tokens and OAuth state).
- Cookies are `HttpOnly`, `SameSite=Lax`, and `Secure` when `APP_URL` is https.
- Every server action re-checks permissions; members' queries are scoped to their own character IDs in SQL.
- CSV export neutralises spreadsheet formulas; security headers are set in `next.config.ts` and Caddy.
- Administrative actions are written to the audit log.

## Appraisal

- `src/modules/trade/appraisal/parse.ts` turns a paste into candidate (name, quantity) pairs per line: tab
  separated inventory/contract/survey copies (English or German numbers), d-scan, EFT, killmail lines and free text
  ("x 10", "10x", "10 Name", "Name 10"). Ambiguous lines yield several candidates in order of preference.
- Names resolve against `eve_types`, then ESI `POST /universe/ids` (case-insensitive exact matches); new types are
  stored through the resolver. Prices are the Jita 4-4 `type_values`; types without a value, or older than two
  hours, are priced live with the same code as the hourly price job, which then keeps them fresh.
- An appraisal is a snapshot (items, unit prices, totals, unrecognised lines, input) in `appraisals`, opened by an
  unguessable id. "Appraise again" creates a new snapshot at current prices.
