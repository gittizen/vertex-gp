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
 * Tourmaline / v0.3 recept: MeshBasic + fog:false + solidní barva.
 * Bez mapy a bez Lambertu — šedá zůstane šedá ve stínu i v mlze.
 */
export function matAsphalt(color: number = 0x9a9aa4): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    fog: false,
    side: THREE.DoubleSide,
  })
}

/** Shoulder — o něco tmavší stejný odstín (pořád Basic, bez fleků). */
export function matAsphaltShoulder(roadColor: number): THREE.MeshBasicMaterial {
  return matAsphalt(shadeRoad(roadColor, 0.82))
}

export function matLambert(
  color: number,
  opts: { map?: THREE.Texture; emissive?: number; emissiveIntensity?: number; flat?: boolean } = {},
): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({
    color,
    map: opts.map,
    emissive: opts.emissive !== undefined ? new THREE.Color(opts.emissive) : undefined,
    emissiveIntensity: opts.emissiveIntensity ?? 0,
    flatShading: opts.flat ?? false,
  })
}

/** Lak — Phong s ostrým highlightem (hero car look bez env mapy). */
export function matPaint(
  color: number,
  opts: { emissive?: number; emissiveIntensity?: number } = {},
): THREE.MeshPhongMaterial {
  const em = opts.emissive ?? color
  return new THREE.MeshPhongMaterial({
    color,
    emissive: new THREE.Color(em),
    emissiveIntensity: opts.emissiveIntensity ?? 0.14,
    shininess: 110,
    specular: new THREE.Color(0xb0b8c4),
  })
}

export function matAccent(color: number, intensity = 0.55): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({
    color,
    emissive: new THREE.Color(color),
    emissiveIntensity: intensity,
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
): THREE.MeshPhongMaterial {
  return new THREE.MeshPhongMaterial({
    color,
    map: opts.map,
    shininess: opts.shininess ?? 28,
    specular: new THREE.Color(opts.specular ?? 0x333333),
    emissive: opts.emissive !== undefined ? new THREE.Color(opts.emissive) : undefined,
    emissiveIntensity: opts.emissiveIntensity ?? 0,
  })
}

export function roadMap(world: WorldKind): THREE.CanvasTexture {
  void world
  const t = noiseTexture('road-asphalt', '#a8a8b0', { speck: 1800, speckAlpha: 0.08 })
  t.repeat.set(20, 20)
  return t
}

export function groundMap(world: WorldKind): THREE.CanvasTexture {
  if (world === 'rally') {
    const t = noiseTexture('ground-rally-hi', '#3a4a32', { size: 256, speck: 5000, speckAlpha: 0.09 })
    t.repeat.set(40, 40)
    return t
  }
  if (world === 'city') {
    const t = noiseTexture('ground-city-hi', '#16161e', { size: 256, speck: 2800, speckAlpha: 0.07 })
    t.repeat.set(30, 30)
    return t
  }
  const t = noiseTexture('ground-dawn-hi', '#2e3a24', { size: 256, speck: 4500, speckAlpha: 0.11 })
  t.repeat.set(36, 36)
  return t
}

export function plasterMap(seed: string, hex: string): THREE.CanvasTexture {
  return noiseTexture(`plaster-${seed}`, hex, { size: 128, speck: 900, speckAlpha: 0.07 })
}
