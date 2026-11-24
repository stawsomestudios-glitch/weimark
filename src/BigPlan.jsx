import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { opacity } from './memory.js'
import { clearAll, listAll, saveDrawing } from './album.js'

// The whole plan of Weimar, from the Hauptbahnhof down to the south end of the Park an der Ilm (Nolli, black and white),
// side by side with the pictures in the folder LANSCAPE/final on the Desktop. Drag a picture onto the plan: it lies on it 15 % see-through,
// so the plan shows under it. On the plan: drag a picture to move it, the corner dot to size it, the top dot to turn it.
// Mouse wheel zooms the plan, dragging the paper moves it. Pictures and where they lie are kept in this browser.
const BOX = [-650, -2050, 1450, 1070] // metres from the map's centre: west, south, east, north
const SEE = 0.85 // a picture on the plan: 85 % cover, 15 % see-through
// places shown in colour on the plan, each with its own colour
export const MARK = {
  hbf: '#1f5fbf', // Hauptbahnhof: blue
  unibib: '#d98a00', // university library (Limona): dark yellow-orange
  hauptgebaeude: '#d71920', // Bauhaus main building: red
  ilmpark: '#2e8b3e', // Park an der Ilm: green
}
// the pictures, video and final map, copied into public/pictures/ by scripts/copy-pictures.mjs (index.json lists them)
const FOLDER = `${import.meta.env.BASE_URL}pictures/`
// once: forget every picture kept in this browser before (they were edited; the folder has the new ones)
const RESET = 'weimar-plan-reset'
const RESET_V = '2026-11-24b'
// the pictures in the folder; where each lies on the plan is kept in this browser
// the images of the opening page live in the same folder, but are not drawings
export const OPENING = { scan: 'scanned-colors_png.png', title: 'png name of the project-01.png', final: 'submit _digital overlap_A2.jpg' }
const notDrawing = (n) => Object.values(OPENING).includes(n)
export const folderFile = (n) => FOLDER + encodeURIComponent(n)
// just the pictures in the folder (for the slides): name and address, without what is kept in the browser
export async function folderPictures() {
  const list = await fetch(FOLDER + 'index.json', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : []))
  return list.map((q) => (typeof q === 'string' ? { name: q, v: 0 } : q)).filter((q) => !notDrawing(q.name)).map(({ name, v }) => ({ id: 'folder:' + name, file: name, src: FOLDER + encodeURIComponent(name) + '?v=' + v }))
}
export async function loadPictures() {
  // the browser's store (where each picture lies on the plan) may be slow or blocked: never wait on it for long
  const settle = (p, ms, fallback) => Promise.race([p.catch(() => fallback), new Promise((ok) => setTimeout(() => ok(fallback), ms))])
  try {
    if (localStorage.getItem(RESET) !== RESET_V) {
      await settle(clearAll(), 1500, null)
      localStorage.setItem(RESET, RESET_V)
    }
  } catch {
    /* private window: nothing kept anyway */
  }
  const [stored, list] = await Promise.all([settle(listAll(), 1500, []), fetch(FOLDER + 'index.json', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : [])).catch(() => [])])
  const files = list.map((q) => (typeof q === 'string' ? { name: q, v: 0 } : q)).filter((q) => !notDrawing(q.name))
  const kept = new Map((stored ?? []).map((r) => [r.id, r]))
  // the file's date is in its address, so an edited picture is loaded again and not taken from the browser's memory
  return files.map(({ name: n, v }) => {
    const id = 'folder:' + n
    const k = kept.get(id)
    return { id, zone: 'folder', file: n, src: FOLDER + encodeURIComponent(n) + '?v=' + v, caption: k?.caption ?? n.replace(/\.[^.]+$/, ''), at: k?.at ?? null }
  })
}

// the plan itself, clean: every building solid black, the Ilm as a thin black line, a north arrow and a scale.
// With a tally (the presentation): the buildings nobody named pale grey, the remembered ones black (the more people,
// the blacker), remembered squares and streets drawn in black too. The four marked places keep their colours.
export function Nolli({ city, geo, tally = null, wmax = 1 }) {
  const clip = 'sheet' + useId().replace(/:/g, '')
  const [x0, y0, x1, y1] = BOX
  const W = x1 - x0
  const H = y1 - y0
  const art = useMemo(() => {
    const P = ([x, y]) => (x - x0).toFixed(1) + ',' + (y1 - y).toFixed(1)
    const inBox = (r) => r.some(([x, y]) => x > x0 - 50 && x < x1 + 50 && y > y0 - 50 && y < y1 + 50)
    const colOf = new Map(Object.entries(MARK).flatMap(([id, c]) => (geo?.[id]?.b ?? []).map((i) => [i, c])))
    const b = []
    const marked = [] // [colour, path]
    const named = new Map() // opacity -> paths (presentation)
    const add = (a, d) => {
      const k = Math.round(a * 20) / 20
      if (!named.has(k)) named.set(k, [])
      named.get(k).push(d)
    }
    city.buildings.forEach((q, i) => {
      if (!inBox(q.p)) return
      const d = 'M' + q.p.map(P).join('L') + 'Z'
      if (colOf.has(i)) marked.push([colOf.get(i), d])
      else if (tally?.building.has(i)) add(opacity(tally.building.get(i).w, wmax), d)
      else b.push(d)
    })
    // remembered squares, streets and spots (not the four marked places)
    const tAreas = []
    const tLines = []
    if (tally)
      for (const [id, t] of Object.entries(tally.place)) {
        const g = geo?.[id]
        if (!g || MARK[id]) continue
        const a = opacity(t.w, wmax)
        if (g.kind === 'area') tAreas.push([a, g.p.filter(inBox).map((r) => 'M' + r.map(P).join('L') + 'Z').join('')])
        else if (g.kind === 'street') tLines.push([a, g.l.filter(inBox).map((l) => 'M' + l.map(P).join('L')).join('')])
        else if (g.kind === 'spot' && inBox([g.at])) add(a, 'M' + Array.from({ length: 16 }, (_, k) => P([g.at[0] + Math.cos((k / 16) * 6.283) * 14, g.at[1] + Math.sin((k / 16) * 6.283) * 14])).join('L') + 'Z')
      }
    const areas = Object.entries(MARK)
      .filter(([id]) => geo?.[id]?.kind === 'area')
      .map(([id, c]) => [c, geo[id].p.map((r) => 'M' + r.map(P).join('L') + 'Z').join('')])
    const river = (geo?.ilm?.l ?? []).filter(inBox).map((l) => 'M' + l.map(P).join('L'))
    return { b: b.join(''), marked, areas, river: river.join(''), named: [...named].sort((p, q) => p[0] - q[0]).map(([a, ps]) => [a, ps.join('')]), tAreas, tLines }
  }, [city, geo, tally, wmax]) // eslint-disable-line react-hooks/exhaustive-deps
  const u = H / 300
  return (
    <svg className="plan" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ overflow: 'hidden' }}>
      <defs>
        <clipPath id={clip}>
          <rect width={W} height={H} />
        </clipPath>
      </defs>
      <rect width={W} height={H} fill="#fff" />
      <g clipPath={`url(#${clip})`}>
        <path d={art.river} fill="none" stroke="#000" strokeWidth="1" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        {art.areas.map(([c, d], k) => (
          <path key={k} d={d} fill={c} fillOpacity="0.22" stroke={c} strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        ))}
        {art.tAreas.map(([a, d], k) => (
          <path key={'ta' + k} d={d} fill="#000" fillOpacity={a * 0.12} stroke="#000" strokeOpacity={a} strokeWidth="1" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        ))}
        {art.tLines.map(([a, d], k) => (
          <path key={'tl' + k} d={d} fill="none" stroke="#000" strokeOpacity={a} strokeWidth="3" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
        ))}
        <path d={art.b} fill={tally ? '#d9d9d9' : '#000'} />
        {art.named.map(([a, d]) => (
          <path key={'n' + a} d={d} fill="#000" fillOpacity={a} />
        ))}
        {art.marked.map(([c, d], k) => (
          <path key={k} d={d} fill={c} />
        ))}
      </g>
      <rect x={0} y={H - u * 52} width={u * 34} height={u * 52} fill="#fff" />
      <g transform={`translate(${u * 16} ${H - u * 30})`}>
        <path d={`M0,${-u * 14} L${u * 5},${u * 6} L0,${u * 3} L${-u * 5},${u * 6} Z`} fill="#000" />
        <text x={0} y={-u * 16} fontSize={u * 6} textAnchor="middle" className="lbl">
          N
        </text>
        <rect x={-u * 5} y={u * 12} width={100} height={u * 1.2} fill="#000" />
        <text x={-u * 5} y={u * 20} fontSize={u * 4.5} className="lbl">
          100 m
        </text>
      </g>
    </svg>
  )
}

export default function BigPlan({ city, geo, onClose, embedded = false }) {
  const W = BOX[2] - BOX[0]
  const H = BOX[3] - BOX[1]
  const [pics, setPics] = useState([])
  const [sel, setSel] = useState(null)
  const [cam, setCam] = useState({ s: 1, x: 0, y: 0 }) // zoom and pan of the plan
  const [unit, setUnit] = useState(1) // screen pixels per metre (handles keep their size on screen)
  const [dragOver, setDragOver] = useState(null) // 'plan' while a picture is dragged over it
  const svg = useRef()
  const view = useRef()
  const act = useRef(null) // what the mouse is doing: move, size, turn or pan

  const urls = useMemo(() => Object.fromEntries(pics.map((r) => [r.id, r.blob ? URL.createObjectURL(r.blob) : r.src])), [pics.map((r) => r.id).join()]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => Object.values(urls).forEach((u) => u.startsWith('blob:') && URL.revokeObjectURL(u)), [urls])
  const reload = () => loadPictures().then(setPics).catch(() => setPics([]))
  useEffect(() => {
    reload()
  }, [])
  useEffect(() => {
    const k = (e) => {
      if (embedded) return
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      if (e.key === 'Escape' && !document.fullscreenElement) onClose()
      if ((e.key === 'Delete' || e.key === 'Backspace') && sel) takeOff(sel)
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }) // eslint-disable-line react-hooks/exhaustive-deps
  // screen pixels per metre, for the size of the handles
  useEffect(() => {
    const m = () => setUnit(svg.current?.getScreenCTM()?.a || 1)
    m()
    window.addEventListener('resize', m)
    return () => window.removeEventListener('resize', m)
  }, [cam])

  // a point on the screen, in plan metres (0,0 = top left of the plan)
  const toPlan = (cx, cy) => {
    const p = svg.current.createSVGPoint()
    p.x = cx
    p.y = cy
    const q = p.matrixTransform(svg.current.getScreenCTM().inverse())
    return [q.x, q.y]
  }
  const update = (id, f) => setPics((l) => l.map((r) => (r.id === id ? f(r) : r)))
  const store = (id) => {
    const r = pics.find((q) => q.id === id)
    if (r) saveDrawing(r)
  }
  // lay a picture on the plan, centred where it was dropped, a quarter of the plan wide
  const place = async (rec, x, y) => {
    const ar = await new Promise((ok) => {
      const im = new Image()
      im.onload = () => ok(im.naturalHeight / im.naturalWidth || 1)
      im.onerror = () => ok(1)
      im.src = urls[rec.id] ?? rec.src
    })
    const w = W * 0.25
    const next = { ...rec, at: { x: x - w / 2, y: y - (w * ar) / 2, w, ar, r: 0 } }
    await saveDrawing(next)
    setPics((l) => (l.some((q) => q.id === rec.id) ? l.map((q) => (q.id === rec.id ? next : q)) : [...l, next]))
    setSel(rec.id)
  }
  const takeOff = async (id) => {
    const r = pics.find((q) => q.id === id)
    if (!r) return
    const next = { ...r, at: null }
    await saveDrawing(next)
    update(id, () => next)
    setSel(null)
  }

  // ---- the mouse on the plan ----
  const down = (e, id, mode) => {
    e.stopPropagation()
    e.preventDefault()
    svg.current.setPointerCapture(e.pointerId)
    const [px, py] = toPlan(e.clientX, e.clientY)
    if (mode === 'pan') {
      setSel(null)
      act.current = { mode, sx: e.clientX, sy: e.clientY, cam }
      return
    }
    setSel(id)
    const r = pics.find((q) => q.id === id)
    act.current = { mode, id, px, py, at: { ...r.at } }
  }
  const move = (e) => {
    const a = act.current
    if (!a) return
    if (a.mode === 'pan') {
      setCam({ ...a.cam, x: a.cam.x + e.clientX - a.sx, y: a.cam.y + e.clientY - a.sy })
      return
    }
    const [px, py] = toPlan(e.clientX, e.clientY)
    const at = a.at
    const cx = at.x + at.w / 2
    const cy = at.y + (at.w * at.ar) / 2
    if (a.mode === 'move') update(a.id, (r) => ({ ...r, at: { ...at, x: at.x + px - a.px, y: at.y + py - a.py } }))
    else if (a.mode === 'size') {
      // the corner's distance from the centre sets the size; the centre stays put
      const k = Math.hypot(px - cx, py - cy) / Math.hypot(a.px - cx, a.py - cy)
      const w = Math.max(20, at.w * k)
      update(a.id, (r) => ({ ...r, at: { ...at, w, x: cx - w / 2, y: cy - (w * at.ar) / 2 } }))
    } else if (a.mode === 'turn') {
      const ang = (Math.atan2(py - cy, px - cx) * 180) / Math.PI + 90
      update(a.id, (r) => ({ ...r, at: { ...at, r: e.shiftKey ? Math.round(ang / 15) * 15 : ang } }))
    }
  }
  const up = () => {
    const a = act.current
    act.current = null
    if (a && a.mode !== 'pan') store(a.id)
  }
  // the mouse wheel zooms around the pointer
  useEffect(() => {
    const el = view.current
    const wheel = (e) => {
      e.preventDefault()
      const b = el.getBoundingClientRect()
      const mx = e.clientX - b.left
      const my = e.clientY - b.top
      setCam((c) => {
        const s = Math.min(12, Math.max(1, c.s * Math.exp(-e.deltaY * 0.0015)))
        return { s, x: mx - ((mx - c.x) * s) / c.s, y: my - ((my - c.y) * s) / c.s }
      })
    }
    el.addEventListener('wheel', wheel, { passive: false })
    return () => el.removeEventListener('wheel', wheel)
  }, [])

  // a picture dragged from the list, dropped on the plan
  const dropOnPlan = (e) => {
    e.preventDefault()
    setDragOver(null)
    const [x, y] = toPlan(e.clientX, e.clientY)
    const id = e.dataTransfer.getData('text/x-picture')
    if (id) {
      const r = pics.find((q) => q.id === id)
      if (r) place(r, x, y)
    }
  }

  const h = 9 / unit // handle radius: 9 screen pixels
  const onPlan = pics.filter((r) => r.at)
  const cur = pics.find((r) => r.id === sel)
  return (
    <div className={'spread-wrap' + (embedded ? ' embedded' : '')}>
      {!embedded && (
        <div className="spread-bar">
          <span>
            <b>Weimar, from the Hauptbahnhof to the Park an der Ilm</b> <span className="muted">· drag pictures onto the plan</span>
          </span>
          <button onClick={() => setCam({ s: 1, x: 0, y: 0 })}>Whole plan</button>
          <button className="primary" onClick={onClose}>
            Back to the map
          </button>
        </div>
      )}
      <div className="spread bigplan">
        <div className="page left">
          <div
            className={'bp-view' + (dragOver === 'plan' ? ' drag' : '')}
            ref={view}
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver('plan')
            }}
            onDragLeave={() => setDragOver(null)}
            onDrop={dropOnPlan}
          >
            <div className="bp-stage" style={{ transform: `translate(${cam.x}px, ${cam.y}px) scale(${cam.s})` }}>
              <Nolli city={city} geo={geo} />
              <svg className="bp-over" ref={svg} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
                <rect width={W} height={H} fill="transparent" style={{ cursor: act.current?.mode === 'pan' ? 'grabbing' : 'grab' }} onPointerDown={(e) => down(e, null, 'pan')} />
                {onPlan.map((r) => {
                  const { x, y, w, ar, r: rot } = r.at
                  const hh = w * ar
                  const on = r.id === sel
                  return (
                    <g key={r.id} transform={`rotate(${rot} ${x + w / 2} ${y + hh / 2})`}>
                      <image href={urls[r.id]} x={x} y={y} width={w} height={hh} opacity={SEE} preserveAspectRatio="none" style={{ cursor: 'move' }} onPointerDown={(e) => down(e, r.id, 'move')} />
                      {on && (
                        <>
                          <rect x={x} y={y} width={w} height={hh} fill="none" stroke="#d4471c" strokeWidth={1.5 / unit} strokeDasharray={`${6 / unit} ${4 / unit}`} pointerEvents="none" />
                          <line x1={x + w / 2} y1={y} x2={x + w / 2} y2={y - 4 * h} stroke="#d4471c" strokeWidth={1.5 / unit} />
                          <circle cx={x + w / 2} cy={y - 4 * h} r={h} className="bp-handle" style={{ cursor: 'grab' }} onPointerDown={(e) => down(e, r.id, 'turn')}>
                            <title>Turn (hold Shift for steps of 15°)</title>
                          </circle>
                          <circle cx={x + w} cy={y + hh} r={h} className="bp-handle" style={{ cursor: 'nwse-resize' }} onPointerDown={(e) => down(e, r.id, 'size')}>
                            <title>Make bigger or smaller</title>
                          </circle>
                        </>
                      )}
                    </g>
                  )
                })}
              </svg>
            </div>
          </div>
          <p className="fig">
            <span className="fign">Fig. 1.</span> Weimar from the Hauptbahnhof to the Park an der Ilm{onPlan.length ? `, with ${onPlan.length} ${onPlan.length === 1 ? 'picture' : 'pictures'} laid on it` : ''}
          </p>
        </div>

        <div className="page right bp-tray">
          <div className="bp-head">
            <h2>Pictures</h2>
            <button onClick={reload} title="Load the pictures from the folder again (after you add or edit some)">
              Reload folder
            </button>
          </div>
          {pics.length === 0 ? (
            <div className="bp-empty">
              <b>No pictures yet</b>
              <span>Put the pictures in the folder LANSCAPE/final on the Desktop, then click Reload folder.</span>
            </div>
          ) : (
            <>
              <p className="muted small bp-help">Drag a picture onto the plan. On the plan: drag to move it, the corner dot to size it, the top dot to turn it. Mouse wheel zooms the plan.</p>
              <div className="bp-grid">
                {pics.map((r) => (
                  <figure
                    key={r.id}
                    className={(r.at ? 'placed' : '') + (r.id === sel ? ' on' : '')}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/x-picture', r.id)
                      e.dataTransfer.effectAllowed = 'copy'
                    }}
                    onClick={() => setSel(r.id)}
                  >
                    <img src={urls[r.id]} alt={r.caption} draggable={false} />
                    <figcaption>
                      <input
                        className="caption"
                        value={r.caption ?? ''}
                        placeholder="Who drew it"
                        onChange={(e) => update(r.id, (q) => ({ ...q, caption: e.target.value }))}
                        onBlur={() => store(r.id)}
                      />
                      {r.at && <span className="bp-tag">on the plan</span>}
                    </figcaption>
                  </figure>
                ))}
              </div>
            </>
          )}
          {cur && (
            <div className="album-bar">
              <b className="bp-cur">{cur.caption || 'Picture'}</b>
              <span style={{ flex: 1 }} />
              {cur.at && <button onClick={() => takeOff(cur.id)}>Take off the plan</button>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
