# Project guidelines

I study architecture or design and don't write code. Explain each step in a sentence or two of plain words. After a change, say which files you changed and what I should check on the page.

## Stack

Vite, React in JavaScript, npm. Three.js / React Three Fiber for 3D, MapLibre GL JS for maps. Don't add TypeScript or switch frameworks.

## Hosting

GitHub Pages publishes every push to `main` at `https://<user>.github.io/<repo>/`, through the workflow in `.github/workflows/`. Load every data file through `import.meta.env.BASE_URL`: a path that starts with `/data/` works on localhost and breaks on Pages.

## Data

The city kit is in `public/data/`. Read `SOURCES.md` there before you use it.

## This project: Weimar, remembered

A 3D map of the places people remember in Weimar, after Nolli (black and white) and Kevin Lynch (the book spreads).

- Lists: `src/lists.js` (one per person, in the order written; `half` = they wrote "1" after it, counts ½). Places: `src/places.js` (building at a point, OSM area, street, river, or spot). Add new lists there; lists added on the page stay in that browser only.
- Data: `node scripts/fetch-osm.mjs <folder>` then `node scripts/build-data.mjs <folder>` make `public/data/city.json` (kit buildings inside the kit area, OpenStreetMap outside; streets, green, water, walking network) and `public/data/places.json`. Run build-data again after changing `src/places.js`.
- Tally and routes: `src/memory.js`. Each list is walked in its order on the shortest way; a place or a street piece counts once per person. Strength is opacity (`opacity()`), black on white.
- Drawing: `src/City.jsx` (plain city pale; named places black, see-through by strength, bigger, more detail: floor lines, windows, plinth and crown). Views: `src/Views.jsx`.
- Route areas: pairs of places written one after the other by two or more people. Each opens as a book spread (`src/Spread.jsx`): left a plan (unnamed buildings outlined, named ones hatched by strength), right an album of drawings (`src/album.js`, kept in the browser's IndexedDB).
- `node_modules` is a link to `../garage-blocks/node_modules` (the disk is nearly full).
