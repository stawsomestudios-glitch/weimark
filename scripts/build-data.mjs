// Turns the OpenStreetMap download and the course kit into the two files the site loads:
//   public/data/city.json    buildings, ground (green, water, squares), streets, rail, and the walking network
//   public/data/places.json  the shape of every remembered place (src/places.js)
// Run: node scripts/fetch-osm.mjs <folder>, then node scripts/build-data.mjs <folder>
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { PLACES } from '../src/places.js'
const BB = [50.944, 11.283, 51.002, 11.356] // the area downloaded by fetch-osm.mjs: south, west, north, east

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const work = process.argv[2]
const osm = JSON.parse(fs.readFileSync(path.join(work, 'osm.json'), 'utf8')).elements
const kit = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/kit.json'), 'utf8'))
const kitB = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/buildings.geojson'), 'utf8')).features

// local metres: x east, y north, from the kit centre
const [LON0, LAT0] = kit.center
const KX = 111320 * Math.cos((LAT0 * Math.PI) / 180)
const KY = 110574
const r1 = (v) => Math.round(v * 10) / 10
const xy = (lon, lat) => [r1((lon - LON0) * KX), r1((lat - LAT0) * KY)]
const ring = (g) => g.map((q) => xy(q.lon, q.lat))
const [kW, kS, kE, kN] = kit.bbox
const inKit = (lon, lat) => lon > kW && lon < kE && lat > kS && lat < kN

const closed = (g) => g && g.length > 3 && g[0].lat === g.at(-1).lat && g[0].lon === g.at(-1).lon
const open = (r) => (r.length > 1 && r[0][0] === r.at(-1)[0] && r[0][1] === r.at(-1)[1] ? r.slice(0, -1) : r)
const area = (r) => {
  let a = 0
  for (let i = 0; i < r.length; i++) {
    const [x1, y1] = r[i]
    const [x2, y2] = r[(i + 1) % r.length]
    a += x1 * y2 - x2 * y1
  }
  return a / 2
}
const centroid = (r) => {
  let x = 0
  let y = 0
  for (const q of r) {
    x += q[0]
    y += q[1]
  }
  return [x / r.length, y / r.length]
}
const inside = ([x, y], r) => {
  let c = false
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i]
    const [xj, yj] = r[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c
  }
  return c
}
// outer rings of a way or a multipolygon relation
function polys(e) {
  if (e.type === 'way') return closed(e.geometry) ? [open(ring(e.geometry))] : []
  const out = []
  // join the outer member lines into rings
  let parts = (e.members ?? []).filter((m) => m.role !== 'inner' && m.geometry).map((m) => ring(m.geometry))
  while (parts.length) {
    let cur = parts.shift()
    let grew = true
    while (grew && !(cur[0][0] === cur.at(-1)[0] && cur[0][1] === cur.at(-1)[1])) {
      grew = false
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i]
        const end = cur.at(-1)
        if (p[0][0] === end[0] && p[0][1] === end[1]) cur = cur.concat(p.slice(1))
        else if (p.at(-1)[0] === end[0] && p.at(-1)[1] === end[1]) cur = cur.concat(p.slice(0, -1).reverse())
        else continue
        parts.splice(i, 1)
        grew = true
        break
      }
    }
    if (cur.length > 3) out.push(open(cur))
  }
  return out
}

// ---------- buildings: the kit's measured ones inside its area, OpenStreetMap outside ----------
const buildings = []
for (const f of kitB) {
  const g = f.geometry
  const rings = g.type === 'Polygon' ? [g.coordinates[0]] : g.coordinates.map((p) => p[0])
  for (const r of rings) {
    const p = open(r.map(([lon, lat]) => xy(lon, lat)))
    if (p.length >= 3) buildings.push({ p, h: r1(f.properties.height), f: f.properties.floors ?? null, s: 'k' })
  }
}
const nKit = buildings.length
const levelsH = (t) => {
  const h = parseFloat(t.height)
  if (h > 0) return h
  const l = parseFloat(t['building:levels'])
  if (l > 0) return l * 3.1 + (parseFloat(t['roof:levels']) > 0 ? 2 : 1)
  if (['garage', 'garages', 'shed', 'carport', 'hut', 'roof', 'kiosk'].includes(t.building)) return 3
  if (['house', 'detached', 'semidetached_house', 'bungalow'].includes(t.building)) return 8
  if (['retail', 'supermarket', 'commercial', 'industrial', 'warehouse'].includes(t.building)) return 7
  return 11
}
for (const e of osm) {
  if (!e.tags?.building || e.tags.building === 'no') continue
  for (const p of polys(e)) {
    if (p.length < 3 || Math.abs(area(p)) < 6) continue
    const c = centroid(p)
    const lon = LON0 + c[0] / KX
    const lat = LAT0 + c[1] / KY
    if (inKit(lon, lat)) continue // the kit has a measured one here
    buildings.push({ p, h: r1(levelsH(e.tags)), f: parseInt(e.tags['building:levels']) || null, s: 'o' })
  }
}

// ---------- ground ----------
const GREEN = { park: 'park', garden: 'garden', grass: 'grass', village_green: 'grass', recreation_ground: 'grass', meadow: 'grass', pitch: 'pitch', playground: 'grass', dog_park: 'grass', forest: 'wood', wood: 'wood', scrub: 'wood', cemetery: 'cemetery', grave_yard: 'cemetery', allotments: 'garden' }
const green = []
const water = []
const squares = []
const rivers = []
const rail = []
const roads = []
const ROADW = { primary: 11, secondary: 10, tertiary: 8, residential: 6.5, living_street: 6, unclassified: 6, service: 4, pedestrian: 5, footway: 2, path: 1.8, cycleway: 2, steps: 2, track: 2.5, primary_link: 7, secondary_link: 7, tertiary_link: 6 }
for (const e of osm) {
  const t = e.tags ?? {}
  if (t.building) continue
  const k = GREEN[t.leisure] ?? GREEN[t.landuse] ?? GREEN[t.natural] ?? GREEN[t.amenity]
  if (k) for (const p of polys(e)) if (Math.abs(area(p)) > 20) green.push({ k, p })
  if (t.natural === 'water' || t.leisure === 'water_park') for (const p of polys(e)) water.push(p)
  if (t.waterway && e.geometry) rivers.push({ w: t.waterway === 'river' ? 14 : t.waterway === 'canal' ? 6 : 3, l: ring(e.geometry), n: t.name ?? '' })
  if (t.railway === 'rail' && e.geometry && !t.service) rail.push(ring(e.geometry))
  if (t.highway && e.geometry) {
    if ((t.area === 'yes' || t.place === 'square') && closed(e.geometry)) squares.push(open(ring(e.geometry)))
    else if (ROADW[t.highway]) roads.push(t.name && ROADW[t.highway] > 3 ? { w: ROADW[t.highway], l: ring(e.geometry), n: t.name } : { w: ROADW[t.highway], l: ring(e.geometry) })
  } else if (t.place === 'square' && closed(e.geometry)) squares.push(open(ring(e.geometry)))
}

// ---------- the walking network: every street and path you may walk on ----------
const NOWALK = new Set(['motorway', 'motorway_link', 'trunk', 'trunk_link', 'construction', 'proposed', 'raceway', 'bus_guideway', 'platform', 'elevator', 'abandoned'])
const ids = new Map()
const nodes = []
const edges = []
const node = (q) => {
  const k = q.lat.toFixed(7) + ',' + q.lon.toFixed(7)
  let i = ids.get(k)
  if (i == null) {
    i = nodes.length / 2
    ids.set(k, i)
    nodes.push(...xy(q.lon, q.lat))
  }
  return i
}
for (const e of osm) {
  const t = e.tags ?? {}
  if (!t.highway || NOWALK.has(t.highway) || !e.geometry) continue
  if (t.foot === 'no' || ((t.access === 'private' || t.access === 'no') && t.foot !== 'yes')) continue
  for (let i = 1; i < e.geometry.length; i++) {
    const a = node(e.geometry[i - 1])
    const b = node(e.geometry[i])
    if (a !== b) edges.push(a, b)
  }
}

// ---------- places ----------
const byId = new Map(osm.map((e) => [e.type[0] + e.id, e]))
const nearestBuilding = (pt) => {
  let best = -1
  let bd = 45
  buildings.forEach((b, i) => {
    if (inside(pt, b.p)) {
      const d = -Math.abs(area(b.p)) // inside: prefer the smallest building around the point
      if (bd > 0 || d > bd) bd = d, best = i
      return
    }
    if (bd <= 0) return
    const c = centroid(b.p)
    const d = Math.hypot(c[0] - pt[0], c[1] - pt[1])
    if (d < bd) bd = d, best = i
  })
  return best
}
const places = {}
for (const pl of PLACES) {
  const o = { kind: pl.kind }
  if (pl.kind === 'building') {
    const pt = xy(pl.at[1], pl.at[0])
    const i = nearestBuilding(pt)
    if (i < 0) { o.kind = 'spot'; o.at = pt } else o.b = [i]
    o.at = i >= 0 ? centroid(buildings[i].p).map(r1) : pt
  } else if (pl.kind === 'spot') {
    o.at = xy(pl.at[1], pl.at[0])
  } else if (pl.kind === 'away') {
    // where the line from the middle of the map towards the city leaves the map (a little inside it)
    const far = xy(pl.at[1], pl.at[0])
    const L = Math.hypot(far[0], far[1])
    const u = [far[0] / L, far[1] / L]
    const [ax, ay] = xy(BB[1], BB[0])
    const [bx, by] = xy(BB[3], BB[2])
    const t = Math.min(u[0] > 0 ? (bx - 150) / u[0] : (ax + 150) / u[0], u[1] > 0 ? (by - 150) / u[1] : (ay + 150) / u[1])
    o.at = [r1(u[0] * t), r1(u[1] * t)]
    o.dir = [Math.round(u[0] * 1000) / 1000, Math.round(u[1] * 1000) / 1000]
    o.km = Math.round(L / 1000)
  } else if (pl.kind === 'area') {
    const e = byId.get(pl.osm)
    o.p = e ? polys(e) : []
    if (!o.p.length) console.log('!! no area for', pl.id)
    const big = o.p.slice().sort((a, b) => Math.abs(area(b)) - Math.abs(area(a)))[0]
    o.at = big ? centroid(big).map(r1) : [0, 0]
  } else if (pl.kind === 'street' || pl.kind === 'river') {
    const want = pl.street ?? pl.river
    o.l = osm.filter((e) => e.geometry && e.tags?.name === want && (pl.kind === 'street' ? e.tags.highway : e.tags.waterway)).map((e) => ring(e.geometry))
    if (!o.l.length) console.log('!! no lines for', pl.id)
    // the middle point of all its lines
    const pts = o.l.flat()
    const c = centroid(pts)
    const m = pts.reduce((a, q) => (Math.hypot(q[0] - c[0], q[1] - c[1]) < Math.hypot(a[0] - c[0], a[1] - c[1]) ? q : a), pts[0])
    o.at = m
  }
  places[pl.id] = o
  console.log(pl.id.padEnd(18), o.kind.padEnd(9), o.b ? `building ${o.b[0]} (${buildings[o.b[0]].s === 'k' ? 'kit' : 'osm'}, ${buildings[o.b[0]].h} m)` : o.p ? `${o.p.length} polygon` : o.l ? `${o.l.length} lines` : 'spot')
}

const city = { origin: [LON0, LAT0], kitBox: [xy(kW, kS), xy(kE, kN)], buildings, nKit, green, water, squares, rivers, rail, roads, graph: { n: nodes, e: edges } }
fs.writeFileSync(path.join(ROOT, 'public/data/city.json'), JSON.stringify(city))
fs.writeFileSync(path.join(ROOT, 'public/data/places.json'), JSON.stringify(places))
console.log('buildings', buildings.length, '(kit', nKit + ')', 'green', green.length, 'roads', roads.length, 'nodes', nodes.length / 2, 'edges', edges.length / 2)
console.log('city.json', (fs.statSync(path.join(ROOT, 'public/data/city.json')).size / 1e6).toFixed(1), 'MB')
