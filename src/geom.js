import * as THREE from 'three'

// Plan coordinates are metres: x east, y north. In three.js: x = east, y = up, z = -north.

export const centroid = (r) => {
  let x = 0
  let y = 0
  for (const q of r) {
    x += q[0]
    y += q[1]
  }
  return [x / r.length, y / r.length]
}
export const scaleRing = (r, k, c = centroid(r)) => r.map(([x, y]) => [c[0] + (x - c[0]) * k, c[1] + (y - c[1]) * k])
export const inside = ([x, y], r) => {
  let c = false
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i]
    const [xj, yj] = r[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c
  }
  return c
}

// a growing list of triangles (positions, optional colours), turned into one geometry at the end
export class Tris {
  constructor(colours = false) {
    this.p = []
    this.c = colours ? [] : null
    this.tag = [] // what each triangle belongs to (a building number, …)
  }
  tri(a, b, c, col, tag = -1) {
    this.p.push(...a, ...b, ...c)
    if (this.c) for (let i = 0; i < 3; i++) this.c.push(col[0], col[1], col[2])
    this.tag.push(tag)
  }
  quad(a, b, c, d, col, tag) {
    this.tri(a, b, c, col, tag)
    this.tri(a, c, d, col, tag)
  }
  geometry() {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3))
    if (this.c) g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3))
    g.computeVertexNormals()
    g.computeBoundingSphere()
    return g
  }
}

const v2 = (r) => r.map(([x, y]) => new THREE.Vector2(x, y))
// a flat polygon at height y
export function flat(T, ring, y, col, tag) {
  let r = ring
  if (THREE.ShapeUtils.isClockWise(v2(r))) r = r.slice().reverse()
  for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(v2(r), [])) {
    T.tri([r[a][0], y, -r[a][1]], [r[b][0], y, -r[b][1]], [r[c][0], y, -r[c][1]], col, tag)
  }
}
// a building: walls and a flat roof, from z0 to z1
export function prism(T, ring, z0, z1, col, tag) {
  let r = ring
  if (THREE.ShapeUtils.isClockWise(v2(r))) r = r.slice().reverse()
  for (let i = 0; i < r.length; i++) {
    const [x1, y1] = r[i]
    const [x2, y2] = r[(i + 1) % r.length]
    T.quad([x1, z0, -y1], [x2, z0, -y2], [x2, z1, -y2], [x1, z1, -y1], col, tag)
  }
  flat(T, r, z1, col, tag)
}
// a flat band along a line, w wide, at height y (each piece a little longer, so the joints close)
export function ribbon(T, line, w, y, col, tag) {
  for (let i = 1; i < line.length; i++) band(T, line[i - 1], line[i], w, y, col, tag)
}
export function band(T, a, b, w, y, col, tag) {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const L = Math.hypot(dx, dy)
  if (L < 0.01) return
  const ux = dx / L
  const uy = dy / L
  const e = w / 2
  const nx = -uy * e
  const ny = ux * e
  const ax = a[0] - ux * e * 0.9
  const ay = a[1] - uy * e * 0.9
  const bx = b[0] + ux * e * 0.9
  const by = b[1] + uy * e * 0.9
  T.quad([ax + nx, y, -(ay + ny)], [ax - nx, y, -(ay - ny)], [bx - nx, y, -(by - ny)], [bx + nx, y, -(by + ny)], col, tag)
}
// a raised band: top and both sides, from y0 to y1
export function bar(T, line, w, y0, y1, col, tag) {
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]
    const b = line[i]
    const dx = b[0] - a[0]
    const dy = b[1] - a[1]
    const L = Math.hypot(dx, dy)
    if (L < 0.01) continue
    const nx = (-dy / L) * (w / 2)
    const ny = (dx / L) * (w / 2)
    const P = (p, s, y) => [p[0] + nx * s, y, -(p[1] + ny * s)]
    T.quad(P(a, 1, y1), P(a, -1, y1), P(b, -1, y1), P(b, 1, y1), col, tag)
    T.quad(P(a, 1, y0), P(a, 1, y1), P(b, 1, y1), P(b, 1, y0), col, tag)
    T.quad(P(a, -1, y1), P(a, -1, y0), P(b, -1, y0), P(b, -1, y1), col, tag)
  }
  // round off each corner with a small disc on top
  for (const p of line) disc(T, p, w / 2, y1, col, tag, 10)
}
export function disc(T, [x, y], r, z, col, tag, n = 24) {
  for (let i = 0; i < n; i++) {
    const a1 = (i / n) * Math.PI * 2
    const a2 = ((i + 1) / n) * Math.PI * 2
    T.tri([x, z, -y], [x + Math.cos(a1) * r, z, -(y + Math.sin(a1) * r)], [x + Math.cos(a2) * r, z, -(y + Math.sin(a2) * r)], col, tag)
  }
}

// lines: a flat list of segment ends, as three.js points
export class Segs {
  constructor() {
    this.p = []
  }
  seg(a, b) {
    this.p.push(a, b)
  }
  ring(r, y) {
    for (let i = 0; i < r.length; i++) {
      const a = r[i]
      const b = r[(i + 1) % r.length]
      this.p.push([a[0], y, -a[1]], [b[0], y, -b[1]])
    }
  }
  line(l, y) {
    for (let i = 1; i < l.length; i++) this.p.push([l[i - 1][0], y, -l[i - 1][1]], [l[i][0], y, -l[i][1]])
  }
}

// parallel lines across a polygon (a hatch), `step` metres apart, at angle `deg`, at height y
export function hatch(S, ring, step, deg, y) {
  const a = (deg * Math.PI) / 180
  const ca = Math.cos(a)
  const sa = Math.sin(a)
  const rot = ring.map(([x, yy]) => [x * ca + yy * sa, -x * sa + yy * ca])
  const ys = rot.map((q) => q[1])
  const lo = Math.min(...ys)
  const hi = Math.max(...ys)
  for (let v = Math.ceil(lo / step) * step; v < hi; v += step) {
    const xs = []
    for (let i = 0; i < rot.length; i++) {
      const [x1, y1] = rot[i]
      const [x2, y2] = rot[(i + 1) % rot.length]
      if (y1 > v !== y2 > v) xs.push(x1 + ((v - y1) * (x2 - x1)) / (y2 - y1))
    }
    xs.sort((p, q) => p - q)
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const back = (u) => [u * ca - v * sa, u * sa + v * ca]
      const p = back(xs[i])
      const q = back(xs[i + 1])
      S.seg([p[0], y, -p[1]], [q[0], y, -q[1]])
    }
  }
}

export const rgb = (hex) => {
  const c = new THREE.Color(hex)
  return [c.r, c.g, c.b]
}
