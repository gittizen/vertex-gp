import * as THREE from 'three'
import type { WorldKind } from '../track/TrackDefs'

const textureCache = new Map<string, THREE.CanvasTexture>()

/** Procedurální šum — tráva, omítka, terén. */
export function noiseTexture(
  key: string,
  base: string,
  opts: {
    size?: number
    speck?: number
    speckAlpha?: number
    tint?: string
  } = {},
): THREE.CanvasTexture {
  const cached = textureCache.get(key)
  if (cached) return cached

  const size = opts.size ?? 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = base
  ctx.fillRect(0, 0, size, size)

  const speck = opts.speck ?? 3200
  const a = opts.speckAlpha ?? 0.1
  for (let i = 0; i < speck; i++) {
    const x = Math.random() * size
    const y = Math.random() * size
    const g = Math.floor(Math.random() * 255)
    ctx.fillStyle = `rgba(${g},${g},${g},${a})`
    ctx.fillRect(x, y, 1 + Math.random() * 2, 1 + Math.random() * 2)
  }

  if (opts.tint) {
    ctx.fillStyle = opts.tint
    ctx.fillRect(0, 0, size, size)
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  tex.needsUpdate = true
  textureCache.set(key, tex)
  return tex
}

export function shadeRoad(hex: number, mul: number): number {
  const r = Math.min(255, Math.max(0, Math.round(((hex >> 16) & 255) * mul)))
  const g = Math.min(255, Math.max(0, Math.round(((hex >> 8) & 255) * mul)))
  const b = Math.min(255, Math.max(0, Math.round((hex & 255) * mul)))
  return (r << 16) | (g << 8) | b
}

/**
 * Asfalt musí zůstat čitelný ve dne i v noci (ACES + fog rády sežerou tmavé Standard).
 */
export function normalizeAsphaltColor(hex: number): number {
  const r = (hex >> 16) & 255
  const g = (hex >> 8) & 255
  const b = hex & 255
  const avg = (r + g + b) / 3
  // Jen spodní clamp — světlý městský asfalt musí zůstat světlý (dřív >120 → charcoal)
  if (avg < 70) return 0x5c6068
  return hex
}

/**
 * Noční město: unlit světlý asfalt.
 * Standard + ACES + slabý moon light = šedá kaše; Basic drží čitelnost silnice vs terén vs auto.
 */
export function matCityRoad(color: number = 0x6a707c): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    map: asphaltDetailMap(),
    fog: true,
    side: THREE.DoubleSide,
  })
}

/**
 * Detailní asfaltová mapa (světlý grain) — barvu řídí `color` materiálu.
 * Koleje, agregát, fleky opotřebení.
 */
function asphaltDetailMap(): THREE.CanvasTexture {
  const key = 'asphalt-detail-v5'
  const cached = textureCache.get(key)
  if (cached) return cached

  const size = 512
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!

  ctx.fillStyle = '#d8d9de'
  ctx.fillRect(0, 0, size, size)

  // Agregát
  for (let i = 0; i < 14000; i++) {
    const x = Math.random() * size
    const y = Math.random() * size
    const g = 140 + Math.floor(Math.random() * 90)
    const a = 0.04 + Math.random() * 0.1
    ctx.fillStyle = `rgba(${g},${g},${g + 4},${a})`
    ctx.fillRect(x, y, 1 + (Math.random() > 0.7 ? 1 : 0), 1)
  }

  // Olejové / opotřebené fleky
  for (let i = 0; i < 48; i++) {
    const x = Math.random() * size
    const y = Math.random() * size
    const rw = 18 + Math.random() * 50
    const rh = 10 + Math.random() * 28
    ctx.fillStyle = `rgba(90,92,98,${0.06 + Math.random() * 0.1})`
    ctx.beginPath()
    ctx.ellipse(x, y, rw, rh, Math.random() * Math.PI, 0, Math.PI * 2)
    ctx.fill()
  }

  // Podélné stopy pneumatik (slabé)
  for (const lane of [size * 0.28, size * 0.5, size * 0.72]) {
    ctx.strokeStyle = 'rgba(70,72,78,0.12)'
    ctx.lineWidth = 3 + Math.random() * 2
    ctx.beginPath()
    ctx.moveTo(lane + (Math.random() - 0.5) * 8, 0)
    for (let y = 0; y < size; y += 24) {
      ctx.lineTo(lane + Math.sin(y * 0.04) * 3, y)
    }
    ctx.stroke()
  }

  // Jemné příčné spáry
  ctx.strokeStyle = 'rgba(60,62,68,0.07)'
  ctx.lineWidth = 1
  for (let y = 40; y < size; y += 64) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(size, y + (Math.random() - 0.5) * 4)
    ctx.stroke()
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  tex.repeat.set(14, 14)
  tex.needsUpdate = true
  textureCache.set(key, tex)
  return tex
}

/**
 * Asfalt — matný, ne kov (kov + noc = černá plocha). DoubleSide = jistota při winding.
 */
export function matAsphalt(color: number = 0x6a6e76): THREE.MeshStandardMaterial {
  const c = normalizeAsphaltColor(color)
  return new THREE.MeshStandardMaterial({
    color: c,
    map: asphaltDetailMap(),
    roughness: 0.96,
    metalness: 0,
    envMapIntensity: 0.12,
    emissive: new THREE.Color(c),
    emissiveIntensity: 0.06,
    fog: true,
    side: THREE.DoubleSide,
    flatShading: false,
  })
}

/** Shoulder — o něco tmavší okraj. */
export function matAsphaltShoulder(roadColor: number): THREE.MeshStandardMaterial {
  return matAsphalt(shadeRoad(normalizeAsphaltColor(roadColor), 0.82))
}

/**
 * Povrch „reálného světa“ — Standard místo flat Lambert
 * (stejné API, aby okolí/auta dostala diffuse+specular bez přepisu všech call-site).
 */
export function matLambert(
  color: number,
  opts: { map?: THREE.Texture; emissive?: number; emissiveIntensity?: number; flat?: boolean } = {},
): THREE.MeshStandardMaterial {
  const bright = opts.emissiveIntensity !== undefined && opts.emissiveIntensity > 0.2
  return new THREE.MeshStandardMaterial({
    color,
    map: opts.map,
    emissive: opts.emissive !== undefined ? new THREE.Color(opts.emissive) : undefined,
    emissiveIntensity: opts.emissiveIntensity ?? 0,
    roughness: bright ? 0.45 : 0.9,
    metalness: bright ? 0.08 : 0.03,
    envMapIntensity: bright ? 0.55 : 0.35,
    flatShading: opts.flat ?? false,
  })
}

/** Vodorovné pruhy na asfaltu — lit (ne unlit decal). */
export function matRoadMark(color: number): THREE.MeshStandardMaterial {
  const warm = ((color >> 16) & 255) > 200 && ((color >> 8) & 255) > 160
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.72,
    metalness: 0.04,
    emissive: new THREE.Color(color),
    emissiveIntensity: warm ? 0.32 : 0.12,
    envMapIntensity: 0.45,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
    depthWrite: false,
  })
}

/** Lak — Standard, tlumený emissive. */
export function matPaint(
  color: number,
  opts: { emissive?: number; emissiveIntensity?: number } = {},
): THREE.MeshStandardMaterial {
  const em = opts.emissive ?? color
  return new THREE.MeshStandardMaterial({
    color,
    emissive: new THREE.Color(em),
    emissiveIntensity: opts.emissiveIntensity ?? 0.028,
    metalness: 0.58,
    roughness: 0.28,
    envMapIntensity: 1,
  })
}

export function matAccent(color: number, intensity = 0.22): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    emissive: new THREE.Color(color),
    emissiveIntensity: intensity,
    metalness: 0.15,
    roughness: 0.5,
  })
}

export function matGlass(color = 0x1a2836): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    metalness: 0.9,
    roughness: 0.12,
    transparent: true,
    opacity: 0.88,
    envMapIntensity: 1.2,
  })
}

export function matPhong(
  color: number,
  opts: {
    map?: THREE.Texture
    shininess?: number
    specular?: number
    emissive?: number
    emissiveIntensity?: number
  } = {},
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    map: opts.map,
    metalness: 0.25,
    roughness: Math.max(0.2, 1 - (opts.shininess ?? 28) / 120),
    emissive: opts.emissive !== undefined ? new THREE.Color(opts.emissive) : undefined,
    emissiveIntensity: opts.emissiveIntensity ?? 0,
  })
}

export function roadMap(world: WorldKind): THREE.CanvasTexture {
  void world
  return asphaltDetailMap()
}

/** Bohatší země — volitelně tráva (ne na městě / návsi). */
function richGroundTexture(
  key: string,
  base: string,
  accent: string,
  dirt: string,
  withGrass = true,
): THREE.CanvasTexture {
  const cached = textureCache.get(key)
  if (cached) return cached

  const size = 512
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = base
  ctx.fillRect(0, 0, size, size)

  for (let i = 0; i < 220; i++) {
    const x = Math.random() * size
    const y = Math.random() * size
    const rw = 12 + Math.random() * 40
    const rh = 10 + Math.random() * 32
    ctx.fillStyle = Math.random() > 0.45 ? accent : dirt
    ctx.globalAlpha = 0.12 + Math.random() * 0.18
    ctx.beginPath()
    ctx.ellipse(x, y, rw, rh, Math.random() * Math.PI, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1

  for (let i = 0; i < 9000; i++) {
    const x = Math.random() * size
    const y = Math.random() * size
    const g = 40 + Math.floor(Math.random() * 90)
    ctx.fillStyle = `rgba(${g},${g + 12},${g - 4},${0.05 + Math.random() * 0.1})`
    ctx.fillRect(x, y, 1 + (Math.random() > 0.75 ? 1 : 0), 1 + (Math.random() > 0.8 ? 1 : 0))
  }

  if (withGrass) {
    for (let i = 0; i < 180; i++) {
      const x = Math.random() * size
      const y = Math.random() * size
      ctx.strokeStyle = `rgba(30,70,28,${0.08 + Math.random() * 0.12})`
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x + (Math.random() - 0.5) * 6, y - 4 - Math.random() * 8)
      ctx.stroke()
    }
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  tex.needsUpdate = true
  textureCache.set(key, tex)
  return tex
}

/** Země podle světa — každá mapa jiný podklad (ne stejná „vodní deska“). */
export function groundMap(world: WorldKind, trackId?: string): THREE.CanvasTexture {
  if (world === 'city' || trackId === 'city') {
    // Tmavý terén s teplými/studenými fleky — oddělený od světlé silnice
    const t = richGroundTexture('ground-city-v9', '#04050a', '#12161e', '#1c140e', false)
    t.repeat.set(20, 20)
    return t
  }
  if (world === 'rally' || trackId === 'turini') {
    const t = richGroundTexture('ground-rally-v7', '#6a5a40', '#8a7850', '#4a3a28', false)
    t.repeat.set(40, 40)
    return t
  }
  if (world === 'plaza' || trackId === 'placek') {
    const t = richGroundTexture('ground-plaza-v6', '#5a5e66', '#707680', '#3a3e46', false)
    t.repeat.set(22, 22)
    return t
  }
  if (world === 'climb') {
    if (trackId === 'mexiku') {
      const t = richGroundTexture('ground-mex-v6', '#5a6a3a', '#8a9a4a', '#3a4020', true)
      t.repeat.set(36, 36)
      return t
    }
    if (trackId === 'zlaty') {
      const t = richGroundTexture('ground-zlaty-v6', '#6a5a38', '#8a7848', '#3a3020', false)
      t.repeat.set(34, 34)
      return t
    }
    if (trackId === 'serpentiny') {
      const t = richGroundTexture('ground-serp-v6', '#3a4a38', '#2a3830', '#4a5a48', true)
      t.repeat.set(38, 38)
      return t
    }
    const t = richGroundTexture('ground-climb-v6', '#3a4834', '#4a5a3c', '#2a3020', true)
    t.repeat.set(40, 40)
    return t
  }
  // town
  if (trackId === 'hruby') {
    // Bez „modrozeleného“ jezera na kruháči — suchá louka
    const t = richGroundTexture('ground-hruby-v7', '#4a5a34', '#6a6a40', '#3a4028', false)
    t.repeat.set(44, 44)
    return t
  }
  if (trackId === 'kasarny') {
    const t = richGroundTexture('ground-kas-v6', '#4a4e48', '#5a6058', '#2a2e2a', false)
    t.repeat.set(30, 30)
    return t
  }
  // Námko — teplá prašná náves (ne šedomodrá „voda“)
  const t = richGroundTexture('ground-namko-v7', '#5a4e38', '#7a6a48', '#3a3224', false)
  t.repeat.set(32, 32)
  return t
}

/**
 * Matný terén — Basic + fog vypnutý, bez mapy.
 * FogExp2 i canvas-mapa na velkých flat meshích na Námku → navy void (pixelově ověřeno).
 */
export function matGround(
  color: number,
  opts: { map?: THREE.Texture } = {},
): THREE.MeshBasicMaterial {
  void opts
  return new THREE.MeshBasicMaterial({
    color,
    fog: false,
  })
}

export function plasterMap(seed: string, hex: string): THREE.CanvasTexture {
  return noiseTexture(`plaster-${seed}-v5`, hex, { size: 256, speck: 2200, speckAlpha: 0.09 })
}
