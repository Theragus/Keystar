# Changelog

All notable changes to Keystar. Versions follow [Semantic Versioning](https://semver.org/); while Keystar is below
1.0, new features bump the patch version. Releasing is described in [docs/releasing.md](docs/releasing.md).

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
