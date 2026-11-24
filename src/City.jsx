import { useMemo } from 'react'
import * as THREE from 'three'
import { Html, Line } from '@react-three/drei'
import { Segs, Tris, bar, centroid, disc, flat, hatch, prism, ribbon, scaleRing } from './geom.js'
import { detail, grey, opacity } from './memory.js'

// Black and white, like Nolli's plan of Rome: white paper, the remembered places in black.
// How often a place was named is its opacity: ½ is a light grey veil, the most named place is solid black.

// ---------- the plain city: never named, pale and quiet ----------
export function Base({ city, skip, onPick }) {
  const geo = useMemo(() => {
    const G = new Tris(true)
    const c = (h) => {
      const k = new THREE.Color(h)
      return [k.r, k.g, k.b]
    }
    for (const g of city.green) flat(G, g.p, 0.02, c(g.k === 'wood' ? '#ececec' : '#f1f1f1'))
    for (const p of city.squares) flat(G, p, 0.04, c('#fbfbfb'))
    for (const p of city.water) flat(G, p, 0.06, c('#dcebf6'))
    for (const r of city.rivers) ribbon(G, r.l, r.w, 0.07, c('#dcebf6'))
    for (const r of city.roads) ribbon(G, r.l, r.w, r.w > 3 ? 0.05 : 0.055, c('#ffffff'))
    const B = new Tris(false)
    city.buildings.forEach((b, i) => {
      if (skip.has(i)) return
      prism(B, b.p, 0, b.h, null, i)
    })
    const rail = new Segs()
    for (const l of city.rail) rail.line(l, 0.1)
    return { ground: G.geometry(), build: B.geometry(), tags: B.tag, rail: rail.p }
  }, [city, skip])
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]} receiveShadow onClick={(e) => onPick?.(e, null)}>
        <planeGeometry args={[16000, 16000]} />
        <meshLambertMaterial color="#f6f6f4" />
      </mesh>
      <mesh geometry={geo.ground} receiveShadow onClick={(e) => onPick?.(e, null)}>
        <meshLambertMaterial vertexColors />
      </mesh>
      <mesh geometry={geo.build} castShadow receiveShadow onClick={(e) => onPick?.(e, geo.tags[e.faceIndex] ?? null)}>
        <meshLambertMaterial color="#e2e2e0" />
      </mesh>
      {geo.rail.length > 0 && <Line points={geo.rail} segments color="#b5b5b5" lineWidth={1} />}
    </group>
  )
}

// ---------- remembered places: the more people, the bigger, darker and more detailed ----------
// detail steps (d = 2 × count): 1 outline · 2 + floor lines · 3 + windows · 4 + plinth and crown, thicker line · 5+ taller crown
export const grow = (w) => ({ k: 1 + 0.06 * Math.min(w, 5), lift: (h) => h * (1 + 0.22 * w) + 1.5 * w })

export function Memory({ city, geo, tally, wmax, hover, onHover, onPick, labels, fade, only }) {
  const parts = useMemo(() => {
    // one set of shapes per opacity, so each can be drawn see-through
    const levels = new Map()
    const river = new Tris(false) // remembered rivers, in light blue
    const at = (a) => {
      const k = Math.round(a * 100) / 100
      if (!levels.has(k)) levels.set(k, new Tris(false))
      return levels.get(k)
    }
    const thin = new Map() // opacity -> Segs (floors, windows)
    const thinAt = (a) => {
      const k = Math.round(a * 100) / 100
      if (!thin.has(k)) thin.set(k, new Segs())
      return thin.get(k)
    }
    const bold = [] // outlines and hatches, with their own width and opacity
    const lab = []
    const op = (w) => opacity(w, wmax)

    // buildings
    for (const [i, B] of tally.building) {
      if (only && ![...B.places].some((id) => only.has(id))) continue // not among the most remembered: drawn plain
      const b = city.buildings[i]
      const w = B.w
      const a = op(w)
      const d = detail(w)
      const g = grow(w)
      const c = centroid(b.p)
      const r = scaleRing(b.p, g.k, c)
      const H = g.lift(b.h)
      const T = at(a)
      const tag = 'b' + i
      if (d >= 4) {
        prism(at(Math.min(1, a + 0.15)), scaleRing(b.p, g.k + 0.025, c), 0, 1.4, null, tag) // plinth
        prism(T, r, 1.4, H, null, tag)
        const crown = Math.min(1.6 + (d - 4) * 1.2, 5)
        prism(at(Math.min(1, a + 0.15)), scaleRing(b.p, g.k * 0.86, c), H, H + crown, null, tag) // crown
        const s = new Segs()
        s.ring(scaleRing(b.p, g.k * 0.86, c), H + crown + 0.05)
        bold.push({ p: s.p, w: 1.4 + 0.35 * w, a: Math.min(1, a + 0.2) })
      } else prism(T, r, 0, H, null, tag)
      const o = new Segs()
      o.ring(r, H + 0.05)
      for (const q of r) o.seg([q[0], 0, -q[1]], [q[0], H, -q[1]])
      bold.push({ p: o.p, w: 0.8 + 0.5 * w, a: Math.min(1, a + 0.25) })
      const S = thinAt(Math.min(1, a + 0.2))
      if (d >= 2) for (let z = 3.2; z < H - 0.6; z += 3.2) S.ring(scaleRing(r, 1.002, c), z)
      if (d >= 3)
        for (let k = 0; k < r.length; k++) {
          const p0 = r[k]
          const p1 = r[(k + 1) % r.length]
          const L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1])
          const n = Math.floor(L / 2.4)
          for (let j = 1; j < n; j++) {
            const t = j / n
            const x = p0[0] + (p1[0] - p0[0]) * t
            const y = p0[1] + (p1[1] - p0[1]) * t
            const ox = (x - c[0]) * 0.002
            const oy = (y - c[1]) * 0.002
            S.seg([x + ox, d >= 4 ? 1.6 : 0.8, -(y + oy)], [x + ox, H - 0.5, -(y + oy)])
          }
        }
      lab.push({ ids: [...B.places], at: [c[0], H + 4, -c[1]], w })
    }

    // squares, parks, streets, the river, spots
    for (const [id, t] of Object.entries(tally.place)) {
      const p = geo[id]
      if (!p || p.kind === 'building' || p.kind === 'away') continue // other cities are counted, but not drawn
      if (only && !only.has(id)) continue
      const w = t.w
      const a = op(w)
      const d = detail(w)
      const tag = 'p' + id
      if (p.kind === 'area') {
        // a clean see-through fill (a little lighter than buildings, so a big park doesn't black out the city) and its outline
        const th = 0.35 + 0.25 * w
        for (const ring of p.p) {
          prism(at(a * 0.55), ring, 0, th, null, tag)
          const o = new Segs()
          o.ring(ring, th + 0.05)
          bold.push({ p: o.p, w: 0.8 + 0.4 * w, a })
        }
        lab.push({ ids: [id], at: [p.at[0], th + 6, -p.at[1]], w })
      } else if (p.kind === 'street' || p.kind === 'river') {
        const W = (p.kind === 'river' ? 10 : 4) + 2.2 * w
        const th = p.kind === 'river' ? 4.5 + 0.3 * w : 0.3 + 0.45 * w // the river runs above the parks it crosses
        for (const l of p.l) {
          bar(p.kind === 'river' ? river : at(a), l, W, 0, th, null, tag)
          if (d >= 4 && p.kind !== 'river')
            for (const side of [1, -1]) {
              const s = new Segs()
              const off = l.map((q, k) => {
                const p0 = l[Math.max(0, k - 1)]
                const p1 = l[Math.min(l.length - 1, k + 1)]
                const L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) || 1
                return [q[0] - ((p1[1] - p0[1]) / L) * (W / 2) * side, q[1] + ((p1[0] - p0[0]) / L) * (W / 2) * side]
              })
              s.line(off, th + 0.06)
              bold.push({ p: s.p, w: 1 + 0.3 * w, a: 1 })
            }
        }
        lab.push({ ids: [id], at: [p.at[0], th + 6, -p.at[1]], w })
      } else if (p.kind === 'away') {
        // another city: an arrow at the edge of the map, pointing towards it
        const L = 70 + 30 * w
        const Wd = 40 + 14 * w
        const th = 0.8 + 1.2 * w
        const [ux, uy] = p.dir
        const nx = -uy
        const ny = ux
        const [cx, cy] = p.at
        const P = (a, b) => [cx + ux * a + nx * b, cy + uy * a + ny * b]
        const arrow = [P(L / 2, 0), P(L * 0.05, Wd / 2), P(L * 0.05, Wd / 5), P(-L / 2, Wd / 5), P(-L / 2, -Wd / 5), P(L * 0.05, -Wd / 5), P(L * 0.05, -Wd / 2)]
        prism(at(a), arrow, 0, th, null, tag)
        const o = new Segs()
        o.ring(arrow, th + 0.05)
        bold.push({ p: o.p, w: 0.8 + 0.5 * w, a: Math.min(1, a + 0.25) })
        lab.push({ ids: [id], at: [cx - ux * L * 0.9, th + 8, -(cy - uy * L * 0.9)], w, km: p.km })
      } else if (p.kind === 'spot') {
        const R = 5 + 2.5 * w
        const th = 0.8 + 1.5 * w
        const n = 32
        const ring = Array.from({ length: n }, (_, k) => [p.at[0] + Math.cos((k / n) * Math.PI * 2) * R, p.at[1] + Math.sin((k / n) * Math.PI * 2) * R])
        prism(at(a), ring, 0, th, null, tag)
        const o = new Segs()
        o.ring(ring, th + 0.05)
        bold.push({ p: o.p, w: 0.8 + 0.5 * w, a: Math.min(1, a + 0.25) })
        if (d >= 2) thinAt(Math.min(1, a + 0.2)).ring(scaleRing(ring, 0.6, p.at), th + 0.06)
        let top = th
        if (d >= 3) {
          const ph = 6 + 5 * w
          const post = Array.from({ length: 8 }, (_, k) => [p.at[0] + Math.cos((k / 8) * Math.PI * 2) * 0.9, p.at[1] + Math.sin((k / 8) * Math.PI * 2) * 0.9])
          prism(at(Math.min(1, a + 0.15)), post, th, th + ph, null, tag)
          disc(at(Math.min(1, a + 0.15)), p.at, 2.2, th + ph, null, tag, 16)
          top = th + ph
        }
        lab.push({ ids: [id], at: [p.at[0], top + 5, -p.at[1]], w })
      }
    }
    return {
      levels: [...levels].sort((x, y) => x[0] - y[0]).map(([a, T]) => ({ a, g: T.geometry(), tags: T.tag })),
      river: river.p.length ? { g: river.geometry(), tags: river.tag } : null,
      thin: [...thin].map(([a, S]) => ({ a, p: S.p })),
      bold,
      lab,
    }
  }, [city, geo, tally, wmax, only])

  return (
    <group>
      {parts.river && (
        <mesh
          geometry={parts.river.g}
          receiveShadow
          onPointerMove={(e) => {
            e.stopPropagation()
            const t = parts.river.tags[e.faceIndex] ?? null
            if (t !== hover) onHover(t)
          }}
          onPointerOut={() => onHover(null)}
        >
          <meshLambertMaterial color="#9fcbec" />
        </mesh>
      )}
      {parts.levels.map((L) => (
        <mesh
          key={L.a}
          geometry={L.g}
          castShadow={L.a > 0.3}
          receiveShadow
          renderOrder={Math.round(L.a * 10)}
          onPointerMove={(e) => {
            e.stopPropagation()
            const t = L.tags[e.faceIndex] ?? null
            if (t !== hover) onHover(t)
          }}
          onPointerOut={() => onHover(null)}
          onClick={(e) => {
            e.stopPropagation()
            onPick?.(e, L.tags[e.faceIndex] ?? null)
          }}
        >
          <meshLambertMaterial color="#111111" transparent={L.a < 1} opacity={L.a} depthWrite={L.a >= 0.6} side={THREE.DoubleSide} />
        </mesh>
      ))}
      {parts.thin.map((S) => S.p.length > 0 && <Line key={S.a} points={S.p} segments color="#000" lineWidth={0.7} transparent opacity={S.a * 0.7} />)}
      {parts.bold.map((b, i) => (
        <Line key={i} points={b.p} segments color={b.white ? '#ffffff' : '#000000'} lineWidth={b.w} transparent opacity={b.a} dashed={!!b.dashed} dashSize={2} gapSize={1.6} />
      ))}
      {labels !== 'off' &&
        parts.lab
          .filter((l) => (labels instanceof Set ? l.ids.some((id) => labels.has(id)) : labels === 'all' || l.w >= 1.5))
          .map((l, i) => <Label key={i} l={l} names={tally.names} wmax={wmax} dim={fade && !(l.at[0] > fade[0] && l.at[0] < fade[2] && -l.at[2] > fade[1] && -l.at[2] < fade[3])} />)}
    </group>
  )
}

function Label({ l, names: N, wmax, dim }) {
  const names = l.ids.map((id) => N[id]).join(' · ') + (l.km ? ` → ${l.km} km` : '')
  const size = 10 + Math.min(4, l.w) * 2.2
  const a = opacity(l.w, wmax)
  return (
    <Html position={l.at} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
      <div className="tag" style={{ opacity: dim ? 0.15 : 1, transition: 'opacity 0.2s', fontSize: size, fontWeight: l.w >= 2 ? 750 : l.w >= 1 ? 600 : 450, color: grey(Math.max(0.55, a)), borderColor: grey(a) }}>
        {names}
        <span className="n">{fmt(l.w)}</span>
      </div>
    </Html>
  )
}

export const fmt = (w) => (w % 1 ? (w > 1 ? Math.floor(w) + '½' : '½') : String(w))

// ---------- routes between the places: the more people walk a street, the wider and blacker ----------
export function Routes({ city, tally, rmax }) {
  const levels = useMemo(() => {
    const n = city.graph.n
    const e = city.graph.e
    const by = new Map()
    for (const [k, w] of tally.edge) {
      const a = Math.round(opacity(w, rmax) * 100) / 100
      if (!by.has(a)) by.set(a, { T: new Tris(false), nodes: new Map() })
      const L = by.get(a)
      const p = e[2 * k]
      const q = e[2 * k + 1]
      const W = 1.2 + 2.2 * w
      const y = 0.3 + 0.08 * w
      bandQuad(L.T, [n[2 * p], n[2 * p + 1]], [n[2 * q], n[2 * q + 1]], W, y)
      for (const v of [p, q]) L.nodes.set(v, { W, y })
    }
    return [...by]
      .sort((x, y) => x[0] - y[0])
      .map(([a, L]) => {
        for (const [v, q] of L.nodes) disc(L.T, [n[2 * v], n[2 * v + 1]], q.W / 2, q.y, null, -1, 10)
        return { a, g: L.T.geometry() }
      })
  }, [city, tally, rmax])
  return levels.map((L) => (
    <mesh key={L.a} geometry={L.g} raycast={() => null} renderOrder={20 + Math.round(L.a * 10)}>
      <meshBasicMaterial color="#000000" transparent opacity={L.a} depthWrite={false} />
    </mesh>
  ))
}
function bandQuad(T, a, b, w, y) {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const L = Math.hypot(dx, dy)
  if (L < 0.01) return
  const nx = (-dy / L) * (w / 2)
  const ny = (dx / L) * (w / 2)
  T.quad([a[0] + nx, y, -(a[1] + ny)], [a[0] - nx, y, -(a[1] - ny)], [b[0] - nx, y, -(b[1] - ny)], [b[0] + nx, y, -(b[1] + ny)], null)
}

// ---------- route areas ----------
// All of them as faint dashed frames (when shown). The one you point at in the side panel:
// a white veil over the rest of the map, its frame and its route in bold black.
export function Zones({ zones, show, focus, city }) {
  const z = focus != null ? zones[focus] : null
  const veil = useMemo(() => {
    if (!z) return null
    const [x0, y0, x1, y1] = z.box
    const F = 6000
    const T = new Tris(false)
    const H = 160
    // four boxes around the frame (top and inner sides), so the area inside stays clear
    const boxes = [
      [-F, -F, F, y0],
      [-F, y1, F, F],
      [-F, y0, x0, y1],
      [x1, y0, F, y1],
    ]
    for (const [a, b, cc, d] of boxes) prism(T, [[a, b], [cc, b], [cc, d], [a, d]], -1, H, null)
    const route = []
    for (const k of z.path ?? []) {
      const p = city.graph.e[2 * k]
      const q = city.graph.e[2 * k + 1]
      route.push([city.graph.n[2 * p], 1.2, -city.graph.n[2 * p + 1]], [city.graph.n[2 * q], 1.2, -city.graph.n[2 * q + 1]])
    }
    return { g: T.geometry(), route }
  }, [z, city])
  return (
    <group>
      {false &&
        zones.map((q, k) => {
          if (k === focus) return null
          const [x0, y0, x1, y1] = q.box
          const r = [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]].map(([x, y]) => [x, 0.6, -y])
          return <Line key={q.id} points={r} color="#000" lineWidth={1} dashed dashSize={8} gapSize={6} transparent opacity={0.35} />
        })}
      {z && (
        <>
          <mesh geometry={veil.g} renderOrder={50} raycast={() => null}>
            <meshBasicMaterial color="#ffffff" transparent opacity={0.78} depthWrite={false} side={THREE.DoubleSide} />
          </mesh>
          <Line points={[[z.box[0], 1, -z.box[1]], [z.box[2], 1, -z.box[1]], [z.box[2], 1, -z.box[3]], [z.box[0], 1, -z.box[3]], [z.box[0], 1, -z.box[1]]]} color="#000" lineWidth={3.5} renderOrder={60} />
        </>
      )}
    </group>
  )
}
