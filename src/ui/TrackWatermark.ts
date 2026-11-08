import { TRACKS, type TrackDef } from '../track/TrackDefs'

/** Náhodná trať jako watermark — vyloučí zadaná id (typicky 2 předchozí). */
export function pickWatermarkTrack(excludeIds: string[] = []): TrackDef {
  const exclude = new Set(excludeIds)
  let pool = TRACKS.filter((t) => !exclude.has(t.id))
  if (pool.length === 0) pool = [...TRACKS]
  return pool[Math.floor(Math.random() * pool.length)]!
}

/**
 * Watermark na celou obrazovku.
 * Trať i nápis rotují spolu; SVG ukáže celou trať (meet).
 */
export function trackWatermarkHtml(def: TrackDef = pickWatermarkTrack()): string {
  const geom = pathFromTrack(def)
  return `
    <div class="track-watermark" data-track-id="${escapeXml(def.id)}" aria-hidden="true">
      <div class="track-watermark-stage">
        <svg class="track-watermark-svg" viewBox="${geom.viewBox}" preserveAspectRatio="xMidYMid meet">
          <path class="track-watermark-path" d="${geom.d}" />
        </svg>
        <p class="track-watermark-label">${escapeXml(def.name)}</p>
      </div>
    </div>
  `
}

export function applyWatermarkTo(el: Element, def: TrackDef): void {
  const geom = pathFromTrack(def)
  el.setAttribute('data-track-id', def.id)
  const svg = el.querySelector('.track-watermark-svg')
  const path = el.querySelector('.track-watermark-path')
  const label = el.querySelector('.track-watermark-label')
  if (svg) svg.setAttribute('viewBox', geom.viewBox)
  if (path) path.setAttribute('d', geom.d)
  if (label) label.textContent = def.name
}

function hexCss(n: number): string {
  return `#${(n >>> 0).toString(16).padStart(6, '0')}`
}

/** CSS vars prostředí tratě (nebe / země / fog / accent) pro náhled. */
function trackEnvStyle(def: TrackDef): string {
  const th = def.theme
  return [
    `--env-sky:${hexCss(th.sky)}`,
    `--env-ground:${hexCss(th.ground)}`,
    `--env-fog:${hexCss(th.fog)}`,
    `--env-road:${hexCss(th.road)}`,
    `--env-accent:${hexCss(th.accent)}`,
    `--env-building:${hexCss(th.building)}`,
  ].join(';')
}

/** Mapa tratě — jedna výrazná šipka ze startu, stejné kuličky start/cíl. */
export function trackPreviewHtml(def: TrackDef, reverse = false): string {
  const geom = pathFromTrack(def)
  // Jednotná vizuální velikost značek vůči viewBoxu (ne „reálná“ velikost tratě)
  const markerR = geom.markerR
  const badgeDy = markerR * 1.7
  const env = trackEnvStyle(def)
  const wrap = (inner: string, legend: string) => `
    <div class="track-preview-stage" data-world="${escapeXml(def.world)}" style="${env}">
      <div class="track-preview-env" aria-hidden="true">
        <span class="track-preview-env-sky"></span>
        <span class="track-preview-env-haze"></span>
        <span class="track-preview-env-ground"></span>
        <span class="track-preview-env-silhouettes"></span>
      </div>
      ${inner}
    </div>
    ${legend}
  `
  if (def.sandbox) {
    const cx = (geom.start.x + (geom.pts[2]?.x ?? geom.start.x)) / 2
    const cz = (geom.start.z + (geom.pts[2]?.z ?? geom.start.z)) / 2
    return wrap(
      `<svg class="track-preview-svg" viewBox="${geom.viewBox}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <path class="track-preview-path" d="${geom.d}" fill="rgba(160,170,180,0.25)" />
      <circle class="track-preview-mark track-preview-start" cx="${cx.toFixed(1)}" cy="${cz.toFixed(1)}" r="${markerR}" />
      <text class="track-preview-badge" x="${cx.toFixed(1)}" y="${(cz - badgeDy).toFixed(1)}" text-anchor="middle" font-size="${(markerR * 1.55).toFixed(1)}">FS</text>
    </svg>`,
      `<div class="track-map-legend">
      <span class="legend-item legend-classic">● plocha</span>
      <span class="legend-item legend-classic">freestyle</span>
    </div>`,
    )
  }
  const start = reverse ? geom.finish : geom.start
  const finish = reverse ? geom.start : geom.finish
  const dir = reverse ? geom.startDirRev : geom.startDir
  const arrow = startArrow(start, dir, markerR)
  return wrap(
    `<svg class="track-preview-svg" viewBox="${geom.viewBox}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <path class="track-preview-path" d="${geom.d}" />
      ${arrow}
      <circle class="track-preview-mark track-preview-start" cx="${start.x.toFixed(1)}" cy="${start.z.toFixed(1)}" r="${markerR}" />
      <circle class="track-preview-mark track-preview-finish" cx="${finish.x.toFixed(1)}" cy="${finish.z.toFixed(1)}" r="${markerR}" />
      <text class="track-preview-badge" x="${finish.x.toFixed(1)}" y="${(finish.z - badgeDy).toFixed(1)}" text-anchor="middle" font-size="${(markerR * 1.55).toFixed(1)}">CÍL</text>
    </svg>`,
    `<div class="track-map-legend">
      <span class="legend-item legend-classic">● start</span>
      <span class="legend-item legend-finish">● cíl</span>
      <span class="legend-item ${reverse ? 'legend-reverse' : 'legend-classic'}">→ ${reverse ? 'opačný' : 'klasický'} směr</span>
    </div>`,
  )
}

type Pt = { x: number; z: number }

type TrackGeom = {
  d: string
  viewBox: string
  pts: Pt[]
  start: Pt
  finish: Pt
  startDir: number
  startDirRev: number
  /** Jednotný poloměr značek start/cíl vůči viewBoxu */
  markerR: number
}

function pathFromTrack(def: TrackDef): TrackGeom {
  const raw = def.points
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  for (const [x, z] of raw) {
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minZ = Math.min(minZ, z)
    maxZ = Math.max(maxZ, z)
  }
  const pad = 42
  const w = Math.max(80, maxX - minX + pad * 2)
  const h = Math.max(80, maxZ - minZ + pad * 2)
  const sx = (x: number) => x - minX + pad
  const sz = (z: number) => z - minZ + pad

  const pts: Pt[] = raw.map(([x, z]) => ({ x: sx(x), z: sz(z) }))
  let d = `M ${pts[0]!.x.toFixed(1)} ${pts[0]!.z.toFixed(1)}`
  for (let i = 1; i < pts.length; i++) {
    d += ` L ${pts[i]!.x.toFixed(1)} ${pts[i]!.z.toFixed(1)}`
  }
  if (def.loop) d += ' Z'

  const start = pts[0]!
  const finish = def.loop ? pts[0]! : pts[pts.length - 1]!
  const n1 = pts[1] ?? start
  const nLast = pts[pts.length - 2] ?? start
  const startDir = Math.atan2(n1.z - start.z, n1.x - start.x)
  const startDirRev = Math.atan2(nLast.z - finish.z, nLast.x - finish.x)
  // Vůči delší straně viewBoxu — u protáhlých tratí (Novostavby) stejně velké na obrazovce
  const markerR = Math.max(w, h) * 0.032

  return {
    d,
    viewBox: `0 0 ${w.toFixed(0)} ${h.toFixed(0)}`,
    pts,
    start,
    finish,
    startDir,
    startDirRev,
    markerR,
  }
}

function startArrow(start: Pt, ang: number, markerR: number): string {
  const len = markerR * 3.1
  const tipX = start.x + Math.cos(ang) * len
  const tipZ = start.z + Math.sin(ang) * len
  const baseX = start.x + Math.cos(ang) * (markerR * 1.25)
  const baseZ = start.z + Math.sin(ang) * (markerR * 1.25)
  const wing = markerR * 1.45
  const p1 = `${tipX.toFixed(1)},${tipZ.toFixed(1)}`
  const p2 = `${(baseX + Math.cos(ang + 2.4) * wing).toFixed(1)},${(baseZ + Math.sin(ang + 2.4) * wing).toFixed(1)}`
  const p3 = `${(baseX + Math.cos(ang - 2.4) * wing).toFixed(1)},${(baseZ + Math.sin(ang - 2.4) * wing).toFixed(1)}`
  return `<polygon class="track-preview-arrow-main track-preview-mark" points="${p1} ${p2} ${p3}" />`
}

function escapeXml(s: string): string {
  return s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}
