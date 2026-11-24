// Copies the pictures and the video from the folder on the Desktop into public/pictures/, so the published
// website has them (it cannot read your computer). Writes public/pictures/index.json, the list the site reads.
// Run again after you add or change pictures:  node scripts/copy-pictures.mjs
// Pictures bigger than 3 MB are worth shrinking before publishing (ask your agent).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SRC = process.argv[2] || 'C:/Users/Staws/Desktop/LANSCAPE/final'
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'pictures')
const IMG = /\.(jpe?g|png|webp|gif)$/i
const VID = /\.(mov|mp4|m4v|webm)$/i
fs.mkdirSync(OUT, { recursive: true })
const list = []
for (const name of fs.readdirSync(SRC).sort()) {
  const from = path.join(SRC, name)
  if (!fs.statSync(from).isFile() || !(IMG.test(name) || VID.test(name))) continue
  // a .MOV video is saved as .mp4: same kind of file inside, but browsers only play it under that name
  const to = path.join(OUT, VID.test(name) ? name.replace(/\.(mov|m4v)$/i, '.mp4') : name)
  const st = fs.statSync(from)
  // copy only what is new or changed (a shrunk copy made by hand is kept until the original changes)
  if (!fs.existsSync(to) || fs.statSync(to).mtimeMs < st.mtimeMs) fs.copyFileSync(from, to)
  if (IMG.test(name)) list.push({ name, v: Math.round(st.mtimeMs) })
  console.log(name, (fs.statSync(to).size / 1e6).toFixed(1), 'MB')
}
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(list))
console.log(list.length, 'pictures listed →', OUT)
