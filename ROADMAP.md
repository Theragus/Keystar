# Keystar roadmap

Features that are planned or being considered. Each larger feature gets its own
branch and is built as a module (see [docs/modules.md](docs/modules.md)), so it
brings its own ESI scopes, permissions, sync jobs and pages without touching the
core.

Status: ✅ done · 🚧 in progress · 📝 planned · 💡 idea

## Foundation (MVP)

- ✅ EVE SSO login (OAuth2 + PKCE, JWT validation), multiple characters per account
- ✅ ESI token management ("ESI keys"): encrypted refresh tokens, scope tracking, re-authorisation, shareable `/join` registration link
- ✅ Keystar roles: Admin, Director, Contributor, Viewer, Member, Guest — with a per-permission override matrix
- ✅ Background sync worker: ESI caching (ETag/Expires), pagination, error-limit and rate-limit back-off, compatibility date
- ✅ Member audit: in-game roster vs registered characters, missing/revoked ESI
- ✅ Self-hosting: Docker Compose (Postgres, app, worker, Caddy HTTPS)
- ✅ English and German UI: browser language detection (English fallback), language switch in the sidebar footer, localised number and date formats
- 💡 German item, system and ship names (ESI `language=de`) for German-speaking corporations
- 💡 Situation report in the reader's language (today it is written once, in English)

## Mining

- ✅ Personal mining ledgers and corporation moon-observer ledgers, de-duplicated
- ✅ Filters: date range, members, ore class, ore type, system, data source
- ✅ Daily value / volume / units, resource mix, moon rarity, top miners (pilots or characters), ore and system breakdowns
- ✅ Valuation from Jita 4-4 buy/sell/split or ESI average, current or historical prices
- ✅ Ledger table and CSV export
- ✅ **Ore field estimator** — paste a survey scanner result and get the total value of the field, grouped by ore type and sub-grouped by grade (e.g. Scordite / II-Grade / III-Grade). Handles German and English number formats.
- 📝 **Personal mining P&L (income / expense sheet)** — for pilots mining with alts:
  - *Income*: ore mined by your own characters, valued automatically from the mining ledger (same price source as the dashboard), optionally overridden by actual sale prices.
  - *Expenses*: imported from your characters' wallet transactions (`esi-wallet.read_character_wallet.v1`). Purchases are auto-tagged by item group — mining crystals, heavy water / Orca fuel, mining foreman burst charges, drones, ship replacements — so mining costs are separated from unrelated shopping. Anything else stays out unless you tag it; manual entries cover costs ESI can't see (e.g. PLEX/Omega for alts, contracts).
  - *Breakdown*: net profit per day / week / month, ISK per hour (from ledger activity), cost per m³, per-character and per-activity (ore / moon / ice) splits.
- 💡 Mining tax / buyback calculations per member
- 💡 Moon extraction timers (`/corporation/{id}/mining/extractions`, Station_Manager)

## Combat

- ✅ **Killboard** for the home corporation, built from zKillboard (no ESI scopes needed) — brought over from the
  Lucky.Punch performance dashboard:
  - Kills, losses, ISK destroyed / lost, ISK efficiency with week-over-week changes, for any date range
  - Weekly **situation report**, written by Claude (optional API key) or from a template
  - Top systems by kills and losses, ISK breakdown, recent activity with zKillboard links
  - Most effective / most used / most lost ships and pilot efficiency (final blows, solo, net ISK), all sortable
- ✅ **Live fleet** from the ESI fleet endpoints (`esi-fleets.read_fleet.v1`): the fleet boss starts tracking on the
  fleet page and the worker reads the fleet every 15 seconds:
  - Members by wing and squad with ship, system and role; composition by ship class and hull; joins and leaves
  - Past fleets with duration and participants
- 📝 Fleet doctrine compliance check (allowed hulls per doctrine) and logi/DPS/tackle counts
- 📝 Fleet participation history per pilot (PAP-style tracking)
- 💡 Post the weekly situation report to Discord
- 💡 Doctrine tags for hulls and per-doctrine performance
- 💡 Track additional corporations or the alliance alongside the home corporation

## Trade

- ✅ **Appraisal**: paste cargo, contracts, fits, d-scans or lists; Jita 4-4 buy/sell/split, volume, percentage
  price, shareable links, "appraise again" at current prices
- 💡 More markets (Amarr, Dodixie, Rens, Hek) and a market selector
- 💡 Corp buyback: a configured percentage per item group, contract instructions for members

## Planned modules

### 📝 Threat intelligence (own branch, major feature)

Paste one pilot name or a whole list (local, d-scan names, fleet) and get a
**threat score per pilot**. Existing tools felt unreliable and too shallow for
experienced PvP pilots, so this should dig much deeper into zKillboard:

- Resolve names → character IDs via ESI `/universe/ids`, then pull zKillboard history (kills *and* losses), with caching and polite rate limiting.
- Score dimensions instead of one opaque number, each explained:
  - recent activity (last 7/30/90 days) vs. lifetime
  - solo vs. small-gang vs. blob behaviour (attackers per kill, final blows)
  - ship classes and fits actually flown (cyno, tackle, recon, logi, capital/blops usage)
  - where and when they fight (region/system, timezone heatmap)
  - danger ratio, ISK efficiency, average kill value
  - known associates / fleet-mates (who they fly with), corporation/alliance history (ESI)
- Group view: aggregate threat for a list, likely fleet composition, shared associates.
- Show the evidence (recent notable kills with links), not just the score, so a veteran can sanity-check it.
- Requires no ESI scopes (public data). Reuse the killboard's zKillboard client and killmail tables
  (`src/modules/killboard/zkill.ts`, `killmails`, `killmail_attackers`).

### 📝 Skills & corporation skill plans

- Character skills and queues (`esi-skills.read_skills.v1`, `esi-skills.read_skillqueue.v1`).
- Corporation skill plans: define plans/doctrines, see who can fly what and what is missing.
- Training progress and queue-empty warnings.

### 📝 Assets / inventory

- Look up inventory for specific players (`esi-assets.read_assets.v1`) and corporation hangars (`esi-assets.read_corporation_assets.v1`, Director).
- Search by item across all members, with location names and valuation (reuses market prices).

### 📝 Wallets & corporation finances

- Corporation divisions, journal and transactions (`esi-wallet.read_corporation_wallets.v1`, Accountant/Junior Accountant).
- Personal wallets per character (`esi-wallet.read_character_wallet.v1`), visible to the owner and permitted roles.
- Income/expense breakdowns (bounties, mining tax, market, industry).

## Platform ideas

- 💡 Discord notifications (sync failures, revoked tokens, new registrations)
- 💡 Saved views / dashboards per user
- 💡 Custom roles in addition to the built-in hierarchy
- 💡 SDE import for reprocessing values (refined ore value) and offline type data
