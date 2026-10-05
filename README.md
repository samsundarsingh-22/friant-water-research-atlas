# Friant Water Research Atlas

This folder is a complete, editable, local research microsite. It combines the Friant study narrative, descriptive charts, map layers, thematic maps, crop and farmland context, population context, empirical-feasibility assessment, source links and downloadable analysis tables.

## Open the site

The most reliable method is to serve the folder locally:

```bash
cd "/Users/samsundarsingh/Documents/Codex/2026-08-10/i/outputs/Friant_Research_Website"
python3 -m http.server 8765
```

Then open `http://127.0.0.1:8765` in a browser.

The research layers and charts are stored in this folder. Esri and OpenStreetMap background tiles require internet access. The browser's **Locate me** feature requires location permission and works on `localhost` or a secure website.

## Edit the site

- `index.html` — wording, section order, source links and downloadable files.
- `styles.css` — colour themes, layout and responsive design.
- `app.js` — charts, interactive map behaviour, layer styling and thematic-map descriptions.
- `prepare_layers.py` — reproducibly rebuilds the web-ready GIS layers and chart data from the research package.
- `assets/` — static publication maps and georeferenced raster overlays.
- `data/` — browser-ready map data, research summaries and downloadable CSV files.
- `vendor/` — the local Leaflet map library.

The hero uses `assets/san-joaquin-river-hero.png`, an original AI-generated editorial background prepared for this project. Its production prompt requested a wide, high-oblique Central Valley river-and-agriculture scene with dark negative space for the heading, no text, no logo and no claim that it depicts one exact location.

The live weather strip retrieves current temperature, relative humidity and daily precipitation from Open-Meteo for a reference point near Friant Dam. It is labelled as contextual orientation and is not mixed with the audited gridMET research series.

## Rebuild after research-data changes

The preparation script never alters the source research package. Run:

```bash
"/Users/samsundarsingh/PycharmProjects/PythonProject/.venv/bin/python" \
  prepare_layers.py \
  --package "/Users/samsundarsingh/Library/CloudStorage/OneDrive-IndianInstituteofScience/PostDocs/Friant_Drought_Research_Package"
```

This recreates `data/map-data.js`, `data/research-data.js` and the web raster overlays.

## Interpretation rules retained in the website

1. Class 1 and Class 2 are contractor-level USBR water classes, not quantities assigned directly to individual farms.
2. Historical Class 1 and Class 2 spatial quantities are planning references until checked against the operative contract and amendments.
3. Allocation minus delivery is not labelled an unmet requirement without schedules, transfers, exchanges, carry-over and water-type accounting.
4. DWR crop polygons are mapped crop and land-use units, not legal farm parcels or ownership records.
5. County population is regional context, not study-area or district population.
6. A well-completion record measures construction activity, not groundwater extraction.
7. The groundwater-potential map is a relative screening layer, not groundwater availability.
8. The current panel supports descriptive analysis and feasibility assessment. Causal drought-insurance estimates require a defensible identification strategy and stronger control data.

## Privacy and publication

This version is intentionally local because it contains unpublished research material. Review the data, wording and licence conditions before publishing it on the public web.
