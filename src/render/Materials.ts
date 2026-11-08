import * as THREE from 'three'
import type { WorldKind } from '../track/TrackDefs'

const textureCache = new Map<string, THREE.CanvasTexture>()

/** Procedurální šum — asfalt, sníh, beton… aby to nebylo flat vektor. */
export function noiseTexture(
  key: string,
  base: string,
  opts: { size?: number; speck?: number; speckAlpha?: number; tint?: string } = {},
): THREE.CanvasTexture {
  const cached = textureCache.get(key)
  if (cached) return cached

  const size = opts.size ?? 128
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = base
  ctx.fillRect(0, 0, size, size)

  const speck = opts.speck ?? 1800
  const a = opts.speckAlpha ?? 0.08
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
  tex.needsUpdate = true
  textureCache.set(key, tex)
  return tex
}

/** Asfalt bez vlivu světel a fogu — sytá šedá zůstane čitelná. */
export function matAsphalt(color: number = 0xa8a8b0): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color, fog: false, side: THREE.DoubleSide })
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

/**
 * Lak peklostroje — bez sdílené mapy (dispose tratě/preview ji nesmí zničit).
 * Jemný emisní nádech ve stylu menu neonu.
 */
export function matPaint(
  color: number,
  opts: { emissive?: number; emissiveIntensity?: number } = {},
): THREE.MeshLambertMaterial {
  const em = opts.emissive ?? color
  return new THREE.MeshLambertMaterial({
    color,
    emissive: new THREE.Color(em),
    emissiveIntensity: opts.emissiveIntensity ?? 0.1,
  })
}

/** Neon / chrome akcenty. */
export function matAccent(color: number, intensity = 0.55): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({
    color,
    emissive: new THREE.Color(color),
    emissiveIntensity: intensity,
  })
}

export function matPhong(
  color: number,
  opts: { map?: THREE.Texture; shininess?: number; specular?: number; emissive?: number; emissiveIntensity?: number } = {},
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
    const t = noiseTexture('ground-rally', '#3a4a32', { speck: 2800, speckAlpha: 0.07 })
    t.repeat.set(40, 40)
    return t
  }
  if (world === 'city') {
    const t = noiseTexture('ground-city', '#16161e', { speck: 1600, speckAlpha: 0.06 })
    t.repeat.set(30, 30)
    return t
  }
  const t = noiseTexture('ground-dawn', '#2e3a24', { speck: 2400, speckAlpha: 0.1 })
  t.repeat.set(36, 36)
  return t
}
