import { useMemo } from 'react'
import { opacity } from './memory.js'

// A small plan of the whole map, divided into dotted squares.
// Point at a square: it fills black here and the rest of the big map fades. Click it: its zoom-in opens.
export default function MiniMap({ city, geo, tally, wmax, grid, hover, onHover, onOpen }) {
  const [x0, y0, x1, y1] = grid.box
  const W = x1 - x0
  const H = y1 - y0
  const P = ([x, y]) => [x - x0, y1 - y]
  const d = (r) => 'M' + r.map((q) => P(q).map((v) => v.toFixed(0)).join(',')).join('L') + 'Z'
  const pl = (l) => 'M' + l.map((q) => P(q).map((v) => v.toFixed(0)).join(',')).join('L')
  const inside = (r) => r.some(([x, y]) => x > x0 && x < x1 && y > y0 && y < y1)
  const art = useMemo(() => {
    const plain = []
    city.buildings.forEach((b, i) => {
      if (!tally.building.has(i) && inside(b.p)) plain.push(d(b.p))
    })
    const named = new Map() // opacity -> paths
    const add = (a, path) => {
      const k = Math.round(a * 20) / 20
      if (!named.has(k)) named.set(k, [])
      named.get(k).push(path)
    }
    for (const [i, B] of tally.building) add(opacity(B.w, wmax), d(city.buildings[i].p))
    const lines = []
    for (const [id, t] of Object.entries(tally.place)) {
      const g = geo[id]
      if (!g) continue
      if (g.kind === 'area') for (const r of g.p) add(opacity(t.w, wmax) * 0.55, d(r))
      if (g.kind === 'street' || g.kind === 'river') for (const l of g.l) lines.push({ p: pl(l), a: g.kind === 'river' ? 1 : opacity(t.w, wmax), w: g.kind === 'river' ? 14 : 9, c: g.kind === 'river' ? '#9fcbec' : '#111' })
      if (g.kind === 'spot') add(opacity(t.w, wmax), d(Array.from({ length: 16 }, (_, k) => [g.at[0] + Math.cos((k / 16) * 6.283) * 22, g.at[1] + Math.sin((k / 16) * 6.283) * 22])))
    }
    return { plain: plain.join(''), named: [...named], lines }
  }, [city, geo, tally, wmax, grid]) // eslint-disable-line react-hooks/exhaustive-deps
  const cur = hover != null ? grid.cells[hover] : null
  return (
    <div className="minimap">
      <div className="mini-head">
        <b>Zoom in</b> <span className="muted small">point at a square, click to open</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} onMouseLeave={() => onHover(null)}>
        <rect width={W} height={H} fill="#fbfbfa" />
        <g opacity={cur ? 0.3 : 1} style={{ transition: 'opacity 0.15s' }}>
          <path d={art.plain} fill="#d9d9d6" />
          {art.lines.map((l, i) => (
            <path key={i} d={l.p} fill="none" stroke={l.c} strokeOpacity={l.a} strokeWidth={l.w} strokeLinecap="round" />
          ))}
          {art.named.map(([a, ps]) => (
            <path key={a} d={ps.join('')} fill="#111" fillOpacity={a} />
          ))}
        </g>
        {grid.cells.map((q, i) => {
          const [bx0, by0, bx1, by1] = q.box
          const [px, py] = P([bx0, by1])
          const empty = !q.places.length
          return (
            <g key={q.id}>
              <rect
                x={px}
                y={py}
                width={bx1 - bx0}
                height={by1 - by0}
                fill={hover === i ? '#111' : 'transparent'}
                stroke="#111"
                strokeOpacity={empty ? 0.25 : 0.7}
                strokeWidth={6}
                strokeDasharray="22 18"
                style={{ cursor: empty ? 'default' : 'pointer' }}
                onMouseEnter={() => onHover(empty ? null : i)}
                onClick={() => !empty && onOpen(i)}
              />
              {!empty && (
                <text x={px + 40} y={py + 190} className="mini-id" fill={hover === i ? '#fff' : '#111'} pointerEvents="none">
                  {q.name}
                </text>
              )}
            </g>
          )
        })}
      </svg>
      {cur && (
        <div className="mini-info small">
          <b>{cur.name}</b>: {cur.places.slice(0, 6).map((p) => tally.names[p.id]).join(', ')}
          {cur.places.length > 6 ? ` and ${cur.places.length - 6} more` : ''}
        </div>
      )}
    </div>
  )
}
