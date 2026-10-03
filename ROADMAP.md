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
- ✅ **Personal mining P&L (income / expense sheet)** — for pilots mining with alts:
  - *Income*: ore mined by your own characters, valued like the dashboard, adjusted by a buyback % and per-ore price
    rules; realised prices from your wallet sells are offered as one-click rules.
  - *Expenses*: opt-in wallet import per character (`esi-wallet.read_character_wallet.v1`). Purchases are auto-tagged
    by item group — mining crystals, Heavy Water, mining foreman burst charges, mining drones, mining hulls and
    fittings — and only *suggested* until you include them (or switch on automatic counting per character); anything
    else stays out unless you tag it. Manual entries (optionally spread over up to a year) cover PLEX/Omega for alts,
    contracts and other costs ESI can't see.
  - *Breakdown*: net profit per day / week / month, ISK per hour from measured ledger activity (wall-clock and per
    character), cost per m³, per-character and per-activity (ore / moon / ice / gas) splits.
- 💡 Mining P&L: recurring manual costs (monthly Omega), contract import for buyback sales
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

## Threat intelligence

- ✅ **Scans**: paste local, a fleet composition, chat lines or names (up to 500 pilots); names and affiliations from
  ESI, shareable scan links, rescans, a corp-wide "recently seen hostiles" feed
- ✅ **Friend or foe** from the home corporation/alliance and their ESI contacts (optional contact scopes)
- ✅ **History with us** from the killboard: kills on us, losses to us, hulls flown against us, and fights grouped by
  system and time with what they brought, who else came and how it went
- ✅ **Threat scores** from zKillboard statistics and each pilot's newest killmails, weighted toward recent activity:
  eight explained dimensions, a recency gate, role tags (cyno from loss fits, hunter, tackle, capital, gate camper,
  ganker, logi, FC …), timezone heatmap, wingmen, corporation history, latest kills strip and "last seen flying"
- ✅ **Group view**: tiers, likely composition, roles, pilots who fly together
- ✅ **D-scan matching**: which scanned pilot probably flies which hull on scan
- ✅ **Claude** (optional API key, reused from the killboard): a briefing per scan, dossiers and d-scan reads on
  request, from computed facts only; templates otherwise
- 💡 Live watch: zKillboard's R2Z2 feed to flag kills by recently seen hostiles near the home systems
- 💡 History with alliance mates, not only the home corporation (needs the alliance killboard)
- 💡 Manual red/blue lists and notes per pilot, shared in the corporation
- 💡 Ask Claude follow-up questions about a scan

## Trade

- ✅ **Appraisal**: paste cargo, contracts, fits, d-scans or lists; Jita 4-4 buy/sell/split, volume, percentage
  price, shareable links, "appraise again" at current prices
- 💡 More markets (Amarr, Dodixie, Rens, Hek) and a market selector
- 💡 Corp buyback: a configured percentage per item group, contract instructions for members

## Planned modules

### 📝 Wormhole mapping

Proposal: [docs/proposals/wormhole-mapping.md](docs/proposals/wormhole-mapping.md).

- Shared chain maps in the spirit of Pathfinder: systems with class, effect and statics; connections with wormhole
  type, lifetime band and estimated time left, mass state and ship size.
- Pan/zoom/drag canvas with a tree layout from the home system that stays readable on its own, plus a list view.
- Opt-in location tracking (`esi-location.*`) that maps jumps automatically and shows pilots on the map.
- Later: signatures, mass log and rolling, routes through the chain (`POST /route` with custom connections), kills in chain.

### 📝 Skills & corporation skill plans

- Character skills and queues (`esi-skills.read_skills.v1`, `esi-skills.read_skillqueue.v1`).
- Corporation skill plans: define plans/doctrines, see who can fly what and what is missing.
- Training progress and queue-empty warnings.

### 📝 Assets / inventory

- Look up inventory for specific players (`esi-assets.read_assets.v1`) and corporation hangars (`esi-assets.read_corporation_assets.v1`, Director).
- Search by item across all members, with location names and valuation (reuses market prices).

### 📝 Wallets & corporation finances

- Corporation divisions, journal and transactions (`esi-wallet.read_corporation_wallets.v1`, Accountant/Junior Accountant).
- 🚧 Personal wallets per character (`esi-wallet.read_character_wallet.v1`): opt-in transaction import exists (used
  by the mining P&L); journal, balances and a wallet page are still to come.
- Income/expense breakdowns (bounties, mining tax, market, industry).

## Platform ideas

- 💡 Discord notifications (sync failures, revoked tokens, new registrations)
- 💡 Saved views / dashboards per user
- 💡 Custom roles in addition to the built-in hierarchy
- 💡 SDE import for reprocessing values (refined ore value) and offline type data
