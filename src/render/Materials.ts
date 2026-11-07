import * as THREE from 'three'

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

export function roadMap(world: 'city' | 'circuit' | 'ice'): THREE.CanvasTexture {
  if (world === 'ice') {
    const t = noiseTexture('road-ice', '#c5d6e8', { speck: 2400, speckAlpha: 0.12 })
    t.repeat.set(24, 24)
    return t
  }
  if (world === 'city') {
    const t = noiseTexture('road-city', '#2e2e36', { speck: 2200, speckAlpha: 0.1 })
    t.repeat.set(18, 18)
    return t
  }
  const t = noiseTexture('road-circuit', '#32363c', { speck: 2000, speckAlpha: 0.09 })
  t.repeat.set(20, 20)
  return t
}

export function groundMap(world: 'city' | 'circuit' | 'ice'): THREE.CanvasTexture {
  if (world === 'ice') {
    const t = noiseTexture('ground-snow', '#e8f2f8', { speck: 2800, speckAlpha: 0.07 })
    t.repeat.set(40, 40)
    return t
  }
  if (world === 'city') {
    const t = noiseTexture('ground-city', '#16161e', { speck: 1600, speckAlpha: 0.06 })
    t.repeat.set(30, 30)
    return t
  }
  const t = noiseTexture('ground-grass', '#2d7540', { speck: 2600, speckAlpha: 0.11 })
  t.repeat.set(36, 36)
  return t
}
