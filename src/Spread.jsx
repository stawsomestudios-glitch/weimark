import { useEffect, useMemo, useRef, useState } from 'react'
import { addDrawings, deleteDrawing, listDrawings, saveDrawing } from './album.js'
import { opacity } from './memory.js'

// A route area opened as a book spread, after Kevin Lynch's "The Image of the City":
// left page  = the streets and buildings: buildings nobody named as a thin outline, named ones solid black;
//              the names of the remembered places are the caption under it; street names, north arrow and scale
// right page = the drawings people made of it from memory, as a slide album
export default function Spread({ zone, index, count, city, geo, names, tally, wmax, onClose, onGo, embedded = false }) {
  const [showRoute, setShowRoute] = useState(false) // the walking route is off until we have the routes people actually mentioned
  const ref = useRef()
  useEffect(() => {
    const k = (e) => {
      if (embedded) return // in the presentation, the presentation's keys move on
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      if (e.key === 'Escape' && !document.fullscreenElement) onClose()
      if (e.key === 'PageDown') onGo(1)
      if (e.key === 'PageUp') onGo(-1)
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose, onGo, embedded])
  // a square of the map grid (title), or two places
  const title = zone.title ?? `${names[zone.a]} – ${names[zone.b]}`
  return (
    <div className={'spread-wrap' + (embedded ? ' embedded' : '')} ref={ref}>
      {!embedded && <div className="spread-bar">
        <button onClick={() => onGo(-1)} disabled={count < 2}>
          ‹ Previous square
        </button>
        <span>
          <b>{title}</b>{zone.places?.length ? <span className="muted"> · {zone.places.length} remembered {zone.places.length === 1 ? 'place' : 'places'}</span> : null}
        </span>
        <button onClick={() => onGo(1)} disabled={count < 2}>
          Next square ›
        </button>
        <button onClick={() => (document.fullscreenElement ? document.exitFullscreen() : ref.current?.requestFullscreen())}>Full screen</button>
        <button className="primary" onClick={onClose}>
          Back to the map
        </button>
      </div>}
      <div className="spread">
        <div className="page left">
          <Plan zone={zone} city={city} geo={geo} names={names} tally={tally} wmax={wmax} showRoute={showRoute} />
          <p className="fig">
            <span className="fign">Fig. {2 * index + 1}.</span> {zone.places?.length ? zone.places.map((p) => names[p.id]).join(', ') : title}
          </p>
        </div>
        <div className="page right">
          <Album key={zone.id} zone={zone} fig={2 * index + 2} title={title} keys={!embedded} />
        </div>
      </div>
    </div>
  )
}

// ---------- the plan ----------
export function Plan({ zone, city, geo, names, tally, wmax, showRoute }) {
  const [x0, y0, x1, y1] = zone.box
  const W = x1 - x0
  const H = y1 - y0
  const P = ([x, y]) => [x - x0, y1 - y]
  const d = (r) => 'M' + r.map((q) => P(q).map((v) => v.toFixed(1)).join(',')).join('L') + 'Z'
  const pl = (l) => l.map((q) => P(q).map((v) => v.toFixed(1)).join(',')).join(' ')
  const near = (r) => r.some(([x, y]) => x > x0 - 30 && x < x1 + 30 && y > y0 - 30 && y < y1 + 30)
  const plan = useMemo(() => {
    // buildings nobody named: outlines; named ones: grouped by how often, each group its own hatch
    const plain = []
    const named = new Map() // strength -> paths
    city.buildings.forEach((b, i) => {
      if (!near(b.p)) return
      const w = tally.building.get(i)?.w
      if (!w) return plain.push(d(b.p))
      if (!named.has(w)) named.set(w, [])
      named.get(w).push(d(b.p))
    })
    // squares, parks and named streets in the page
    const areas = new Map()
    const streets = []
    const tags = []
    for (const [id, t] of Object.entries(tally.place)) {
      const g = geo[id]
      if (!g) continue
      if (g.kind === 'area') {
        const rs = g.p.filter(near)
        if (!rs.length) continue
        if (!areas.has(t.w)) areas.set(t.w, [])
        areas.get(t.w).push(...rs.map(d))
      } else if (g.kind === 'street' || g.kind === 'river') {
        for (const l of g.l) if (near(l)) streets.push({ w: t.w, pts: pl(l), river: g.kind === 'river' })
      }
      const [px, py] = g.at
      if (id !== zone.a && id !== zone.b && px > x0 && px < x1 && py > y0 && py < y1) tags.push({ id, at: P(g.at), w: t.w })
    }
    // one name per street, on its longest straight piece inside the page
    const best = new Map()
    for (const r of city.roads) {
      if (!r.n) continue
      for (let i = 1; i < r.l.length; i++) {
        const a = r.l[i - 1]
        const b = r.l[i]
        const m = 0.06
        const ok = (q) => q[0] > x0 + W * m && q[0] < x1 - W * m && q[1] > y0 + H * m && q[1] < y1 - H * m
        if (!ok(a) || !ok(b)) continue
        const L = Math.hypot(b[0] - a[0], b[1] - a[1])
        if (L > (best.get(r.n)?.L ?? 0)) best.set(r.n, { L, a, b })
      }
    }
    const fs = H / 52
    const labels = [...best].filter(([n, s]) => s.L > n.length * fs * 0.42).map(([n, s]) => {
      const [ax, ay] = P(s.a)
      const [bx, by] = P(s.b)
      let ang = (Math.atan2(by - ay, bx - ax) * 180) / Math.PI
      if (ang > 90) ang -= 180
      if (ang < -90) ang += 180
      return { n, x: (ax + bx) / 2, y: (ay + by) / 2, ang }
    })
    const route = []
    for (const k of zone.path ?? []) {
      const a = city.graph.e[2 * k]
      const b = city.graph.e[2 * k + 1]
      route.push([P([city.graph.n[2 * a], city.graph.n[2 * a + 1]]), P([city.graph.n[2 * b], city.graph.n[2 * b + 1]])])
    }
    return { plain, named: [...named].sort((p, q) => p[0] - q[0]), areas: [...areas], streets, tags, labels, fs, route }
  }, [zone, city, tally]) // eslint-disable-line react-hooks/exhaustive-deps
  const u = H / 300 // one "pen unit"
  // the hatch of a strength: denser, thicker and blacker the more often named
  const hatchOf = (w) => {
    const sp = u * Math.max(1.05, 4.4 - 0.6 * Math.min(w, 6))
    return { id: 'h' + Math.round(w * 2), sp, sw: u * (0.4 + 0.09 * Math.min(w, 6)), a: opacity(w, wmax) }
  }
  const strengths = [...new Set([...plan.named.map((n) => n[0]), ...plan.areas.map((n) => n[0])])]
  const scale = W > 260 ? 100 : 50
  const ends = [zone.a, zone.b].filter(Boolean).map((id) => ({ id, at: P(geo[id].at), name: names[id] }))
  return (
    <svg className="plan" viewBox={`0 0 ${W.toFixed(1)} ${H.toFixed(1)}`} preserveAspectRatio="xMidYMid meet">
      <defs>
        <clipPath id="page">
          <rect width={W} height={H} />
        </clipPath>
        {strengths.map((w) => {
          const h = hatchOf(w)
          return (
            <pattern key={h.id} id={h.id} width={h.sp} height={h.sp} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2={h.sp} stroke="#111" strokeOpacity={h.a} strokeWidth={h.sw} />
            </pattern>
          )
        })}
        <pattern id="hatch" width={u * 2.2} height={u * 2.2} patternUnits="userSpaceOnUse" patternTransform="rotate(40)">
          <line x1="0" y1="0" x2="0" y2={u * 2.2} stroke="#111" strokeWidth={u * 0.7} />
        </pattern>
      </defs>
      <g clipPath="url(#page)">
        <rect width={W} height={H} fill="#f7f4ec" />
        {plan.areas.map(([w, ps]) => (
          <path key={'a' + w} d={ps.join('')} fill="#111" fillOpacity={hatchOf(w).a * 0.3} stroke="#111" strokeOpacity={hatchOf(w).a} strokeWidth={u * (0.4 + 0.15 * w)} strokeDasharray={`${u * 2} ${u * 1.2}`} />
        ))}
        {plan.streets.map((s, i) => (
          <polyline key={'s' + i} points={s.pts} fill="none" stroke={s.river ? '#9fcbec' : '#111'} strokeOpacity={s.river ? 1 : opacity(s.w, wmax) * 0.5} strokeWidth={u * (2 + 1.2 * s.w)} strokeLinecap="round" strokeLinejoin="round" />
        ))}
        <path d={plan.plain.join('')} fill="none" stroke="#111" strokeWidth={u * 0.35} strokeLinejoin="round" />
        {plan.named.map(([w, ps]) => (
          <path key={'n' + w} d={ps.join('')} fill="#111" stroke="#111" strokeWidth={u * (0.5 + 0.25 * w)} strokeLinejoin="round" />
        ))}
        {showRoute &&
          plan.route.map(([a, b], i) => <line key={i} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="#111" strokeWidth={u * 1.3} strokeDasharray={`${u * 3} ${u * 2}`} strokeLinecap="round" />)}
        {plan.labels.map((l) => (
          <text key={l.n} x={l.x} y={l.y} transform={`rotate(${l.ang} ${l.x} ${l.y})`} className="street" fontSize={plan.fs} textAnchor="middle" dominantBaseline="central" strokeWidth={plan.fs * 0.35}>
            {l.n}
          </text>
        ))}
        {ends.map((e, i) => (
          <g key={e.id}>
            <circle cx={e.at[0]} cy={e.at[1]} r={u * 4} fill="#f7f4ec" stroke="#111" strokeWidth={u * 1.4} />
            <text x={e.at[0] + (e.at[0] > W * 0.55 ? -u * 6 : u * 6)} y={e.at[1] + (i ? u * 9 : -u * 6)} textAnchor={e.at[0] > W * 0.55 ? 'end' : 'start'} className="place" fontSize={plan.fs * 0.95} strokeWidth={plan.fs * 0.4}>
              {e.name.toUpperCase()}
            </text>
          </g>
        ))}
      </g>
      {/* north arrow and scale, bottom left */}
      <rect x={0} y={H - u * 72} width={u * 50} height={u * 72} fill="#f7f4ec" />
      <g transform={`translate(${u * 22} ${H - u * 40})`}>
        <path d={`M0,${-u * 22} L${u * 9},${u * 10} L0,${u * 4} Z`} fill="url(#hatch)" stroke="#111" strokeWidth={u * 0.6} />
        <path d={`M0,${-u * 22} L${-u * 9},${u * 10} L0,${u * 4} Z`} fill="#111" />
        <text x={u * 11} y={-u * 6} fontSize={plan.fs * 1.2} className="lbl">
          N
        </text>
        <g transform={`translate(${-u * 6} ${u * 22})`}>
          <rect width={scale} height={u * 3} fill="url(#hatch)" stroke="#111" strokeWidth={u * 0.5} />
          <text x={0} y={-u * 2} fontSize={plan.fs * 0.95} className="lbl">
            {scale} M
          </text>
        </g>
      </g>
    </svg>
  )
}

// ---------- the album ----------
function Album({ zone, fig, title, keys = true }) {
  const [list, setList] = useState([])
  const [i, setI] = useState(0)
  const [two, setTwo] = useState(false)
  const [drag, setDrag] = useState(false)
  const file = useRef()
  const urls = useMemo(() => list.map((r) => URL.createObjectURL(r.blob)), [list])
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls])
  const reload = () => listDrawings(zone.id).then(setList).catch(() => setList([]))
  useEffect(() => {
    reload()
  }, [zone.id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const k = (e) => {
      if (!keys) return
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      if (e.key === 'ArrowRight') setI((v) => Math.min(list.length - 1, v + 1))
      if (e.key === 'ArrowLeft') setI((v) => Math.max(0, v - 1))
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [list.length, keys])
  const add = async (files) => {
    await addDrawings(zone.id, [...files], list.length ? list.at(-1).order + 1 : 0)
    const n = list.length
    await reload()
    setI(n)
  }
  const cur = list[i]
  const show = two ? [i, i + 1].filter((k) => k < list.length) : [i]
  return (
    <div
      className={'album' + (drag ? ' drag' : '')}
      onDragOver={(e) => {
        e.preventDefault()
        setDrag(true)
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDrag(false)
        add(e.dataTransfer.files)
      }}
    >
      <input ref={file} type="file" accept="image/*" multiple hidden onChange={(e) => add(e.target.files)} />
      {list.length === 0 ? (
        <button className="empty" onClick={() => file.current.click()}>
          <b>Add the drawings</b>
          <span>Drop pictures of how people drew {title} from memory here, or click to choose them.</span>
        </button>
      ) : (
        <>
          <div className={'slides' + (two ? ' two' : '')}>
            {show.map((k) => (
              <img key={list[k].id} src={urls[k]} alt={list[k].caption} />
            ))}
          </div>
          <p className="fig">
            <span className="fign">Fig. {fig}.</span>{' '}
            <input
              className="caption"
              value={cur?.caption ?? ''}
              placeholder="Who drew it"
              onChange={(e) => setList((l) => l.map((r, k) => (k === i ? { ...r, caption: e.target.value } : r)))}
              onBlur={() => cur && saveDrawing(list[i])}
            />
          </p>
          <div className="album-bar">
            <button onClick={() => setI((v) => Math.max(0, v - 1))} disabled={i === 0}>
              ‹
            </button>
            <span className="muted">
              {i + 1} / {list.length}
            </span>
            <button onClick={() => setI((v) => Math.min(list.length - 1, v + 1))} disabled={i >= list.length - 1}>
              ›
            </button>
            <label className="check">
              <input type="checkbox" checked={two} onChange={(e) => setTwo(e.target.checked)} /> Two at a time
            </label>
            <span style={{ flex: 1 }} />
            <button onClick={() => file.current.click()}>Add drawings</button>
            <button
              className="danger"
              onClick={async () => {
                await deleteDrawing(cur.id)
                await reload()
                setI((v) => Math.max(0, v - 1))
              }}
            >
              Remove
            </button>
          </div>
          <div className="thumbs">
            {list.map((r, k) => (
              <img key={r.id} src={urls[k]} className={k === i ? 'on' : ''} onClick={() => setI(k)} alt="" />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
