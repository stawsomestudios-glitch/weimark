// The map divided into squares for the zoom-ins (book spreads), like the grid of a city map.
// The squares are fixed to the ground (not to the places), so a square keeps its name (C5 …)
// and its album of drawings when new lists come in.
export const SQUARE = 600 // metres
const X0 = -3000 // west edge of column A
const Y0 = 2400 // north edge of row 1
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

export const colOf = (x) => Math.floor((x - X0) / SQUARE)
export const rowOf = (y) => Math.floor((Y0 - y) / SQUARE)
export const boxOf = (c, r) => [X0 + c * SQUARE, Y0 - (r + 1) * SQUARE, X0 + (c + 1) * SQUARE, Y0 - r * SQUARE]
export const nameOf = (c, r) => LETTERS[c] + (r + 1)

// a place belongs to the square its middle is in (a long street or the river would otherwise be in dozens)
const pointsOf = (g) => [g.at]

// all squares from the north-west to the south-east of the named places; each with the places in it
export function makeGrid(tally, geo) {
  const inSq = new Map()
  let c0 = Infinity
  let c1 = -Infinity
  let r0 = Infinity
  let r1 = -Infinity
  for (const [id, t] of Object.entries(tally.place)) {
    const g = geo[id]
    if (!g || g.kind === 'away' || g.kind === 'river') continue // the river runs through many squares; other cities are off the map
    const seen = new Set()
    for (const [x, y] of pointsOf(g)) {
      const c = colOf(x)
      const r = rowOf(y)
      if (c < 0 || r < 0 || c >= LETTERS.length) continue
      const k = c + ',' + r
      if (seen.has(k)) continue
      seen.add(k)
      if (!inSq.has(k)) inSq.set(k, [])
      inSq.get(k).push({ id, w: t.w })
    }
    const [x, y] = g.at
    c0 = Math.min(c0, colOf(x))
    c1 = Math.max(c1, colOf(x))
    r0 = Math.min(r0, rowOf(y))
    r1 = Math.max(r1, rowOf(y))
  }
  const cells = []
  for (let r = r0; r <= r1; r++)
    for (let c = c0; c <= c1; c++) {
      const places = (inSq.get(c + ',' + r) ?? []).sort((a, b) => b.w - a.w)
      cells.push({ id: 'sq-' + nameOf(c, r), name: nameOf(c, r), c, r, box: boxOf(c, r), places, w: places.reduce((a, p) => a + p.w, 0) })
    }
  return { cells, c0, c1, r0, r1, box: [boxOf(c0, r1)[0], boxOf(c0, r1)[1], boxOf(c1, r0)[2], boxOf(c1, r0)[3]] }
}
