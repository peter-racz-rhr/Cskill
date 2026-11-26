# Globe Tunes (prototype)

A 3D satellite globe: spin it, zoom in until it flattens into a map, tap a country and open that country's charts.

- **Run:** double-click `index.html`, or `npx serve .` in this folder. It needs internet for the satellite tiles.
- **Map:** MapLibre GL JS 5.6 (globe projection, vendored in `vendor/`), Esri World Imagery satellite tiles (zoom 0–19), optional Esri labels overlay.
- **Borders:** Natural Earth 1:50m via `world-atlas`, converted to GeoJSON in `vendor/countries.js`.
- **Music:** for now, deep links to Spotify, Apple Music, Deezer and YouTube Music. In-app playback is the next step.

Note: Esri imagery is fine for a prototype. A public launch needs an ArcGIS/Mapbox/MapTiler key and its own terms.
