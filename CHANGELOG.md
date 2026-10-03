# Changelog

All notable changes to Keystar. Versions follow [Semantic Versioning](https://semver.org/); while Keystar is below
1.0, new features bump the patch version. Releasing is described in [docs/releasing.md](docs/releasing.md).

## [0.1.3] - 2026-10-03

### Added

- **Mining P&L** (Industry → Mining P&L): a personal income/expense sheet for pilots mining with alts, visible only
  to the account itself.
  - Income: ore mined by your characters, valued like the mining dashboard, with an optional buyback % and per-ore
    price rules (with date ranges); realised prices from your wallet sells can be applied with one click.
  - Expenses: opt-in wallet import per character. Purchases of mining crystals, Heavy Water, Mining Foreman burst
    charges, mining drones and mining hulls/fittings are auto-tagged and only suggested until you include them;
    "count tagged purchases automatically" can be switched on per character (off by default). Other purchases stay
    out unless you tag them. Manual costs (PLEX/Omega, contracts …) can be spread over up to a year.
  - Net profit per day / week / month, ISK per hour (gross and net), cost per m³, and splits per character and per
    activity (ore / moon / ice / gas).
- **Mining activity tracking**: the personal ledger sync now records when each character's ledger grows, which gives
  active hours (wall-clock across alts and per character) from now on.
- **Optional ESI scopes**: modules can declare scopes that users enable per character instead of every member being
  asked for them. The first is wallet read access; enable `esi-wallet.read_character_wallet.v1` on your EVE
  application (see docs/deployment.md).

### Changed

- "Re-authorise" on My Characters keeps the character's corporation and optional scopes instead of requesting only
  the member scopes. When another EVE login drops an opt-in scope anyway, My Characters says so and offers to turn
  it back on.
- The personal mining ledger sync no longer re-applies a snapshot from Keystar's own cache or an older snapshot.

### Fixed

- Resolving new item types (appraisal, killboard, wallet) no longer fetches every type of their group from ESI; only
  ore, ice and gas groups are scanned for compressed variants.

## [0.1.2] - 2026-10-02

### Changed

- Larger small text across the app for readability at 100% zoom on large monitors: section titles (e.g. "Top
  pilots") go from 11px to 13px, field labels and table headers from 9–11px to 12px, badges and chips to 11px, and
  subtitles and hints from 12px to 13px. The sizes are now a shared scale (`text-3xs`, `text-2xs`, `text-xs`)
  defined in `globals.css` instead of one-off values.
- KPI tiles keep their values aligned across a row when a hint wraps onto a second line.

## [0.1.1] - 2026-10-02

### Added

- **Killboard** (Combat → Killboard): the home corporation's kills and losses from zKillboard, with week-over-week
  KPIs, a weekly situation report (written by Claude with an optional `ANTHROPIC_API_KEY`, otherwise from a
  template), top pilots with the period's MVP and awards, pilot efficiency, top systems, ISK breakdown, recent
  activity and ship statistics.
- **Appraisal** (Trade → Appraisal): paste cargo, inventory, contracts, EFT fittings, d-scans, killmails or item
  lists and get Jita 4-4 buy/sell/split values, volume and a percentage price, saved as a shareable link.
- **Releases**: tagged versions with Docker images on `ghcr.io/theragus/keystar`; `docker compose pull` updates
  without building on the server. The version is shown in the sidebar and in `/api/health`.

### Changed

- The dashboard leads with combat: kills, ISK destroyed and efficiency for 30 days, a kills-over-time chart, the
  latest kills and losses and the MVP. Mining is down to one tile.
- The corporation card shows active pilots (on a killmail in the last 30 days) and the member count instead of
  "pilots in game".

### Fixed

- Native dropdowns (e.g. Settings → Permissions) showed light text on a white list in Edge and Chrome on Windows.
- The killboard now imports right after the home corporation is set or changed instead of up to an hour later.

## [0.1.0] - 2026-10-02

First version (not published as an image): EVE SSO login, ESI token management, Keystar roles and permissions, the
background sync worker, the mining module with moon observers and the ore field estimator, the first-start
walkthrough and the Docker Compose deployment.
