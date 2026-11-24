import { useEffect, useMemo, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { Camera, VIEWS } from './Views.jsx'
import { PLACES } from './places.js'
import { LISTS } from './lists.js'
import { detail, grey, opacity, makeGraph, matchPlace, parseLine, tally as makeTally } from './memory.js'
import { Base, Memory, Zones, fmt } from './City.jsx'
import { makeGrid } from './grid.js'
import BigPlan from './BigPlan.jsx'
import PresentSlide, { Contents, Opening, SUBSTEPS, isPilot } from './Present.jsx'
import { centroid } from './geom.js'

// What you add on the page (new lists, places you set yourself, lists switched off) is kept in this browser.
const KEY = 'weimar-memory-v1'
// The site is the presentation only. The old map page (3D city, lists panel, title) is still in the code below:
// set this to true to bring it back.
const FULL = false
// the presentation's stages by name, in order (their titles and steps are in STAGES, inside App)
const STAGE_IDS = ['intro', 'pilot', 'single', 'redrawings', 'abstraction', 'back', 'plan', 'keys', 'video', 'finalmap']
const load = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY)) ?? {}
  } catch {
    return {}
  }
}

export default function App() {
  const [city, setCity] = useState(null)
  const [placeGeo, setPlaceGeo] = useState(null)
  const [error, setError] = useState(null)
  const [saved, setSaved] = useState(load)
  const [hover, setHover] = useState(null)
  const [sel, setSel] = useState(null)
  const [placing, setPlacing] = useState(null) // { lid, i, text }
  const [draft, setDraft] = useState({ name: '', text: '' })
  const [open, setOpen] = useState({})
  const [view, setView] = useState('top')
  const [viewN, setViewN] = useState(0)
  // the opening page (title and scan) until Start is clicked; #present… in the address skips it
  const [started, setStarted] = useState(() => FULL || /^#present/.test(location.hash))
  const [toc, setToc] = useState(false) // the table of contents on the left: popped out or folded in
  const [planOpen, setPlanOpen] = useState(() => location.hash === '#plan') // the whole plan with the pictures laid on it (#plan opens it at once)
  const [solo, setSolo] = useState(null) // one person's list shown alone (its id), or null for everyone
  // the presentation: { stage: its number in STAGES (below), step: which person or which part of the stage }
  const [present, setPresent] = useState(() => {
    // the site opens on the presentation; #present4 in the address opens stage 4, #present4.2 its third step
    const m = location.hash.match(/^#present(\d+)?(?:\.(\d+))?$/)
    return m || !FULL ? { stage: +(m?.[1] || 1), step: +(m?.[2] || 0) } : null
  })
  const [zoneHover, setZoneHover] = useState(null) // the route area pointed at in the side panel // number of the route area shown as a spread
  useEffect(() => {
    const url = (f) => `${import.meta.env.BASE_URL}data/${f}`
    Promise.all(['city.json', 'places.json'].map((f) => fetch(url(f)).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${f}: ${r.status}`))))))
      .then(([c, p]) => {
        setCity(c)
        setPlaceGeo(p)
      })
      .catch((e) => setError(e.message))
  }, [])
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(saved))
    } catch {
      /* private window: nothing kept */
    }
  }, [saved])
  const opt = (k, v) => saved[k] ?? v
  const labels = opt('labels', 'strong')
  const topOnly = opt('topOnly', false) // show only the most remembered places on the map
  const sideOpen = opt('side', true) // the info panel on the left: open or folded away
  const showZones = opt('zones', true)

  // all lists: the ones in the code, then yours; places you set yourself replace "not placed"
  const lists = useMemo(() => {
    const over = saved.over ?? {}
    return [...LISTS, ...(saved.extra ?? [])].map((L) => ({
      ...L,
      mine: !LISTS.includes(L),
      on: true, // every list counts (there are no tick boxes any more)
      entries: L.entries.map((e, i) => ({ ...e, place: over[L.id + '#' + i] ?? e.place })),
    }))
  }, [saved.over, saved.off, saved.extra]) // eslint-disable-line react-hooks/exhaustive-deps
  const custom = saved.custom ?? {}
  const geo = useMemo(() => (placeGeo ? { ...placeGeo, ...custom } : null), [placeGeo, saved.custom]) // eslint-disable-line react-hooks/exhaustive-deps
  const names = useMemo(() => ({ ...Object.fromEntries(PLACES.map((p) => [p.id, p.name])), ...Object.fromEntries(Object.entries(custom).map(([k, v]) => [k, v.name])) }), [saved.custom]) // eslint-disable-line react-hooks/exhaustive-deps
  const G = useMemo(() => (city ? makeGraph(city.graph) : null), [city])
  // the person shown alone: picked in the lists, or the slide of stage 1 of the presentation
  const sid = present ? STAGE_IDS[present.stage - 1] : null // which stage, by name
  // the people of each phase (pilot on A5, the rest unguided on A4), in the order of the lists
  const phase = useMemo(() => ({ pilot: lists.filter((L) => isPilot(L.name)), single: lists.filter((L) => !isPilot(L.name)) }), [lists])
  // the person on the slide: in each phase, step 0 is the overview, then one person per step
  // in each phase: step 0 its method, step 1 the overview, then one person per step
  const slidePerson = present && phase[sid] && present.step > 1 ? phase[sid][present.step - 2] ?? null : null
  const soloNow = present ? slidePerson?.id ?? null : solo
  const T = useMemo(() => {
    if (!geo || !G) return null
    const t = makeTally(soloNow ? lists.map((L) => ({ ...L, on: L.id === soloNow })) : lists, geo, G)
    t.names = names
    return t
  }, [lists, geo, G, names, soloNow])
  const wmax = T ? Math.max(1, ...Object.values(T.place).map((p) => p.w), ...[...T.building.values()].map((b) => b.w)) : 1
  const rmax = T ? Math.max(1, ...T.edge.values()) : 1

  // clicking in the model: place a list entry, or pick a remembered place to read about it
  const onPick = (e, tag) => {
    e.stopPropagation()
    if (!placing) {
      if (typeof tag === 'string') setSel(tag)
      else setSel(null)
      return
    }
    let id
    let add = null
    if (typeof tag === 'string' && tag[0] === 'p') id = tag.slice(1)
    else if (typeof tag === 'string' && tag[0] === 'b') tag = +tag.slice(1)
    if (!id && typeof tag === 'number') {
      id = 'c-b' + tag
      add = { name: placing.text.replace(/\s+1$/, ''), kind: 'building', b: [tag], at: centroid(city.buildings[tag].p) }
    } else if (!id) {
      const at = [Math.round(e.point.x * 10) / 10, Math.round(-e.point.z * 10) / 10]
      id = 'c-s' + at.join('_')
      add = { name: placing.text.replace(/\s+1$/, ''), kind: 'spot', at }
    }
    setSaved((s) => ({
      ...s,
      custom: add && !s.custom?.[id] ? { ...(s.custom ?? {}), [id]: add } : s.custom,
      over: { ...(s.over ?? {}), [placing.lid + '#' + placing.i]: id },
    }))
    setPlacing(null)
  }
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && setPlacing(null)
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [])

  const addList = () => {
    const entries = draft.text
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const q = parseLine(l)
        return { text: q.text, place: matchPlace(q.name, PLACES), half: q.half }
      })
    if (!entries.length) return
    const n = lists.length + 1
    setSaved((s) => ({ ...s, extra: [...(s.extra ?? []), { id: 'x' + Date.now(), name: draft.name.trim() || `Person ${n}`, entries }] }))
    setDraft({ name: '', text: '' })
  }
  const exportAll = () => {
    const data = { lists: lists.map(({ id, name, entries }) => ({ id, name, entries })), places: custom }
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
    a.download = 'weimar-memory-lists.json'
    a.click()
  }

  // what the mouse is on, or what was clicked
  const info = (() => {
    const t = hover ?? sel
    if (!t || !T) return null
    const ids = t[0] === 'b' ? [...(T.building.get(+t.slice(1))?.places ?? [])] : [t.slice(1)]
    const rows = ids.map((id) => ({ id, name: names[id], ...T.place[id] }))
    return { w: t[0] === 'b' ? T.building.get(+t.slice(1))?.w : T.place[t.slice(1)]?.w, rows }
  })()
  const ranking = useMemo(() => (T ? Object.entries(T.place).sort((a, b) => b[1].w - a[1].w) : []), [T])
  // with "only the most remembered" on: just those 12 stand out; every other place is drawn plain
  const onlyOn = present ? sid === 'words' : topOnly && !solo
  const only = useMemo(() => (onlyOn ? new Set(ranking.slice(0, 12).map(([id]) => id)) : null), [onlyOn, ranking])
  const shown = (B) => !only || [...B.places].some((id) => only.has(id))
  const skip = useMemo(() => new Set(T ? [...T.building].filter(([, B]) => shown(B)).map(([i]) => i) : []), [T, only]) // eslint-disable-line react-hooks/exhaustive-deps
  const placed = lists.filter((L) => L.on).reduce((a, L) => a + L.entries.filter((e) => e.place).length, 0)
  const total = lists.filter((L) => L.on).reduce((a, L) => a + L.entries.length, 0)

  // the squares of the zoom-ins (only the ones with remembered places in them can be opened)
  const grid = useMemo(() => (T && geo ? makeGrid(T, geo) : null), [T, geo])
  const zones = useMemo(() => (grid ? grid.cells.filter((q) => q.places.length).map((q) => ({ ...q, title: 'Square ' + q.name })) : []), [grid])
  const plan = planOpen && T && <BigPlan city={city} geo={geo} names={names} tally={T} wmax={wmax} onClose={() => setPlanOpen(false)} />
  const soloList = lists.find((L) => L.id === solo)
  // the stages of the presentation, in the order of the talk
  const STAGES = [
    { id: 'intro', name: 'The image of the city', steps: SUBSTEPS.intro.length },
    { id: 'pilot', name: 'Phase one: pilot (guided)', steps: 2 + phase.pilot.length },
    { id: 'single', name: 'Phase two: unguided', steps: 2 + phase.single.length },
    { id: 'redrawings', name: 'Redrawings', steps: SUBSTEPS.redrawings.length },
    { id: 'abstraction', name: 'Abstraction', steps: 1 },
    { id: 'back', name: 'Back to the drawing board', steps: 1 },
    { id: 'plan', name: 'Overlay on the base map', steps: 1 },
    { id: 'keys', name: 'Four spaces, colour-coded', steps: 1 },
    { id: 'video', name: 'Video', steps: 1 },
    { id: 'finalmap', name: 'Final map', steps: 1 },
  ].map((st, i) => ({ ...st, n: i + 1 }))
  const go = (d) =>
    setPresent((p) => {
      if (!p) return p
      let { stage, step } = p
      step += d
      if (step >= STAGES[stage - 1].steps) {
        if (stage === STAGES.length) return p
        stage += 1
        step = 0
      } else if (step < 0) {
        if (stage === 1) return p
        stage -= 1
        step = STAGES[stage - 1].steps - 1
      }
      return { stage, step }
    })
  const startPresent = () => {
    setPlanOpen(false)
    setPlacing(null)
    setPresent({ stage: 1, step: 0 })
    setView('top')
    setViewN((k) => k + 1)
    document.documentElement.requestFullscreen?.().catch(() => {})
  }
  const stopPresent = () => {
    if (FULL) setPresent(null)
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
  }
  const fullScreen = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.())?.catch?.(() => {})
  const start = () => {
    setStarted(true)
    setPresent({ stage: 1, step: 0 })
    document.documentElement.requestFullscreen?.().catch(() => {})
  }
  useEffect(() => {
    if (!present) return
    const k = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      if (!started) {
        if (['Enter', 'ArrowRight', 'PageDown', ' '].includes(e.key)) {
          e.preventDefault()
          start()
        }
        return
      }
      if (['ArrowRight', 'PageDown', ' '].includes(e.key)) go(1)
      else if (['ArrowLeft', 'PageUp'].includes(e.key)) go(-1)
      else if (e.key === 'Escape' && FULL) stopPresent()
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className={'app' + (placing ? ' placing' : '') + (present ? ' presenting' : '')}>
      {!started && <Opening onStart={start} />}
      {started && present && (
        <Contents
          open={toc}
          onToggle={() => setToc((v) => !v)}
          stages={STAGES}
          present={present}
          people={{ pilot: phase.pilot.map((L) => L.name), single: phase.single.map((L) => L.name) }}
          onGo={(stage, step = 0) => setPresent({ stage, step })}
          onHome={() => setStarted(false)}
        />
      )}
      {!T && <p className="loading">{error ? `The map didn't load (${error}).` : 'Loading Weimar …'}</p>}
      {FULL && (<>
      {/* the title and subtitle across the top; everything else in a panel on the left that folds away */}
      <header className="top">
        <button className="present-btn" onClick={startPresent} title="Show it as a presentation in four stages (arrow keys move on, Esc ends)">
          ▶ Present
        </button>
        <div className="notes">
          <E k="title" as="h1" def="Weimar, remembered" saved={saved} setSaved={setSaved} />
          <E
            k="intro"
            as="p"
            def={`${lists.filter((L) => L.on).length} people named the places they remember. Black and white, like Nolli's plan of Rome: the more people name a place, the blacker, bigger and more detailed it stands in the city. Places nobody named stay pale.`}
            saved={saved}
            setSaved={setSaved}
          />
        </div>
      </header>

      <div className="body">
        <aside className={'side' + (sideOpen ? '' : ' closed')}>
          <div className="side-inner">
            <section className="first">
              <h2>View</h2>
              <span className="seg">
                {VIEWS.map((v) => (
                  <button
                    key={v.id}
                    className={view === v.id ? 'on' : ''}
                    onClick={() => {
                      setView(v.id)
                      setViewN((k) => k + 1)
                    }}
                    title={v.ortho ? 'Parallel view, without perspective' : 'Perspective view'}
                  >
                    {v.name}
                  </button>
                ))}
              </span>
            </section>

            <section>
              <E
                k="half"
                as="p"
                className="small muted"
                def="½ = the person wrote “1” after it: they remembered there was something there but not its name. A building with two named places in it (the Atrium is the mall and Aldi City) adds them up."
                saved={saved}
                setSaved={setSaved}
              />
            </section>

            {/* the ranking belongs to the whole map; it is hidden while one person is shown */}
            {!solo && (
              <section>
                <div className="sec-head">
                  <h2>Most remembered</h2>
                  <button className={'small-btn' + (topOnly ? ' on' : '')} onClick={() => setSaved((q) => ({ ...q, topOnly: !topOnly }))} title="Show only these places on the map, or all remembered places again">
                    {topOnly ? 'Show all again' : 'Show only these'}
                  </button>
                </div>
                <ol className="rank">
                  {ranking.slice(0, 12).map(([id, p]) => (
                    <li key={id} onMouseEnter={() => setSel(geo[id]?.b ? 'b' + geo[id].b[0] : 'p' + id)} onMouseLeave={() => setSel(null)}>
                      {names[id]} <b>{fmt(p.w)}</b>
                    </li>
                  ))}
                </ol>
              </section>
            )}

            <section>
              <h2>The lists</h2>
              <div className="people">
                {lists.map((L) => (
                  <span key={L.id} className={'person' + (solo === L.id ? ' on' : '')}>
                    <button className="who" title={solo === L.id ? 'Back to everyone' : 'Show only what ' + L.name + ' named'} onClick={() => setSolo((v) => (v === L.id ? null : L.id))}>
                      {L.name}
                    </button>
                    <span className="muted small">{L.entries.length}</span>
                  </span>
                ))}
              </div>
              <p className="muted small">
                {placed} of {total} names are on the map. Click a name to see only what that person named, and their list.
              </p>
              <div className="row">
                <button className="link" onClick={() => setOpen((o) => ({ ...o, add: !o.add }))}>
                  {open.add ? 'Close' : '+ Add a list'}
                </button>
                <button className="link" onClick={exportAll}>
                  Download all lists
                </button>
              </div>
            </section>

            {soloList && (
              <section>
                <h2>{soloList.name}</h2>
                <ol className="entries">
                  {soloList.entries.map((e, i) => (
                    <li key={i} className={e.place ? '' : 'unplaced'}>
                      <span className="txt">
                        {e.text}
                        {e.half && <i> ½</i>}
                        {e.place && names[e.place] && norm2(names[e.place]) !== norm2(e.text) && <span className="muted small"> ({names[e.place]})</span>}
                      </span>
                      <button className="link" onClick={() => setPlacing({ lid: soloList.id, i, text: e.text })}>
                        {e.place ? 'Move' : 'Place'}
                      </button>
                    </li>
                  ))}
                </ol>
                {soloList.mine && (
                  <button className="link danger" onClick={() => { setSolo(null); setSaved((s) => ({ ...s, extra: (s.extra ?? []).filter((x) => x.id !== soloList.id) })) }}>
                    Remove this list
                  </button>
                )}
              </section>
            )}

            {open.add && (
              <section>
                <h2>Add a list</h2>
                <input placeholder="Who" value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
                <textarea rows={6} placeholder={'One place per line, e.g.\nMensa\nPark an der Ilm 1'} value={draft.text} onChange={(e) => setDraft((d) => ({ ...d, text: e.target.value }))} />
                <button className="primary" disabled={!draft.text.trim()} onClick={addList}>
                  Add to the map
                </button>
                <p className="muted small">Write “1” after a place they remember only vaguely: it counts ½. Names the map knows are placed at once; the others wait for you to place them.</p>
              </section>
            )}
          </div>
          <button className="side-tab" onClick={() => setSaved((q) => ({ ...q, side: !sideOpen }))} title={sideOpen ? 'Fold the info away' : 'Show the info'}>
            {sideOpen ? '‹' : '›'}
            <span>Info</span>
          </button>
        </aside>

      <div className="view">
        {city && T ? (
          <Canvas shadows gl={{ preserveDrawingBuffer: true }}>
            <Camera view={view} n={viewN} />
            <color attach="background" args={['#f6f6f4']} />
            <hemisphereLight args={['#ffffff', '#dcdcdc', 1.7]} />
            <directionalLight
              position={[-700, 1100, 500]}
              intensity={1.5}
              castShadow
              shadow-mapSize={[4096, 4096]}
              shadow-camera-left={-3600}
              shadow-camera-right={3600}
              shadow-camera-top={3600}
              shadow-camera-bottom={-3600}
              shadow-camera-near={10}
              shadow-camera-far={7000}
              shadow-bias={-0.0004}
            />
            <Base city={city} skip={skip} onPick={onPick} />
            {/* walking routes are off until we have the routes people actually mentioned (Routes in City.jsx) */}
            <Zones zones={zones} show={false} focus={zoneHover} city={city} />
            <Memory city={city} geo={geo} tally={T} wmax={wmax} hover={hover} onHover={setHover} onPick={onPick} labels="off" only={only} />
          </Canvas>
        ) : (
          <p className="loading">{error ? `The map didn't load (${error}).` : 'Loading Weimar …'}</p>
        )}
        {T && !solo && !present && (
          <button className="plan-btn" onClick={() => setPlanOpen(true)} title="The whole plan from the Hauptbahnhof to the Park an der Ilm, with your pictures laid on it">
            <b>Plan &amp; pictures</b>
            <span>Hauptbahnhof to Park an der Ilm</span>
          </button>
        )}
        {solo && !present && (
          <div className="solo">
            Only what <b>{soloList?.name}</b> named
            <button onClick={() => setSolo(null)}>Show everyone</button>
          </div>
        )}
        {placing && (
          <div className="bar">
            Click where <b>{placing.text}</b> is: a building, a named place, or the ground. <button onClick={() => setPlacing(null)}>Cancel (Esc)</button>
          </div>
        )}
        {info && info.rows.length > 0 && (
          <div className="card">
            {info.rows.map((r) => (
              <div key={r.id}>
                <b>{r.name}</b>
                <div className="muted">{(r.who ?? []).map((q) => q.name + (q.half ? ' (½)' : '')).join(', ')}</div>
              </div>
            ))}
            <div className="strength">
              remembered <b>{fmt(info.w ?? 0)}</b> {info.w === 1 ? 'time' : 'times'}
            </div>
          </div>
        )}
        <p className="credit">
          Buildings: 3D building models LoD2 © GDI-Th (dl-de/by-2-0), outside the kit area © OpenStreetMap contributors (ODbL). Streets, green and water: © OpenStreetMap contributors (ODbL).
        </p>
      </div>
      </div>
      </>)}
      {plan}
      {present && (
        <div className="stagebar">
          <div className="stages">
            {STAGES.map((st) => (
              <button key={st.n} className={present.stage === st.n ? 'on' : ''} title={st.name} onClick={() => setPresent({ stage: st.n, step: 0 })}>
                {/* only the stage you are on shows its name, so all of them fit in one row */}
                <span className="sn">{st.n}</span>{present.stage === st.n ? ' ' + st.name : ''}
              </button>
            ))}
          </div>
          <span className="where">
            {slidePerson ? `${slidePerson.name} · ${present.step - 1} of ${phase[sid].length}` : ''}
            {SUBSTEPS[sid] ? `${SUBSTEPS[sid][present.step]} · ${present.step + 1} of ${SUBSTEPS[sid].length}` : ''}
          </span>
          <button onClick={() => go(-1)} title="Back (←)">‹</button>
          <button onClick={() => go(1)} title="On (→ or space)">›</button>
          {FULL ? (
            <button className="primary" onClick={stopPresent} title="End (Esc)">
              End
            </button>
          ) : (
            <button className="primary" onClick={fullScreen} title="Full screen on or off">
              Full screen
            </button>
          )}
        </div>
      )}
      {present && sid !== 'plan' && T && (
        <PresentSlide
          page={STAGES.slice(0, present.stage - 1).reduce((n, st) => n + st.steps, 0) + present.step + 1}
          stage={sid}
          step={present.step}
          person={slidePerson}
          count={phase[sid]?.length ?? 0}
          mainNames={phase.single.map((L) => L.name)}
          city={city}
          geo={geo}
          tally={
            only
              ? { building: new Map([...T.building].filter(([, B]) => [...B.places].some((id) => only.has(id)))), place: Object.fromEntries(Object.entries(T.place).filter(([id]) => only.has(id))) }
              : T
          }
          wmax={wmax}
          ranking={ranking}
          names={names}
          placed={placed}
        />
      )}
      {sid === 'plan' && T && <BigPlan city={city} geo={geo} names={names} tally={T} wmax={wmax} onClose={stopPresent} embedded />}
    </div>
  )
}
// The texts of the page (title, subtitle, the ½ note). They used to be editable on the page;
// texts changed that way on this computer are still shown.
const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
function E({ k, def, saved, as: Tag = 'span', className = '' }) {
  // a text of the page (texts changed earlier on this computer are still shown)
  return <Tag className={className} dangerouslySetInnerHTML={{ __html: saved.notes?.[k] ?? esc(def) }} />
}
const norm2 = (s) => s.toLowerCase().replace(/[^a-zäöüß0-9]/g, '')
