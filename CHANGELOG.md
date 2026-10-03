# Changelog

All notable changes to Keystar. Versions follow [Semantic Versioning](https://semver.org/); while Keystar is below
1.0, new features bump the patch version. Releasing is described in [docs/releasing.md](docs/releasing.md).

## [0.1.2] - 2026-10-03

### Added

- **Threat intel** (Combat → Threat Intel): paste local, a fleet composition, chat lines or names, optionally with a
  d-scan, and get:
  - corporations, standings and **history with us** at once: kills on us, losses to us, the hulls they flew against
    us, and the fights from our killboard with what they brought, who else was there and how it went;
  - a **threat score** per pilot from zKillboard, filled in live: statistics for everyone first, then each pilot's
    newest killmails (most dangerous first). Scores are weighted toward recent activity, explained in eight
    dimensions and damped for pilots who are not active now; tags such as cyno (from loss fits), hunter, tackle,
    capital, gate camper and ganker; the latest kills and losses and "last seen flying …" for every pilot;
  - a group view (tiers, likely composition, roles, pilots who fly together), d-scan matching, a pilot page
    (latest kills, ships, activity heatmap, fights with us, wingmen, corporation history);
  - a **briefing** per scan, pilot **dossiers** and **d-scan reads** written by Claude when `ANTHROPIC_API_KEY` is
    set (model `INTEL_MODEL`, default `claude-sonnet-5-5`; capped at 20 calls per user and 120 per instance an
    hour), otherwise from templates;
  - shareable scan links and a corp-wide **recently seen hostiles** feed.
- Optional corporation scopes `esi-corporations.read_contacts.v1` and `esi-alliances.read_contacts.v1` for blues and
  reds in threat intel. Add them to the EVE application and re-link a character with corporation access.
- New permissions **Use threat intel**, **Use Claude for intel** (both members by default) and **Manage threat
  intel** (directors).

### Fixed

- The ESI client no longer pauses for a second after responses without error-limit headers.
- A sync job triggered while it is running now runs again right after instead of waiting for its next interval.
- Looking up ship or module types no longer fetches every type of their group (only ores, ice and gas need that).

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
