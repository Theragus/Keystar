# Universe map

Combat → Map renders the real three-dimensional positions from CCP's Static Data Export.
The bundled dataset includes all 8,490 named systems with available positions in the export downloaded on 2026-10-03, including known space, wormholes and special space. Positions are converted from metres to light years without changing their relationships. No live ESI calls are needed to load the map.

Drag to rotate, scroll or use the zoom buttons, and click a star or a system in the searchable list to focus it. Known space is the default view; use the selector for wormholes or the complete dataset. Labels avoid overlapping at overview scale; the complete list always exposes every name and security status. Security classes use the displayed highsec boundary (0.45); colors reuse the app's validated chart palette.

Regenerate the dataset with `python scripts/update-map-data.py` after a CCP universe update. Source: https://developers.eveonline.com/static-data/ and https://developers.eveonline.com/docs/guides/map-data/ . Rendering uses an orthographic 3D projection on canvas, with no external map service or graphics dependency.
