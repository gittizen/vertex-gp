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

/** Levný equirectangular gradient — UE-stylové nebe bez sky dome mesh. */
export function createSkyGradientTexture(def: TrackDef): THREE.CanvasTexture {
  const key = `sky-${def.id}-${def.theme.sky.toString(16)}-${def.theme.fog.toString(16)}`
  const cached = skyTexCache.get(key)
  if (cached) return cached

  const w = 512
  const h = 256
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!

  const sky = def.theme.sky
  const fog = def.theme.fog
  const night = def.skyBody === 'moon' || def.world === 'city'
  const zenith = night ? mixHex(sky, 0x020208, 0.35) : mixHex(sky, 0xffffff, 0.12)
  const mid = mixHex(sky, fog, 0.35)
  const horizon = mixHex(fog, sky, 0.25)

  const grad = ctx.createLinearGradient(0, 0, 0, h)
  grad.addColorStop(0, zenith)
  grad.addColorStop(0.42, mid)
  grad.addColorStop(0.62, horizon)
  grad.addColorStop(0.72, mixHex(fog, def.theme.ground, 0.15))
  grad.addColorStop(1, mixHex(def.theme.ground, fog, 0.4))
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, w, h)

  // Jemný „atmosférický“ pás u horizontu
  const haze = ctx.createLinearGradient(0, h * 0.5, 0, h * 0.78)
  haze.addColorStop(0, 'rgba(255,255,255,0)')
  haze.addColorStop(0.5, night ? 'rgba(120,140,200,0.12)' : 'rgba(255,255,255,0.18)')
  haze.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = haze
  ctx.fillRect(0, 0, w, h)

  if (night) {
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    for (let i = 0; i < 48; i++) {
      const x = (Math.sin(i * 12.9898) * 0.5 + 0.5) * w
      const y = (Math.sin(i * 78.233) * 0.5 + 0.5) * h * 0.45
      const r = 0.6 + (i % 3) * 0.4
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
  const key = `cloud-${kind}-${night ? 'n' : 'd'}`
  const cached = cloudTexCache.get(key)
  if (cached) return cached

  const size = 128
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
    const g = ctx.createRadialGradient(x, y, r * 0.15, x, y, r)
    if (night) {
      g.addColorStop(0, 'rgba(180,190,220,0.55)')
      g.addColorStop(0.55, 'rgba(120,130,170,0.22)')
      g.addColorStop(1, 'rgba(80,90,120,0)')
    } else if (kind === 'rally') {
      g.addColorStop(0, 'rgba(255,200,160,0.5)')
      g.addColorStop(0.5, 'rgba(220,140,90,0.2)')
      g.addColorStop(1, 'rgba(180,80,40,0)')
    } else {
      g.addColorStop(0, 'rgba(255,255,255,0.72)')
      g.addColorStop(0.45, 'rgba(240,245,255,0.28)')
      g.addColorStop(1, 'rgba(220,230,255,0)')
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

function mountainColor(def: TrackDef): number {
  const g = def.theme.ground
  const f = def.theme.fog
  if (def.world === 'city') return 0x12101c
  if (def.world === 'rally') return 0x2a1810
  if (def.skyBody === 'moon') return 0x2a3440
  // Tmavší směs země + fog = silueta
  const A = hexRgb(g)
  const B = hexRgb(f)
  const r = Math.round(A.r * 0.35 + B.r * 0.15)
  const gr = Math.round(A.g * 0.38 + B.g * 0.12)
  const b = Math.round(A.b * 0.32 + B.b * 0.18)
  return (r << 16) | (gr << 8) | b
}

/**
 * Distant backdrop (UE-like): silueta hor + pár cloud billboardů.
 * MeshBasic + málo tris — téměř zdarma oproti lokálním dekoracím.
 */
export function createSkyBackdrop(def: TrackDef, center: THREE.Vector3): THREE.Group {
  const root = new THREE.Group()
  root.name = 'skyBackdrop'
  root.position.copy(center)

  const radius = def.sandbox ? 420 : def.world === 'rally' || def.world === 'climb' ? 780 : 520
  const segs = 48
  const peaks = def.world === 'city' ? 10 : def.world === 'rally' ? 14 : 12
  const baseH = def.world === 'city' ? 28 : def.world === 'climb' ? 55 : 42
  const peakH = def.world === 'city' ? 70 : def.world === 'rally' ? 95 : 88

  // Jedna páska siluet — spodní prsten + horský hřeben
  const pos: number[] = []
  const idx: number[] = []
  for (let i = 0; i <= segs; i++) {
    const a = (i / segs) * Math.PI * 2
    const nx = Math.cos(a)
    const nz = Math.sin(a)
    // Pseudo-náhodný hřeben (deterministický)
    const n =
      0.55 +
      0.35 * Math.sin(i * 0.7 + peaks) +
      0.2 * Math.sin(i * 1.9) +
      0.12 * Math.sin(i * 3.1 + 2)
    const h = baseH + (peakH - baseH) * Math.max(0.15, n)
    const r0 = radius
    const r1 = radius * 1.08
    pos.push(nx * r0, 0, nz * r0)
    pos.push(nx * r1, h, nz * r1)
  }
  for (let i = 0; i < segs; i++) {
    const a = i * 2
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
  }
  const mountainGeo = new THREE.BufferGeometry()
  mountainGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  mountainGeo.setIndex(idx)
  mountainGeo.computeVertexNormals()
  const mountains = new THREE.Mesh(
    mountainGeo,
    new THREE.MeshBasicMaterial({
      color: mountainColor(def),
      fog: true,
      depthWrite: true,
      side: THREE.DoubleSide,
    }),
  )
  mountains.name = 'distantMountains'
  root.add(mountains)

  // Měkký haze pás u paty hor
  const haze = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.98, radius * 1.02, 18, 32, 1, true),
    new THREE.MeshBasicMaterial({
      color: def.theme.fog,
      transparent: true,
      opacity: def.world === 'city' ? 0.22 : 0.28,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: true,
    }),
  )
  haze.position.y = 8
  haze.name = 'horizonHaze'
  root.add(haze)

  // Mraky — pár billboardů (max ~10 draw calls, Basic + alpha)
  const night = def.skyBody === 'moon' || def.world === 'city'
  const tex = cloudTexture(def.world, night)
  const cloudCount = def.world === 'city' ? 7 : 10
  const cloudY = night ? 95 : 110
  for (let i = 0; i < cloudCount; i++) {
    const a = (i / cloudCount) * Math.PI * 2 + i * 0.37
    const elev = cloudY + (i % 3) * 18
    const dist = radius * (0.62 + (i % 4) * 0.06)
    const w = 70 + (i % 4) * 28
    const h = 28 + (i % 3) * 10
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      opacity: night ? 0.45 : 0.7,
      depthWrite: false,
      fog: true,
      side: THREE.DoubleSide,
    })
    const cloud = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat)
    cloud.position.set(Math.cos(a) * dist, elev, Math.sin(a) * dist)
    cloud.lookAt(center.x, elev * 0.85, center.z)
    cloud.userData.cloudSpin = 0.012 + (i % 5) * 0.004
    cloud.userData.cloudAngle = a
    cloud.userData.cloudDist = dist
    cloud.userData.cloudElev = elev
    cloud.name = `cloud-${i}`
    root.add(cloud)
  }

  return root
}

/** Pomalý drift mraků — volej z game ticku. */
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
