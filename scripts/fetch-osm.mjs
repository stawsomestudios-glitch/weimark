// Downloads the OpenStreetMap data for the memory map (a larger area than the course kit)
// into a work folder given as the first argument. Run: node scripts/fetch-osm.mjs <folder>
import fs from 'fs'
export const BBOX = [50.944, 11.283, 51.002, 11.356] // south, west, north, east
const out = process.argv[2]
const b = BBOX.join(',')
const q = `[out:json][timeout:180];
(
  way["building"](${b}); relation["building"](${b});
  way["highway"](${b});
  way["waterway"~"river|stream|canal"](${b});
  way["natural"="water"](${b}); relation["natural"="water"](${b});
  way["leisure"~"park|garden|pitch|playground"](${b}); relation["leisure"~"park|garden"](${b});
  way["landuse"~"grass|forest|cemetery|meadow|recreation_ground|allotments|village_green"](${b}); relation["landuse"~"forest|cemetery|meadow"](${b});
  way["natural"~"wood|scrub"](${b});
  way["amenity"="grave_yard"](${b});
  way["railway"="rail"](${b});
  way["place"="square"](${b});
);
out geom;`
const servers = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter']
for (const s of servers) {
  try {
    const r = await fetch(s, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'User-Agent': 'weimar-memory-map/0.1 (course project)', 'Content-Type': 'application/x-www-form-urlencoded' } })
    if (!r.ok) { console.log(s, r.status); continue }
    const t = await r.text()
    fs.writeFileSync(out + '/osm.json', t)
    console.log('ok', (t.length / 1e6).toFixed(1), 'MB')
    process.exit(0)
  } catch (e) { console.log(s, e.message) }
}
process.exit(1)
