// The tally: how strongly each place and each piece of street is remembered.
//
// A place counts 1 for every person who names it, ½ when they wrote "1" after it
// (they remembered something was there but not its name). The same place twice in one list counts once.
// A building carries the sum of all the places in it (the Atrium is the mall and Aldi City).
//
// Routes: each list is walked in the order it was written, from place to place,
// along the shortest way on the walking network. A leg to or from a ½ place counts ½.
// A street piece counts once per person who walks it, so its strength is how many people pass there.

// ---------- names ----------
export const norm = (s) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]/g, '')

// one line of a pasted list -> { text, half }. "Marienstraße 1" = Marienstraße, half.
export function parseLine(line) {
  const text = line.trim()
  const m = text.match(/^(.*\S)\s+1$/)
  return m ? { text, name: m[1], half: true } : { text, name: text, half: false }
}

// match a name against the places; null when nothing fits
export function matchPlace(name, places) {
  const n = norm(name)
  if (!n) return null
  for (const p of places) if (norm(p.name) === n || p.names.some((x) => norm(x) === n)) return p.id
  return null
}

// ---------- the walking network ----------
export function makeGraph(g) {
  const N = g.n.length / 2
  const head = new Int32Array(N).fill(-1)
  const E = g.e.length / 2
  const next = new Int32Array(E * 2)
  const to = new Int32Array(E * 2)
  const len = new Float32Array(E * 2)
  for (let k = 0; k < E; k++) {
    const a = g.e[2 * k]
    const b = g.e[2 * k + 1]
    const L = Math.hypot(g.n[2 * a] - g.n[2 * b], g.n[2 * a + 1] - g.n[2 * b + 1])
    for (const [u, v, s] of [[a, b, 2 * k], [b, a, 2 * k + 1]]) {
      to[s] = v
      len[s] = L
      next[s] = head[u]
      head[u] = s
    }
  }
  // a coarse grid to find the nearest node quickly
  const C = 50
  const cells = new Map()
  for (let i = 0; i < N; i++) {
    const k = Math.floor(g.n[2 * i] / C) + ',' + Math.floor(g.n[2 * i + 1] / C)
    if (!cells.has(k)) cells.set(k, [])
    cells.get(k).push(i)
  }
  const nearest = (x, y) => {
    let best = -1
    let bd = Infinity
    for (let r = 0; r < 40 && best < 0; r++) {
      const cx = Math.floor(x / C)
      const cy = Math.floor(y / C)
      for (let i = -r; i <= r; i++)
        for (let j = -r; j <= r; j++) {
          if (Math.max(Math.abs(i), Math.abs(j)) !== r) continue
          for (const n of cells.get(cx + i + ',' + (cy + j)) ?? []) {
            const d = Math.hypot(g.n[2 * n] - x, g.n[2 * n + 1] - y)
            if (d < bd) (bd = d), (best = n)
          }
        }
      if (best >= 0) {
        // one more ring, in case a closer node sits just over the edge of the cell
        r++
        const cx2 = Math.floor(x / C)
        const cy2 = Math.floor(y / C)
        for (let i = -r; i <= r; i++)
          for (let j = -r; j <= r; j++)
            for (const n of cells.get(cx2 + i + ',' + (cy2 + j)) ?? []) {
              const d = Math.hypot(g.n[2 * n] - x, g.n[2 * n + 1] - y)
              if (d < bd) (bd = d), (best = n)
            }
      }
    }
    return best
  }
  return { N, E, head, next, to, len, n: g.n, nearest }
}

// shortest way from node a to node b: the list of edge numbers (each edge counted once, both ways)
export function route(G, a, b) {
  if (a === b) return []
  const dist = new Float64Array(G.N).fill(Infinity)
  const via = new Int32Array(G.N).fill(-1)
  const heap = [[0, a]]
  dist[a] = 0
  const push = (d, n) => {
    heap.push([d, n])
    let i = heap.length - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if (heap[p][0] <= heap[i][0]) break
      ;[heap[p], heap[i]] = [heap[i], heap[p]]
      i = p
    }
  }
  const pop = () => {
    const top = heap[0]
    const last = heap.pop()
    if (heap.length) {
      heap[0] = last
      let i = 0
      for (;;) {
        const l = 2 * i + 1
        const r = l + 1
        let m = i
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r
        if (m === i) break
        ;[heap[m], heap[i]] = [heap[i], heap[m]]
        i = m
      }
    }
    return top
  }
  while (heap.length) {
    const [d, u] = pop()
    if (d > dist[u]) continue
    if (u === b) break
    for (let s = G.head[u]; s >= 0; s = G.next[s]) {
      const v = G.to[s]
      const nd = d + G.len[s]
      if (nd < dist[v]) {
        dist[v] = nd
        via[v] = s
        push(nd, v)
      }
    }
  }
  if (via[b] < 0) return []
  const out = []
  for (let n = b; n !== a; ) {
    const s = via[n]
    out.push(s >> 1)
    n = G.to[s ^ 1]
  }
  return out.reverse()
}

// ---------- the tally ----------
// lists: [{ id, name, on, entries: [{ text, place, half }] }]
// geo: place id -> { kind, at, b?, p?, l? } (from places.json, plus places you set yourself)
export function tally(lists, geo, G) {
  const place = {} // id -> { w, who: [{ name, half }] }
  const building = new Map() // building number -> { w, places: Set }
  const edge = new Map() // edge number -> strength
  const legs = []
  for (const L of lists) {
    if (!L.on) continue
    // the places of this person, once each, the strongest mention
    const mine = new Map()
    for (const e of L.entries) {
      if (!e.place || !geo[e.place]) continue
      const w = e.half ? 0.5 : 1
      mine.set(e.place, Math.max(mine.get(e.place) ?? 0, w))
    }
    for (const [id, w] of mine) {
      const t = (place[id] ??= { w: 0, who: [] })
      t.w += w
      t.who.push({ name: L.name, half: w < 1 })
      for (const b of geo[id].b ?? []) {
        const B = building.get(b) ?? { w: 0, places: new Set() }
        B.w += w
        B.places.add(id)
        building.set(b, B)
      }
    }
    // the walk, in the order written
    if (!G) continue
    const mineEdge = new Map()
    const stops = L.entries.filter((e) => e.place && geo[e.place])
    for (let i = 1; i < stops.length; i++) {
      const A = geo[stops[i - 1].place]
      const B = geo[stops[i].place]
      const w = Math.min(stops[i - 1].half ? 0.5 : 1, stops[i].half ? 0.5 : 1)
      const a = G.nearest(...A.at)
      const b = G.nearest(...B.at)
      const path = route(G, a, b)
      legs.push({ who: L.name, a: stops[i - 1].place, b: stops[i].place, path })
      for (const k of path) mineEdge.set(k, Math.max(mineEdge.get(k) ?? 0, w))
    }
    for (const [k, w] of mineEdge) edge.set(k, (edge.get(k) ?? 0) + w)
  }
  return { place, building, edge, legs, zones: zones(legs, edge, geo, G) }
}

// ---------- route areas ----------
// A route drawn more than once: two places that at least two people wrote one after the other
// (in either order). One per pair of places; the route is the shortest way between them.
// Its frame is a portrait page (like a figure in a book), around the route and both places.
export const ZONE_ASPECT = 0.72 // width / height
function zones(legs, edge, geo, G) {
  const out = new Map()
  for (const L of legs) {
    if (L.a === L.b || L.path.length < 2) continue
    let len = 0
    let sum = 0
    for (const k of L.path) {
      const l = G.len[2 * k]
      len += l
      sum += l * (edge.get(k) ?? 0)
    }
    const mean = len ? sum / len : 0
    const key = [L.a, L.b].sort().join('|')
    const z = out.get(key) ?? { id: key, a: L.a, b: L.b, who: new Set(), path: L.path, mean, len }
    z.who.add(L.who)
    if (mean > z.mean) Object.assign(z, { path: L.path, mean, len })
    out.set(key, z)
  }
  return [...out.values()].filter((z) => z.who.size >= 2).map((z) => {
    let x0 = Infinity
    let y0 = Infinity
    let x1 = -Infinity
    let y1 = -Infinity
    const add = (x, y) => {
      x0 = Math.min(x0, x)
      y0 = Math.min(y0, y)
      x1 = Math.max(x1, x)
      y1 = Math.max(y1, y)
    }
    for (const k of z.path) {
      const a = G.to[2 * k + 1]
      const b = G.to[2 * k]
      add(G.n[2 * a], G.n[2 * a + 1])
      add(G.n[2 * b], G.n[2 * b + 1])
    }
    add(...geo[z.a].at)
    add(...geo[z.b].at)
    const pad = 70
    let w = x1 - x0 + 2 * pad
    let h = y1 - y0 + 2 * pad
    h = Math.max(h, 260, w / ZONE_ASPECT)
    w = h * ZONE_ASPECT
    const cx = (x0 + x1) / 2
    const cy = (y0 + y1) / 2
    return { ...z, who: [...z.who], box: [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2] }
  }).sort((p, q) => q.who.length - p.who.length || q.mean - p.mean)
}

// ---------- strength as opacity (black on white, like Nolli's plan of Rome) ----------
// ½ -> about a quarter black, the most named place -> solid black
export const opacity = (w, max) => Math.min(1, 0.14 + 0.86 * Math.pow(Math.min(1, w / max), 0.7))
export const grey = (a) => {
  const v = Math.round(255 * (1 - a))
  return '#' + [v, v, v].map((x) => x.toString(16).padStart(2, '0')).join('')
}

// ---------- colours (not used in the black-and-white look) ----------
const lerp = (a, b, t) => a + (b - a) * t
const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16))
function ramp(stops) {
  const cs = stops.map(hex)
  return (t) => {
    t = Math.max(0, Math.min(1, t))
    const f = t * (cs.length - 1)
    const i = Math.min(cs.length - 2, Math.floor(f))
    const u = f - i
    return '#' + cs[i].map((v, k) => Math.round(lerp(v, cs[i + 1][k], u)).toString(16).padStart(2, '0')).join('')
  }
}
// places: pale apricot -> orange -> deep red
export const PLACE_RAMP = ramp(['#f6cfa8', '#ee8a3c', '#d4471c', '#8e1c0b'])
// routes: pale blue -> blue -> deep indigo
export const ROUTE_RAMP = ramp(['#b6d3f2', '#4b8fe0', '#1f4fc2', '#14266e'])
// how many steps of detail a strength of w gets: ½ -> 1, 1 -> 2, 1½ -> 3, 2 -> 4 …
export const detail = (w) => Math.round(w * 2)
