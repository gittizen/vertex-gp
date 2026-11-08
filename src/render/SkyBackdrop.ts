import * as THREE from 'three'
import type { TrackDef, WorldKind } from '../track/TrackDefs'

const skyTexCache = new Map<string, THREE.CanvasTexture>()
const cloudTexCache = new Map<string, THREE.CanvasTexture>()

function hexRgb(hex: number): { r: number; g: number; b: number } {
  return { r: (hex >> 16) & 255, g: (hex >> 8) & 255, b: hex & 255 }
}

function mixHex(a: number, b: number, t: number): string {
  const A = hexRgb(a)
  const B = hexRgb(b)
  const r = Math.round(A.r + (B.r - A.r) * t)
  const g = Math.round(A.g + (B.g - A.g) * t)
  const bl = Math.round(A.b + (B.b - A.b) * t)
  return `rgb(${r},${g},${bl})`
}

/** Equirectangular sky — bohatší pásy, méně plochý „flat color“. */
export function createSkyGradientTexture(def: TrackDef): THREE.CanvasTexture {
  const key = `sky-v5-${def.id}-${def.theme.sky.toString(16)}-${def.theme.fog.toString(16)}`
  const cached = skyTexCache.get(key)
  if (cached) return cached

  const w = 768
  const h = 384
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!

  const sky = def.theme.sky
  const fog = def.theme.fog
  const night = def.skyBody === 'moon' || def.world === 'city'
  const rally = def.world === 'rally'

  const zenith = night
    ? mixHex(sky, 0x02040a, 0.55)
    : rally
      ? mixHex(sky, 0x2a1810, 0.18)
      : mixHex(sky, 0xa8c4e8, 0.35)
  const upper = night ? mixHex(sky, fog, 0.18) : mixHex(sky, 0xe8f0ff, 0.12)
  const mid = mixHex(sky, fog, 0.32)
  const horizon = night
    ? mixHex(fog, 0x121820, 0.25)
    : rally
      ? mixHex(fog, 0xffc090, 0.28)
      : mixHex(fog, 0xf0f4f8, 0.35)
  const groundFade = mixHex(fog, def.theme.ground, 0.5)

  const grad = ctx.createLinearGradient(0, 0, 0, h)
  grad.addColorStop(0, zenith)
  grad.addColorStop(0.22, upper)
  grad.addColorStop(0.48, mid)
  grad.addColorStop(0.66, horizon)
  grad.addColorStop(0.8, mixHex(fog, def.theme.ground, 0.4))
  grad.addColorStop(1, groundFade)
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, w, h)

  // Soft Rayleigh-like haze (slabší = méně „plast“)
  const haze = ctx.createLinearGradient(0, h * 0.5, 0, h * 0.82)
  haze.addColorStop(0, 'rgba(255,255,255,0)')
  haze.addColorStop(
    0.5,
    night ? 'rgba(90,110,160,0.1)' : rally ? 'rgba(255,180,120,0.14)' : 'rgba(220,235,255,0.14)',
  )
  haze.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = haze
  ctx.fillRect(0, 0, w, h)

  if (night) {
    ctx.fillStyle = 'rgba(255,255,255,0.9)'
    for (let i = 0; i < 64; i++) {
      const x = (Math.sin(i * 12.9898) * 0.5 + 0.5) * w
      const y = (Math.sin(i * 78.233) * 0.5 + 0.5) * h * 0.42
      const r = 0.5 + (i % 3) * 0.35
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.mapping = THREE.EquirectangularReflectionMapping
  tex.colorSpace = THREE.SRGBColorSpace
  tex.needsUpdate = true
  tex.userData.sharedSky = true
  skyTexCache.set(key, tex)
  return tex
}

function cloudTexture(kind: WorldKind, night: boolean): THREE.CanvasTexture {
  const key = `cloud-v4-${kind}-${night ? 'n' : 'd'}`
  const cached = cloudTexCache.get(key)
  if (cached) return cached

  const size = 160
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, size, size)

  const blobs =
    kind === 'city'
      ? [
          [0.35, 0.55, 0.28],
          [0.55, 0.5, 0.22],
          [0.45, 0.42, 0.2],
          [0.62, 0.58, 0.16],
        ]
      : [
          [0.32, 0.55, 0.3],
          [0.5, 0.48, 0.26],
          [0.62, 0.55, 0.22],
          [0.42, 0.4, 0.18],
          [0.58, 0.62, 0.15],
        ]

  for (const [ux, uy, ur] of blobs) {
    const x = ux * size
    const y = uy * size
    const r = ur * size
    const g = ctx.createRadialGradient(x, y, r * 0.12, x, y, r)
    if (night) {
      g.addColorStop(0, 'rgba(170,185,220,0.5)')
      g.addColorStop(0.55, 'rgba(100,115,160,0.18)')
      g.addColorStop(1, 'rgba(60,70,100,0)')
    } else if (kind === 'rally') {
      g.addColorStop(0, 'rgba(255,210,180,0.42)')
      g.addColorStop(0.5, 'rgba(200,120,80,0.16)')
      g.addColorStop(1, 'rgba(140,60,30,0)')
    } else {
      g.addColorStop(0, 'rgba(255,255,255,0.65)')
      g.addColorStop(0.45, 'rgba(235,240,250,0.24)')
      g.addColorStop(1, 'rgba(210,220,240,0)')
    }
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.needsUpdate = true
  cloudTexCache.set(key, tex)
  return tex
}

function mountainColor(def: TrackDef, layer: 0 | 1): number {
  const g = def.theme.ground
  const f = def.theme.fog
  const A = hexRgb(g)
  const B = hexRgb(f)
  const dark = layer === 0 ? 0.28 : 0.42
  const fogW = layer === 0 ? 0.22 : 0.35
  if (def.world === 'city') return layer === 0 ? 0x0e0c16 : 0x161420
  if (def.world === 'rally') return layer === 0 ? 0x4a3828 : 0x5a4834
  if (def.skyBody === 'moon') return layer === 0 ? 0x1a2430 : 0x2a3440
  const r = Math.round(A.r * dark + B.r * fogW)
  const gr = Math.round(A.g * (dark + 0.04) + B.g * fogW)
  const b = Math.round(A.b * dark + B.b * fogW)
  return (r << 16) | (gr << 8) | b
}

export type SkyBackdropOpts = {
  /** Vzdálenost ke vzdálenějšímu bodu tratě od středu (kvůli etapám). */
  trackReach?: number
}

/**
 * Distant backdrop: hory ZA tratí (ne přes ni) + haze + mraky.
 */
export function createSkyBackdrop(
  def: TrackDef,
  center: THREE.Vector3,
  opts: SkyBackdropOpts = {},
): THREE.Group {
  const root = new THREE.Group()
  root.name = 'skyBackdrop'
  root.position.copy(center)

  const base =
    def.sandbox ? 420 : def.world === 'rally' || def.world === 'climb' ? 820 : 560
  // Etapy (Novostavby…): hory až ZA koncem tratě — jinak „stěna“ na startu/cíli
  const reach = opts.trackReach ?? 0
  const radius = Math.max(base, reach + 320)

  const segs = 96
  const addRidge = (rScale: number, hScale: number, layer: 0 | 1) => {
    const pos: number[] = []
    const idx: number[] = []
    const peaks = def.world === 'city' ? 11 : 15
    const baseH = (def.world === 'city' ? 32 : def.world === 'climb' ? 48 : 38) * hScale
    const peakH = (def.world === 'city' ? 78 : def.world === 'rally' ? 110 : 96) * hScale
    const r0 = radius * rScale
    const r1 = radius * rScale * 1.06
    const rMid = (r0 + r1) * 0.5
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2
      const nx = Math.cos(a)
      const nz = Math.sin(a)
      const n =
        0.5 +
        0.32 * Math.sin(i * 0.65 + peaks + layer) +
        0.22 * Math.sin(i * 1.7 + layer * 2) +
        0.14 * Math.sin(i * 3.3 + 1.5) +
        0.08 * Math.sin(i * 5.1 + layer)
      const h = baseH + (peakH - baseH) * Math.max(0.12, n)
      const midH = h * 0.42
      // 2 pásy quads = hustší silueta hor (míň „prosklených“ mezer)
      pos.push(nx * r0, -6, nz * r0)
      pos.push(nx * rMid, midH, nz * rMid)
      pos.push(nx * r1, h, nz * r1)
    }
    for (let i = 0; i < segs; i++) {
      const a = i * 3
      idx.push(a, a + 1, a + 3, a + 1, a + 4, a + 3)
      idx.push(a + 1, a + 2, a + 4, a + 2, a + 5, a + 4)
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    geo.setIndex(idx)
    geo.computeVertexNormals()
    const mesh = new THREE.Mesh(
      geo,
      new THREE.MeshLambertMaterial({
        color: mountainColor(def, layer),
        fog: true,
        side: THREE.DoubleSide,
      }),
    )
    mesh.name = `distantMountains-${layer}`
    root.add(mesh)
  }

  addRidge(1, 1, 0)
  addRidge(0.92, 0.72, 1)

  const haze = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.96, radius * 1.04, 22, 40, 1, true),
    new THREE.MeshLambertMaterial({
      color: def.theme.fog,
      transparent: true,
      opacity: def.world === 'city' ? 0.1 : 0.12,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: true,
    }),
  )
  haze.position.y = 10
  haze.name = 'horizonHaze'
  root.add(haze)

  const night = def.skyBody === 'moon' || def.world === 'city'
  const tex = cloudTexture(def.world, night)
  const cloudCount = def.world === 'city' ? 8 : 11
  const cloudY = night ? 100 : 120
  for (let i = 0; i < cloudCount; i++) {
    const a = (i / cloudCount) * Math.PI * 2 + i * 0.37
    const elev = cloudY + (i % 3) * 20
    const dist = radius * (0.55 + (i % 4) * 0.05)
    const w = 80 + (i % 4) * 30
    const h = 30 + (i % 3) * 12
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      opacity: night ? 0.22 : 0.32,
      depthWrite: false,
      fog: true,
      side: THREE.DoubleSide,
    })
    const cloud = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat)
    cloud.position.set(Math.cos(a) * dist, elev, Math.sin(a) * dist)
    cloud.lookAt(center.x, elev * 0.85, center.z)
    cloud.userData.cloudSpin = 0.01 + (i % 5) * 0.0035
    cloud.userData.cloudAngle = a
    cloud.userData.cloudDist = dist
    cloud.userData.cloudElev = elev
    cloud.name = `cloud-${i}`
    root.add(cloud)
  }

  return root
}

export function tickSkyBackdrop(root: THREE.Object3D | null | undefined, dt: number): void {
  if (!root) return
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh) || !obj.name.startsWith('cloud-')) return
    const spin = (obj.userData.cloudSpin as number) ?? 0.02
    let a = (obj.userData.cloudAngle as number) + spin * dt
    if (a > Math.PI * 2) a -= Math.PI * 2
    obj.userData.cloudAngle = a
    const dist = obj.userData.cloudDist as number
    const elev = obj.userData.cloudElev as number
    obj.position.set(Math.cos(a) * dist, elev, Math.sin(a) * dist)
    obj.lookAt(root.position.x, elev * 0.85, root.position.z)
  })
}
