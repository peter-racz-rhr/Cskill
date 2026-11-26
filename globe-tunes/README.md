# Globe Tunes

Spin a 3D satellite globe, tap a country, and hear what it's playing right now.

- **3D globe → flat map:** MapLibre GL JS 5.6 globe projection with Esri World Imagery (zoom 0–19) and an optional labels layer.
- **Real charts:** Apple Music's *most-played songs* for every storefront (~150 countries), top 25 each, with 30-second previews.
- **Player:** play / pause / skip / seek, lock-screen and headphone controls (Media Session), keyboard shortcuts.
- **Around the World:** a radio mode that flies to a new country every 30 seconds and plays its No. 1.
- **Apple-style UI:** glass materials, SF Pro on Apple devices, a bottom sheet on phones, `prefers-reduced-motion` respected.

## Live

https://peter-racz-rhr.github.io/Cskill/

## Run locally

The site reads JSON files, so serve it over HTTP. Opening `index.html` straight from disk won't work.

```sh
cd globe-tunes
python3 -m http.server 8000     # or: npx serve .
# open http://localhost:8000
```

## Refresh the charts

```sh
node scripts/fetch-charts.mjs          # all countries (~10 min, rate-limited)
node scripts/fetch-charts.mjs hu us    # just a few
```

Apple's chart feed blocks browser requests (CORS), so the site can't fetch it live. The script writes
`data/index.json` (each country's No. 1) and `data/charts/<cc>.json` (top 25 + preview URLs).

## Deploy (GitHub Pages, free)

`.github/workflows/globe-tunes.yml` refreshes the charts **every day** and publishes the site.

1. Merge this branch into `main`.
2. Repo **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Run the workflow once from the **Actions** tab (or wait for the daily run).

## Before a public launch

- **Satellite tiles:** Esri's free World Imagery is fine for prototypes and non-commercial use. A real launch with traffic needs an
  ArcGIS Location Platform key (has a free tier) or MapTiler/Mapbox satellite; swap the tile URL in `app.js`.
- **Charts and previews** come from Apple's public marketing feeds. Keep the "Apple Music" attribution and links to the full songs.
- Brand logos are deliberately not used; the service rows use generic icons.

## Files

| Path | What |
|---|---|
| `index.html` | Markup |
| `app.css` | All styles (glass, sheet, player, phone layout) |
| `app.js` | Globe, search, chart view, player, radio, haptics |
| `glass.js` | Liquid Glass: refraction lens + spring press physics via `@liquefy-ui/core` |
| `vendor/` | MapLibre (BSD-3), Natural Earth 1:50m borders (public domain), @liquefy-ui/core (MIT), flag-icons (MIT) |
| `scripts/fetch-charts.mjs` | Chart downloader, Node 18+, no dependencies |
| `data/` | Downloaded charts |
