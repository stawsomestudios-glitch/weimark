import { useEffect, useMemo, useRef, useState } from 'react'
import { MARK, Nolli, OPENING, folderFile, folderPictures } from './BigPlan.jsx'
import { fmt } from './City.jsx'

// The slides of the presentation, in the language of the plan with the pictures: white paper, the clean plan,
// the four marked places in their colours. The order follows the Group 3 presentation (see STAGES in App.jsx):
// method, pilot maps, single maps, redrawn map, pictures on the plan, final mapping, four key spaces, redrawn layers.
const LEGEND = [
  ['hbf', 'Hauptbahnhof'],
  ['unibib', 'University library (Limona)'],
  ['hauptgebaeude', 'Bauhaus main building'],
  ['ilmpark', 'Park an der Ilm'],
]
// the video after the four spaces: a file in the pictures folder (LANSCAPE/final)
const VIDEO = 'IMG_1212.mp4' // the site's copy of IMG_1212.MOV (an .mp4 name, so browsers play it)
// the final map: an A2 PDF in the same folder, shown as it is (sharp at any zoom)
const FINAL_MAP = 'submit _digital overlap_A2.pdf'
const key = (s) => (s ?? '').toUpperCase().replace(/[^A-ZÄÖÜ]/g, '')
// images taken from the Group 3 presentation and MIEL.pdf, kept in public/presentation/
const IMG = (n) => `${import.meta.env.BASE_URL}presentation/${n}`
// phase one, the pilot (A5, guided): these seven; everyone else drew in phase two (A4, unguided)
export const PILOT = ['Basak', 'Cleo', 'Eileene', 'Rezvan', 'Arthur', 'Marta', 'Federica']
export const isPilot = (name) => PILOT.some((n) => key(n) === key(name))
// phase two drawings of people who have no list on the site (shown in the overview only); MIEL's came as a PDF
const MAIN_EXTRA = ['Erla', 'Jona', 'Megan', 'Miel']
// the stages that have several steps, and the names of their steps
// the people whose maps were redrawn (light copies of LANSCAPE/final/REDRAWN are in public/presentation/redrawn/)
const REDRAWN = 10
export const SUBSTEPS = {
  intro: ['The image of the city'],
  // one slide per redrawn map (pilot first, then the main study), then the layers, the composites and the core
  redrawings: ['The base map', 'Basak', 'Cleo', 'Eileene', 'Rezvan', 'Arthur', 'Marta', 'Federica', 'Chad', 'Cristian', 'Cledoris', 'Ten individual layers', 'Superimposing the layers', 'Frequencies'],
}
// how many of the 19 mental maps show each of the four key spaces (Group 3, p. 13)
const KEYS = [
  ['ilmpark', 'Park an der Ilm', 18, 'the most consistently drawn open space'],
  ['hbf', 'Weimar Hauptbahnhof', 16, 'incl. six pre-plotted pilot points'],
  ['hauptgebaeude', 'Bauhaus-Universität Main Building', 15, 'fixed origin of the overlay'],
  ['unibib', 'University Library', 11, 'an everyday destination for many'],
]

const Legend = () => (
  <div className="pr-legend">
    {LEGEND.map(([id, n]) => (
      <span key={id}>
        <i style={{ background: MARK[id] }} /> {n}
      </span>
    ))}
  </div>
)
// one page across the whole width
// the number of the slide being shown (set by PresentSlide), printed as the two page numbers of the spread
let PAGE = 0
const Single = ({ kicker, title, children }) => (
  <div className="spread-wrap embedded">
    <div className="spread present one book">
      <div className="page pr-full">
        <div className="slide-kicker">{kicker}</div>
        {title && <h1 className="pr-name">{title}</h1>}
        {children}
        {PAGE > 0 && (
          <>
            <span className="pr-pg l">{String(PAGE * 2).padStart(2, '0')}</span>
            <span className="pr-pg r">{String(PAGE * 2 + 1).padStart(2, '0')}</span>
          </>
        )}
      </div>
    </div>
  </div>
)

export default function PresentSlide({ stage, step, page = 0, person, count, mainNames = [], city, geo, tally, wmax }) {
  PAGE = page
  const [pics, setPics] = useState([])
  useEffect(() => {
    folderPictures().then(setPics).catch(() => setPics([]))
  }, [])
  // a person's drawing: the picture in the folder with the same name
  const picOf = useMemo(() => new Map(pics.map((p) => [key(p.file.replace(/\.[^.]+$/, '')), p])), [pics])
  const srcOf = (name) => picOf.get(key(name))?.src ?? (key(name) === 'MIEL' ? IMG('MIEL.jpg') : null)

  // ---- the image of the city ----
  if (stage === 'intro' && step === 0)
    return (
      <Single kicker="Introduction" title="The image of the city">
        <div className="pr-grid one">
          <figure>
            <img className="pr-shadow" src={IMG('bauhaus-1923.png')} alt="Map of Weimar on the postcard for the Bauhaus exhibition, 1923" />
            <figcaption>Bauhaus-Ausstellung Weimar 1923, postcard: Weimar drawn as it was lived</figcaption>
          </figure>
        </div>
        <p className="pr-foot">People organise cities through paths, edges, districts, nodes and landmarks (Lynch 1960). We attempt to treat subjective recollection as urban knowledge.</p>
      </Single>
    )

  // ---- the method of each phase: the sheet they drew on, and how ----
  if ((stage === 'pilot' || stage === 'single') && step === 0) {
    const one = stage === 'pilot'
    return (
      <Single kicker={one ? 'Single drawn maps · Phase one · method' : 'Single drawn maps · Phase two · method'} title={one ? 'Pilot — guided' : 'Continuation — unguided'}>
        <div className="pr-sheets one">{one ? <SheetA5 /> : <SheetA4 />}</div>
        <p className="pr-foot">
          {one
            ? '7 participants. An A5 sheet with three accurately placed reference points: Weimar Hauptbahnhof, Weimar Berkaer and M18. Without context, participants compressed the spaces in between.'
            : '12 participants. An A4 sheet with one reference point — the Bauhaus-Universität Main Building — placed wherever they wished. No guiding questions, no legend, no fixed orientation, the page as a subjective spatial diary.'}
        </p>
      </Single>
    )
  }

  // ---- the overview of each phase: all its drawings together ----
  if ((stage === 'pilot' || stage === 'single') && step === 1) {
    const one = stage === 'pilot'
    const who = one ? PILOT : [...mainNames, ...MAIN_EXTRA]
    return (
      <Single kicker={one ? 'Single drawn maps · Phase one' : 'Single drawn maps · Phase two'} title={one ? 'Pilot — guided (A5, three fixed points)' : 'Continuation — unguided (A4, one point placed freely)'}>
        <div className={'pr-grid ' + (who.length > 7 ? 'six' : 'seven')}>
          {who.map((n) => {
            const src = srcOf(n)
            return (
              <figure key={n}>
                {src ? <img src={src} alt={`${n}'s drawing`} /> : <div className="pr-blank" />}
                <figcaption>{n}</figcaption>
              </figure>
            )
          })}
        </div>
        <p className="pr-foot">
          {one
            ? 'Pilot mental maps, drawn on A5 sheets around three pre-plotted points (Hauptbahnhof, Berkaer Bf, M18).'
            : 'Unguided mental maps on A4 sheets: one reference point, the Main Building, placed wherever they wished.'}
        </p>
      </Single>
    )
  }

  // ---- redrawings: putting the drawings into readable material ----
  if (stage === 'redrawings') {
    // first, a page explaining the redrawing, with the base map everything was redrawn on
    if (step === 0)
      return (
        <Single kicker="Redrawings" title="Redrawing on a true-to-scale base">
          <div className="pr-grid one">
            <figure>
              <div className="pr-plan">
                <Nolli city={city} geo={geo} />
              </div>
              <figcaption>The base map: a figure-ground plan of Weimar, from the Hauptbahnhof to the Park an der Ilm</figcaption>
            </figure>
          </div>
          <p className="pr-foot">To compare the drawings, a selection of the maps was redrawn one by one onto the same true-to-scale base map of Weimar. Recalled buildings, streets and open spaces were traced where they really are, one colour per participant — turning each personal drawing into readable material that can be laid over the others.</p>
        </Single>
      )
    // the steps after it: the redrawn maps, the layers, the composites and the core
    step -= 1
    const R = SUBSTEPS.redrawings.slice(1)
    const t = R[step]
    const kick = `Redrawings · ${step + 1} of ${R.length}`
    // one person's map: their drawing beside its redrawing on the true-to-scale base map of Weimar
    if (step < REDRAWN) {
      const pilot = isPilot(t)
      return (
        <Single kicker={`Redrawings · ${pilot ? 'pilot' : 'main study'} · ${step + 1} of ${REDRAWN}`} title={t}>
          <div className="pr-grid two">
            <figure>
              {srcOf(t) ? <img src={srcOf(t)} alt={`${t}'s drawing`} /> : <div className="pr-blank" />}
              <figcaption>Drawn from memory</figcaption>
            </figure>
            <figure>
              <img src={IMG(`redrawn/${t.toUpperCase()}.jpg`)} alt={`${t}'s map, redrawn`} />
              <figcaption>Redrawn on the true-to-scale base map</figcaption>
            </figure>
          </div>
          <p className="pr-foot">Each map redrawn onto a base map of Weimar, separating recalled buildings, streets and open spaces: the drawing becomes readable material. One colour per participant.</p>
        </Single>
      )
    }
    if (step === REDRAWN)
      return (
        <Single kicker={kick} title={t}>
          <div className="pr-grid ten">
            {['P01', 'P02', 'P03', 'P04', 'P05', 'P06', 'P07', 'P08', 'P09', 'P11'].map((p) => (
              <figure key={p}>
                <img src={IMG(`layer-${p}.png`)} alt={p} />
                <figcaption>{p}</figcaption>
              </figure>
            ))}
          </div>
          <p className="pr-foot">Redrawn layers without base map: each colour is one participant’s Weimar.</p>
        </Single>
      )
    if (step === REDRAWN + 1)
      return (
        <Single kicker={kick} title={t}>
          <div className="pr-grid two">
            <figure>
              <img src={IMG('superimposed-pilot.png')} alt="Pilot study composite" />
              <figcaption>Pilot study (P01–P06)</figcaption>
            </figure>
            <figure>
              <img src={IMG('superimposed-main.png')} alt="Main study composite" />
              <figcaption>Main study (P07–P09, P11)</figcaption>
            </figure>
          </div>
          <p className="pr-foot">Stacking the redrawn layers turns the personal cities into one composite. The pilot layers cluster tightly around the three pre-plotted points; the unconstrained main-study layers spread further, towards the railway, Weimar West and the edges of the city.</p>
        </Single>
      )
    return (
      <Single kicker={kick} title={t}>
        <div className="pr-grid one">
          <figure>
            <img src={IMG('newcomer-core.png')} alt="Frequency map of all redrawn mental maps" />
            <figcaption>Frequency map of all redrawn mental maps</figcaption>
          </figure>
        </div>
        <p className="pr-foot">Rendered in black and white, all redrawn layers become a frequency map: spaces and streets recalled repeatedly appear brighter and bolder.</p>
      </Single>
    )
  }

  // ---- abstraction (after Lynch) ----
  if (stage === 'abstraction')
    return (
      <Single kicker="Abstraction" title="Abstracting the image">
        <div className="pr-grid one">
          <figure>
            <img src={IMG('abstraction.png')} alt="Abstract map of the composite, after Lynch" />
            <figcaption>Abstract map of the composite, after Lynch (1960)</figcaption>
          </figure>
        </div>
        <p className="pr-foot">Following Lynch, the composite was reduced to its recollected structure: symbolic axes, reference points, edges and borders.</p>
      </Single>
    )

  // ---- back to the drawing board ----
  if (stage === 'back')
    return (
      <Single kicker="Back to the drawing board" title="Something was missing">
        <div className="pr-centre">
          <ul className="pr-aspects">
            <li>
              <b>Size</b> how big a place is drawn
            </li>
            <li>
              <b>Location</b> where it sits within the city
            </li>
            <li>
              <b>Proximity</b> how near or far it is from the others
            </li>
            <li>
              <b>Scale</b> its proportion to the whole sheet
            </li>
            <li>
              <b>Orientation</b> which way the city is turned
            </li>
          </ul>
        </div>
        <p className="pr-foot">Redrawn, superimposed and abstracted, the maps told us what newcomers remember — but lost how they perceive space. So we went back to the original drawings.</p>
      </Single>
    )

  // ---- the final map ----
  if (stage === 'finalmap')
    return (
      <Single kicker="Final map" title="Final map">
        <div className="pr-pdf">
          {/* the JPG made from the A2 PDF (same folder, same name); the PDF itself only if the JPG is missing */}
          <FinalMap />
        </div>
      </Single>
    )

  // ---- the video (played straight from the pictures folder) ----
  if (stage === 'video')
    return (
      <Single kicker="Four spaces, colour-coded" title="Overlaying the films">
        <div className="pr-video">
          <video src={folderFile(VIDEO)} controls autoPlay playsInline preload="auto" />
        </div>
      </Single>
    )

  // ---- the four spaces, colour-coded: the plan, and how many maps show each space ----
  if (stage === 'keys')
    return (
      <Single kicker="Decision" title="Four spaces, colour-coded">
        <div className="pr-grid two">
          <figure>
            <div className="pr-plan">
              <Nolli city={city} geo={geo} />
            </div>
            <figcaption>The four key spaces on the plan of Weimar</figcaption>
          </figure>
          <div className="pr-keys">
            {KEYS.map(([id, n, c, note]) => (
              <div key={id} className="pr-key">
                <i style={{ background: MARK[id] }} />
                <span className="pr-count">
                  {c}
                  <small>/19</small>
                </span>
                <span>
                  <b>{n}</b>
                  <br />
                  <span className="muted">{note}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
        <p className="pr-foot">To read distortion rather than content, we tracked the four spaces drawn by the most participants in every single map: each cut out of transparent coloured film exactly as it was drawn, and all layers stacked with the Main Building strictly aligned.</p>
      </Single>
    )

  // ---- one person: what they remembered on the plan, beside their drawing ----
  if (!person) return null
  return (
    <Single kicker={`${stage === 'pilot' ? 'Phase one — pilot (guided)' : 'Phase two — unguided'} · map ${step - 1} of ${count}`} title={person.name}>
      <div className="pr-grid two">
        <figure>
          <div className="pr-plan">
            <Nolli city={city} geo={geo} tally={tally} wmax={wmax} />
          </div>
          <figcaption>What {person.name} remembered, on the plan of Weimar</figcaption>
        </figure>
        <figure>
          {srcOf(person.name) ? <img src={srcOf(person.name)} alt={`${person.name}'s drawing`} /> : <div className="pr-blank" />}
          <figcaption>Drawn from memory</figcaption>
        </figure>
      </div>
      <p className="pr-foot">
        {person.entries.map((e, i) => (
          <span key={i} className={e.place ? '' : 'unplaced'}>
            {i ? ' · ' : ''}
            {e.text}
            {e.half ? ' ½' : ''}
          </span>
        ))}
      </p>
      <Legend />
    </Single>
  )
}

// the final map: the JPG made from the A2 poster; if it is missing, the PDF itself
function FinalMap() {
  const [missing, setMissing] = useState(false)
  return missing ? <PdfPage src={folderFile(FINAL_MAP)} /> : <img src={folderFile(OPENING.final)} alt="Final map" onError={() => setMissing(true)} />
}

// pdf.js is loaded once, by a script tag (the site's tool will not import files from public/ itself)
let pdfjsReady = null
const loadPdfjs = (base) =>
  (pdfjsReady ??= new Promise((ok, fail) => {
    window.addEventListener('pdfjs-ready', () => ok(window.__pdfjs), { once: true })
    const tag = document.createElement('script')
    tag.type = 'module'
    tag.textContent = `import * as p from '${base}pdf.min.mjs'; window.__pdfjs = p; window.dispatchEvent(new Event('pdfjs-ready'))`
    tag.onerror = fail
    document.head.appendChild(tag)
  }))
// the first page of a PDF, drawn sharp onto the page (with pdf.js, kept in public/pdfjs/)
function PdfPage({ src }) {
  const ref = useRef()
  const [err, setErr] = useState(null)
  useEffect(() => {
    let off = false
    const base = import.meta.env.BASE_URL + 'pdfjs/'
    ;(async () => {
      const pdfjs = await loadPdfjs(base)
      pdfjs.GlobalWorkerOptions.workerSrc = base + 'pdf.worker.min.mjs'
      const doc = await pdfjs.getDocument(src).promise
      const page = await doc.getPage(1)
      if (off) return
      const box = ref.current.parentElement.getBoundingClientRect()
      const v1 = page.getViewport({ scale: 1 })
      // as large as fits, then twice that for sharpness (and more on high-density screens)
      const fit = Math.min(box.width / v1.width, box.height / v1.height)
      const vp = page.getViewport({ scale: fit * 2 * (window.devicePixelRatio || 1) })
      const c = ref.current
      c.width = vp.width
      c.height = vp.height
      c.style.width = v1.width * fit + 'px'
      c.style.height = v1.height * fit + 'px'
      await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise
    })().catch((e) => {
      if (!off) setErr(e.message)
    })
    return () => {
      off = true
    }
  }, [src])
  return err ? <div className="pr-none">The final map did not load ({err})</div> : <canvas ref={ref} />
}

// the two sheets of the method, drawn to scale (mm): A5 with three fixed points, A4 with one point placed freely
function SheetA5() {
  return (
    <svg className="pr-sheet" viewBox="-76 -20 300 350">
      <rect width="148" height="210" fill="#fff" stroke="#000" strokeWidth="1" />
      {[
        [80, 40, 'Hauptbahnhof', MARK.hbf],
        [30, 95, 'Berkaer Bf', '#000'],
        [86, 170, 'M18', '#000'],
      ].map(([x, y, n, c]) => (
        <g key={n}>
          <circle cx={x} cy={y} r="4" fill={c} />
          <text x={x + 7} y={y + 3} fontSize="9">
            {n}
          </text>
        </g>
      ))}
      <text x="74" y="226" fontSize="9" textAnchor="middle">
        A5 · 148 × 210 mm
      </text>
    </svg>
  )
}
function SheetA4() {
  return (
    <svg className="pr-sheet" viewBox="-107.8 -28.9 425.7 496.6">
      <rect width="210" height="297" fill="#fff" stroke="#000" strokeWidth="1.42" />
      <circle cx="110" cy="190" r="18" fill="none" stroke="#000" strokeDasharray="3 3" />
      <circle cx="110" cy="190" r="5" fill={MARK.hauptgebaeude} />
      <text x="136" y="194.5" fontSize="12.8">
        Main Building
      </text>
      <text x="105" y="319.7" fontSize="12.8" textAnchor="middle">
        A4 · 210 × 297 mm
      </text>
    </svg>
  )
}

// The opening page: the colour scan and the name of the project; Start begins the presentation
export function Opening({ onStart }) {
  return (
    <div className="opening">
      {/* the page itself, like the slides: white, with the red edges, on the grey table */}
      <div className="op-book">
      <img className="op-scan" src={folderFile(OPENING.scan)} alt="" />
      <div className="op-side">
        <img className="op-title" src={folderFile(OPENING.title)} alt="WEIMARK" />
        <p className="op-sub">Landscape as Product WiSe/26</p>
        <p className="op-names">Basak - Cleo - Eileene - Rezvan</p>
        <button className="op-start" onClick={onStart} autoFocus>
          Start
        </button>
      </div>
      </div>
    </div>
  )
}

// The table of contents: a tab on the left that pops out with an arrow. The slide you are on is bold;
// click any line to jump there.
export function Contents({ open, onToggle, stages, present, people, onGo, onHome }) {
  // each phase: its overview, then one line per person
  const subs = { ...SUBSTEPS, pilot: ['Method: A5, guided', 'All pilot maps', ...people.pilot], single: ['Method: A4, unguided', 'All unguided maps', ...people.single] }
  return (
    <nav className={'toc' + (open ? ' open' : '')}>
      <div className="toc-inner">
        <div className="slide-kicker">Contents</div>
        <ol>
          <li>
            <button onClick={onHome}>Opening</button>
          </li>
          {stages.map((st) => (
            <li key={st.n} className={present.stage === st.n ? 'on' : ''}>
              <button onClick={() => onGo(st.n)}>
                {st.n}. {st.name}
              </button>
              {subs[st.id] && (
                <ol className="toc-sub">
                  {subs[st.id].map((n, i) => (
                    <li key={n} className={present.stage === st.n && present.step === i ? 'on' : ''}>
                      <button onClick={() => onGo(st.n, i)}>{n}</button>
                    </li>
                  ))}
                </ol>
              )}
            </li>
          ))}
        </ol>
      </div>
      <button className="toc-tab" onClick={onToggle} title={open ? 'Fold the contents in' : 'Show the contents'}>
        {open ? '‹' : '›'}
      </button>
    </nav>
  )
}
