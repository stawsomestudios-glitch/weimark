// The drawings people made from memory, one album per route area.
// Pictures you import are kept in this browser (IndexedDB), not on the website:
// to show them to others from the published site, they have to be added to public/drawings/ (ask your agent).
const DB = 'weimar-memory-drawings'
const STORE = 'drawings'

function db() {
  return new Promise((ok, fail) => {
    const r = indexedDB.open(DB, 1)
    r.onupgradeneeded = () => {
      const s = r.result.createObjectStore(STORE, { keyPath: 'id' })
      s.createIndex('zone', 'zone')
    }
    r.onsuccess = () => ok(r.result)
    r.onerror = () => fail(r.error)
  })
}
const run = async (mode, fn) => {
  const d = await db()
  return new Promise((ok, fail) => {
    const t = d.transaction(STORE, mode)
    const out = fn(t.objectStore(STORE))
    t.oncomplete = () => ok(out?.result ?? out)
    t.onerror = () => fail(t.error)
  })
}

export async function listDrawings(zone) {
  const all = await run('readonly', (s) => s.index('zone').getAll(zone))
  return (all ?? []).sort((a, b) => a.order - b.order)
}
export async function addDrawings(zone, files, start = 0) {
  let i = start
  for (const f of files) {
    if (!f.type.startsWith('image/')) continue
    const rec = { id: zone + ':' + Date.now() + ':' + Math.random().toString(36).slice(2, 7), zone, blob: f, caption: f.name.replace(/\.[^.]+$/, ''), order: i++ }
    await run('readwrite', (s) => s.put(rec))
  }
}
export const saveDrawing = (rec) => run('readwrite', (s) => s.put(rec))
export const deleteDrawing = (id) => run('readwrite', (s) => s.delete(id))
// how many drawings each area has (for the buttons on the map)
export async function countDrawings() {
  const all = (await run('readonly', (s) => s.getAll())) ?? []
  const n = {}
  for (const r of all) n[r.zone] = (n[r.zone] ?? 0) + 1
  return n
}
// every picture, from every album (for the plan with pictures)
export async function listAll() {
  const all = (await run('readonly', (s) => s.getAll())) ?? []
  return all.sort((a, b) => (a.added ?? 0) - (b.added ?? 0) || a.order - b.order)
}
// adds pictures and hands back their records (to put one on the plan where it was dropped)
export async function addPictures(zone, files) {
  const out = []
  for (const f of files) {
    if (!f.type.startsWith('image/')) continue
    const rec = { id: zone + ':' + Date.now() + ':' + Math.random().toString(36).slice(2, 7), zone, blob: f, caption: f.name.replace(/\.[^.]+$/, ''), order: 0, added: Date.now() }
    await run('readwrite', (s) => s.put(rec))
    out.push(rec)
  }
  return out
}
// forget every picture kept in this browser
export const clearAll = () => run('readwrite', (s) => s.clear())
