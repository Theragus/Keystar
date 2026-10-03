# Proposal: Wormhole mapping

Status: **proposal** — nothing here is built yet. This document describes a `wormholes` module for Keystar: a
shared, live map of the corporation's wormhole chain, in the spirit of [Pathfinder], scoped to an MVP that can grow.

![Mockup of the map: a home C4 on the left, its chain laid out in depth columns, a selected EOL connection with its
details in the side panel](wormhole-mapping-mockup.svg)

## Why

Wormhole corporations keep a chain map open all the time: which holes lead where, how long they have left, how much
mass they can take, where the pilots are. The established tools are aging — Pathfinder (PHP/MySQL) has had no
release since 2020 and Tripwire's public instance closed in 2024 ([comparison][compare]) — and they live outside
the corporation's dashboard, with their own logins and their own ESI tokens. Keystar already has SSO, per-character
ESI tokens, roles, a worker that polls ESI every few seconds (live fleet) and the corporation's killboard and threat
intel. A chain map fits naturally on top of that.

## What Pathfinder does (for reference)

Pathfinder's features, roughly in order of how much day-to-day value they carry:

1. **Map** of systems and connections, freely dragged; shared per character, corporation or alliance.
2. **Auto-mapping**: with location tracking on, a jump adds the new system and connects it to the previous one.
3. **Connection state**: wormhole type, end of life (EOL), mass reduced/critical, frigate-only, set by right-click.
4. **System info**: class, effect with its modifiers, statics, security; status tags (empty, occupied, hostile).
5. **Pilots on the map**: who is where, in what ship.
6. **Signatures**: paste the probe scanner, keep the list per system, link a signature to a connection.
7. Route finder (to trade hubs, through the chain), killboard per system, jump/mass log, rally points.

This proposal builds 1–5 (Phases 1–2) and leaves 6–7 for later phases, most of which can reuse code Keystar already
has (paste parsing from threat intel and appraisal, the killboard, the ESI client).

## MVP scope

**In:**

- One or more maps per corporation, each with a home system.
- Systems with class, security, effect (with the modifier table for that class) and statics.
- Connections with wormhole type, lifetime state and an estimated time left, mass state and maximum ship size.
- A pan/zoom/drag canvas with an automatic layout, plus a list view of the same data.
- Several people editing the same map, seeing each other's changes within a few seconds.
- **Phase 2:** opt-in location tracking that maps jumps automatically and shows pilots on the map.

**Out (later phases):** signatures, mass logging per jump, rolling calculator, routes to trade hubs, kills in chain,
Thera/Turnur connections from EVE-Scout, alliance-wide maps, in-game waypoint actions.

## Data sources

### Static wormhole data

| Data                                       | In CCP's SDE? | Source                                                                                     |
| ------------------------------------------ | ------------- | ------------------------------------------------------------------------------------------ |
| System class (C1–C6, C13, Thera, Drifters) | Yes           | `mapSolarSystems.jsonl` / `mapConstellations` / `mapRegions` → `wormholeClassID`            |
| System effect (Wolf-Rayet, Pulsar …)       | Yes           | `mapSecondarySuns.jsonl` → `effectBeaconTypeID` (type name = effect)                        |
| Effect modifiers per class                 | Yes           | dogma attributes of the effect beacon types                                                |
| Wormhole types (B274, K162 …)              | Yes           | `types` (group "Wormhole") + dogma: target class, max lifetime, total mass, mass per jump    |
| **Statics per system**                     | **No**        | community data — [anoik.is] `static/static.json`                                           |
| Stargate adjacency (k-space)               | Yes           | `mapStargates.jsonl` (needed in Phase 2 to tell gate jumps from wormhole jumps)             |

anoik.is serves everything in one file (`https://anoik.is/static/static.json`, dataset version 11 at the time of
writing): 2,604 J-space systems with class, effect and statics, 90 wormhole types with destination class, source
classes, lifetime in hours, total mass and mass per jump, and the effect modifier tables indexed by effect strength.
Its class ids match the SDE's `wormholeClassID` (1–6, 7 high-sec, 8 low-sec, 9 null-sec, 12 Thera, 13 shattered,
14–18 Drifters), so the two sources line up.

Statics exist only in community data, so the plan is:

- A generator script (`pnpm wh:data`) builds `src/modules/wormholes/data/static.json` — classes, effects and
  wormhole type attributes from the SDE (authoritative, updated with each expansion), statics from anoik.is — and
  the result is **committed**, so neither the app nor the worker calls anoik.is at runtime. It is regenerated by
  hand after an expansion, like a dependency bump.
- anoik.is publishes no licence for the file. Before shipping, ask its maintainer for permission to redistribute the
  statics and credit anoik.is in the UI (system panel) and the README. If that's not possible, the generator can take
  statics from another community dataset, or the UI can show statics as a link to the anoik.is page instead.
- K-space systems need no new data: class comes from security status (`eve_systems`, already resolved through ESI),
  Pochven from its region.

### Wormhole lifetime and mass

In-game "Show Info" gives bands, not times. The bands since the August 2025 (< 1 hour) and March 2026 (expired)
additions:

| State         | In-game band               | Remaining time |
| ------------- | -------------------------- | -------------- |
| `fresh`       | more than 1 day            | > 24 h         |
| `lt1d`        | less than 1 day            | ≤ 24 h         |
| `lt4h` (EOL)  | less than 4 hours          | ≤ 4 h          |
| `lt1h`        | less than 1 hour           | ≤ 1 h          |
| `closing`     | expired, closure imminent  | ~0             |

(Check the exact client wording when building the picker; the labels above are the bands, not quotes.)

Mass: `stable` (> 50 %), `reduced` (50–10 %), `critical` (< 10 %). Maximum ship size from the type's mass per
jump: S ≤ 5 Mt (frigates), M ≤ 62 Mt, L ≤ 375 Mt, XL ≥ 1,000 Mt.

**Time left** is shown as an upper bound, because nobody knows when a hole spawned:

```
upper = min( typeLifetime − (now − firstSeenAt),         // when we first saw it, it was at most new
             bandUpperBound(state) − (now − stateSetAt) ) // when someone last checked Show Info
```

A K162 has no lifetime of its own until someone sets the type from the other side; until then only the band
counts. When `upper` reaches zero the connection is marked collapsed, fades out, and is removed after a grace period
(configurable, default 1 h). Systems left without connections are removed too, except the home system and systems
someone pinned.

## Data model (sketch)

```ts
// src/modules/wormholes/schema.ts — names indicative
wh_maps            id, name, home_system_id, revision bigint, created_by, created_at, archived_at
wh_map_systems     map_id, system_id, x, y, pinned bool, label text?, added_by, added_at   PK(map_id, system_id)
wh_connections     id, map_id, a_system_id, b_system_id,
                   wh_type text?, wh_type_side 'a'|'b'?,        // which end carries the type; the other is K162
                   kind 'wormhole'|'stargate'|'unknown',
                   life_state, life_set_at, mass_state, size 'S'|'M'|'L'|'XL'?,
                   first_seen_at, collapsed_at?, created_by, updated_by, updated_at
wh_trackers        character_id PK, map_id, enabled, last_system_id, last_ship_type_id, online, checked_at  (Phase 2)
wh_jumps           id, map_id, character_id, from_system_id, to_system_id, ship_type_id, at              (Phase 2)
```

- `revision` on the map is bumped in the same transaction as every change; clients poll it cheaply (see below).
- Connection rows are soft-deleted (`collapsed_at`) so the history panel can say who mapped and changed what; the
  core audit log records deletions.
- No foreign keys to `characters`, following the existing convention for history tables.

## UI

### Canvas

[React Flow] (`@xyflow/react`, MIT) for the canvas: pan, zoom, drag, selection, minimap, keyboard shortcuts and
touch support out of the box; v12 supports React 19 and server rendering. Nodes and edges are ordinary React
components, so they use the existing UI kit, Tailwind tokens and `useI18n()` texts.

Pathfinder leaves the layout entirely to its users, and busy chains turn into spaghetti. The proposal is a
**layout that stays readable without anyone tidying it**:

- **Tree from home, left to right.** A chain is almost always a tree rooted at home. Depth (jumps from home) is the
  column, so "how far out is this" is readable at a glance. Siblings are ordered by class, then name. Layout is
  computed with `d3-hierarchy`'s tidy tree (ISC licence, tiny, deterministic): the same chain always produces the
  same picture, so people can talk about "the C3 at the bottom". Loops in the chain are drawn as extra edges on top
  of a BFS spanning tree.
- **Fixed node size**, sized for the content (class badge, name, effect, statics, pilot count), and **a column gap
  wide enough for the edge label** — labels sit in the middle of the gap, never under a node.
- **New systems are placed automatically** in the next free slot of their column; nothing jumps around when
  someone else adds a system. Only "Auto-arrange" re-flows the whole map.
- **Dragging pins a node** (stored `x`, `y`, `pinned`) and snaps it to a 20 px grid. Auto-arrange leaves pinned
  nodes alone unless you pick "reset all".
- **Collapse a branch** to a single "+5 systems" chip when a chain gets long.
- **Fit to view**, **center on me**, and centring on a system picked from the search box.

### What the map shows

| Element          | Encoding                                                                                          |
| ---------------- | ------------------------------------------------------------------------------------------------- |
| System class     | badge with text (`C4`, `0.5`, `Thera`). C1–C6 are ordinal, so one lightness ramp (like moon rarity) instead of six hues; k-space uses the existing `securityColor`. |
| Effect           | name on the node; modifiers (scaled to the class's effect strength) in the side panel             |
| Statics          | `C3·C247 C2·N766` on the node                                                                     |
| Home             | ★                                                                                                 |
| Pilots           | count on the node; portraits and ships in the side panel (Phase 2)                                |
| Wormhole type    | edge label (`N766`, `K162`)                                                                        |
| Lifetime         | dash pattern (solid → long dash → dotted) **and** label text (`≤14h`, `<1d`, `EOL ≤3h`)          |
| Mass             | stroke width (thick → medium → thin) **and** label text (`½m`, `crit`)                           |
| Size             | label suffix when it isn't the default for the type's class (`S` for frigate holes)              |

Every state is written on the label, so neither colour nor line style is the only cue; the ramp and the warning
colours go through the same colour-vision validation as `src/modules/mining/class-colors.ts`.

### Editing

- **Add a system**: search box with autocomplete over the static data (J-codes and k-space names). Choosing a
  selected system as "connected to" creates the connection in the same step.
- **Connect two systems**: drag from one node's handle to another.
- **Edit a connection**: click it → side panel with the wormhole type picker (filtered to types that can spawn in
  the source system's class, from the `src` list in the static data; statics of the system listed first),
  lifetime and mass segmented controls, delete. Lifetime and mass also get keyboard shortcuts on a selected edge,
  because "mark EOL" is the most common edit.
- **Edit a system**: click it → side panel with class, effect table, statics with their destination class,
  lifetime and mass, label/notes, links to anoik.is, DOTLAN and zKillboard, pin/unpin, remove.
- **List view**: the same map as a sortable table of connections (from, to, type, time left, mass), soonest to
  collapse first. It doubles as the accessible and mobile-friendly view.

### Staying in sync

Several pilots edit one map. For the MVP:

- Edits are server actions (`assertPermission`), applied optimistically in the client, and bump `wh_maps.revision`.
- The client polls a small route handler (`GET /wormholes/maps/:id/state?since=<revision>`) every 3 s while the
  tab is visible; it answers "unchanged" with a few bytes, or the full map (a few KB even for a large chain).
- Conflicts are last-write-wins per field, which matches how people use these maps.

Later, the poll can be replaced by Server-Sent Events fed by Postgres `LISTEN/NOTIFY` without changing the data
model. (Check the route handler and streaming guides in `node_modules/next/dist/docs/` before building either —
this Next.js version differs from older ones.)

## Phase 2: location tracking

ESI exposes what's needed:

| Route                              | Scope                              | ESI cache | Use                                   |
| ---------------------------------- | ---------------------------------- | --------- | ------------------------------------- |
| `GET /characters/{id}/location`    | `esi-location.read_location.v1`    | 5 s       | system, docked station/structure      |
| `GET /characters/{id}/online`      | `esi-location.read_online.v1`      | 60 s      | skip polling while offline            |
| `GET /characters/{id}/ship`        | `esi-location.read_ship_type.v1`   | 5 s       | ship on the map; later the mass log   |

All three share the `char-location` rate limit group: **1,200 tokens per 15 minutes per application and
character**, 2 tokens per 200, 1 per 304 ([rate limiting][esi-rl]). Location every 5 s plus online every 60 s is at
most ~390 tokens per window, ship every 30 s adds ~60 — about 40 % of each character's own budget, with no effect on
other characters or other routes.

**Opt-in, like the wallet scope.** Location is sensitive, so the three scopes are `optional: true` in the manifest:
never requested from every member, enabled per character from the map page via `reauthorizeHref(..., { add })`.
On top of that, tracking has an explicit start/stop per character and map (like the live fleet tracker), and stops
by itself after the character has been offline for an hour.

**Job** `wormholes.location` (owner `character`, required scope location, interval 5 s), modelled on
`fleet.live`: characters without an active tracker get a cheap database check once a day; offline characters are
re-checked every 60 s. On a system change from A to B it:

1. Ignores it if A is unknown (first poll) or the character is docked in both (clone jump).
2. Treats it as a **stargate jump** if A and B are adjacent in the stargate graph. The jump is only added to the map
   when A is already on it — a chain exit into k-space shows up, a trip to Jita does not.
3. Treats it as a **wormhole jump** if either side is J-space (or Thera/Pochven/Turnur exits), or A and B are not
   adjacent and the ship isn't jump-capable. B is added next to A and a connection created (type unknown, `fresh`)
   unless one exists. If the character jumped through a static and B's class matches that static's destination, the
   type is pre-filled.
4. Otherwise (a jump drive, a bridge, a pod express home) records the jump but doesn't map it; the side panel
   offers "add as connection" for the cases the heuristic got wrong.

Every jump is stored in `wh_jumps` (kept 30 days) — the raw material for the mass log in Phase 3. Pilots on the map
are the tracked characters' current systems, visible only to users who can view the map.

## Module shape

Following `docs/modules.md`:

```
src/modules/wormholes/
  module.ts           manifest: optional location scopes, permissions, nav item under a new "Exploration" section
  schema.ts           tables above (+ export from src/core/db/index.ts, pnpm db:generate --name wormholes)
  data/static.json    generated static data (committed)
  static.ts           typed lookups: systemInfo(id), whType(code), effectFor(effect, class), canSpawnIn(type, class)
  lifetime.ts         band/time-left maths (pure, unit-tested)
  layout.ts           tree layout + slot placement (pure, unit-tested)
  jumps.ts            jump classification (pure, unit-tested)
  maps.ts             queries and mutations (bumps revision)
  jobs.ts             wormholes.location, wormholes.housekeeping (collapse expired, prune jumps)
  components/         map-canvas, system-node, connection-edge, side panels, list view
src/app/(app)/wormholes/          map list, map page, state route handler, server actions
src/i18n/messages/{en,de}/wormholes.ts
scripts/wh-data.mjs               generator (SDE zip + anoik.is → data/static.json)
```

Permissions (defaults in brackets):

| Key                     | Allows                                         | Default   |
| ----------------------- | ---------------------------------------------- | --------- |
| `wormholes.view`        | see maps, systems, connections, pilots         | member    |
| `wormholes.edit`        | add/remove systems and connections, set states | member    |
| `wormholes.track`       | start location tracking on own characters      | member    |
| `wormholes.manage`      | create, rename, archive maps; set home         | director  |

New dependencies: `@xyflow/react` (MIT) and `d3-hierarchy` (ISC), both client-side and only loaded on the map page.

## Phases

| Phase | Scope                                                                                                     | Rough size |
| ----- | --------------------------------------------------------------------------------------------------------- | ---------- |
| 0     | Static data generator; system lookup page (J-code → class, effect table, statics). Useful on its own.      | S          |
| 1     | **MVP map**: schema, canvas, layout, editing, list view, lifetime maths, polling sync, housekeeping job   | L          |
| 2     | Location tracking: optional scopes, tracker, jump job, auto-mapping, pilots on the map                     | M          |
| 3     | Signatures (paste the probe scanner, link to connections), mass log from `wh_jumps`, rolling calculator   | M          |
| 4     | Routes: `POST /route` now accepts up to 1,000 extra `connections`, so the chain's wormholes can be passed in to get jumps from each exit to Jita / home / a staging system; kills in chain from the killboard and zKillboard; EVE-Scout Thera/Turnur; SSE | M |

## Testing

- Unit tests for the pure parts: lifetime bounds, size from mass, type filtering by class, jump classification
  (gate / wormhole / drive / clone), layout determinism and slot placement.
- A fixture of the generated static data (a handful of systems and types) so tests don't depend on the full file.
- An integration test for map mutations bumping the revision and the state handler's "unchanged" answer.
- Demo data: a seeded chain (`pnpm demo:seed`) so the map can be tried without wormhole pilots.

## Open questions

1. **One map or many?** The MVP supports several maps per corporation; is a single "home chain" map enough to
   start with, which would simplify the UI?
2. **Private maps** per pilot (scouting alts)? Easy to add (`owner_user_id`), but every query then needs the
   visibility check.
3. **k-space connections**: map gate jumps out of chain exits (as proposed), or only wormholes?
4. **anoik.is statics**: OK to ask the maintainer, or prefer linking out?
5. **Location retention**: 30 days of jumps — shorter? Only while tracking is on (as proposed)?

## Sources

- [Pathfinder] (exodus4d) — features and workflow, also via the [All-Out guide][allout]
- [Wormhole mapper comparison 2026][compare] — maintenance state of Pathfinder, Tripwire, Wanderer, Nexum
- [anoik.is] — system and wormhole data (`/static/static.json`)
- [EVE SDE][sde] and its [schema][sde-schema] — `wormholeClassID`, `mapSecondarySuns`, stargates
- [ESI rate limiting][esi-rl] and the [rate limit groups][esi-groups]; ESI OpenAPI spec (`/meta/openapi.json`) for
  the location, online, ship and route schemas
- [POST /route upgrade][route] — custom `connections`, limit raised to 1,000
- [Wormhole attributes (EVE University)][uni] — lifetime and mass bands
- [React Flow][React Flow]

[Pathfinder]: https://github.com/exodus4d/pathfinder
[allout]: https://all-out.github.io/guides/pathfinder/
[compare]: https://eve-nexum.com/compare/
[anoik.is]: https://anoik.is/systems
[sde]: https://developers.eveonline.com/docs/services/static-data/
[sde-schema]: https://sde.riftforeve.online/
[esi-rl]: https://developers.eveonline.com/docs/services/esi/rate-limiting/
[esi-groups]: https://gist.github.com/ErikKalkoken/63bf977d1fb6f9bc2de8c2d2776a885a
[route]: https://developers.eveonline.com/blog/route-to-the-future-upgrading-the-route-route
[uni]: https://wiki.eveuniversity.org/Wormhole_attributes
[React Flow]: https://reactflow.dev/
