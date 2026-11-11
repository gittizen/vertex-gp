/**
 * public/menu/*.jpg → *.webp (max 1600px, q≈78). JPG nechá — fallback / git history.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dir = path.join(root, 'public', 'menu')
const MAX_W = 1600
const QUALITY = 78

const files = fs.readdirSync(dir).filter((f) => /\.jpe?g$/i.test(f))
let saved = 0
let bytesIn = 0
let bytesOut = 0

for (const file of files) {
  const src = path.join(dir, file)
  const dest = path.join(dir, file.replace(/\.jpe?g$/i, '.webp'))
  const inStat = fs.statSync(src)
  bytesIn += inStat.size
  const img = sharp(src, { failOn: 'none' }).rotate()
  const meta = await img.metadata()
  let pipeline = sharp(src, { failOn: 'none' }).rotate()
  if ((meta.width ?? 0) > MAX_W) {
    pipeline = pipeline.resize({ width: MAX_W, withoutEnlargement: true })
  }
  await pipeline.webp({ quality: QUALITY, effort: 4 }).toFile(dest)
  const outStat = fs.statSync(dest)
  bytesOut += outStat.size
  saved++
  const ratio = ((1 - outStat.size / inStat.size) * 100).toFixed(0)
  console.log(`${file} → ${path.basename(dest)}  ${Math.round(inStat.size / 1024)}KB → ${Math.round(outStat.size / 1024)}KB (−${ratio}%)`)
}

console.log(
  `\nDone: ${saved} files, ${Math.round(bytesIn / 1024 / 1024)}MB → ${Math.round(bytesOut / 1024 / 1024)}MB`,
)
