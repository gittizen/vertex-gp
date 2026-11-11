import * as THREE from 'three'
import { matLambert } from '../render/Materials'

export type HouseStyle = 'city' | 'town' | 'climb'

/** 32 fasád — světlejší škála pro noční čitelnost (ne černé kvádry). */
const FACADES_CITY = [
  0xb85848, 0xd4b080, 0x5a7a98, 0xc8b0a0, 0x7a8a68, 0x8a6a88, 0xe0d0b8, 0x4a5868,
  0xc06848, 0x6a90a8, 0xa09080, 0x5a6878, 0xd09070, 0x708090, 0xc8a888, 0x485868,
  0xf0d0a8, 0x4e8a7a, 0xb04860, 0x8098a8, 0xd4c0a0, 0x6a5a78, 0xc88868, 0x407088,
  0xe8b888, 0x7a9870, 0xa87888, 0x5a7888, 0xd0a080, 0x688098, 0xb89878, 0x486878,
] as const

const FACADES_TOWN = [
  0xc8b8a4, 0xd4c4b0, 0xb8a890, 0xccc0b0, 0xa89880, 0xd8c8b8, 0xe0d0c0, 0xb0a090,
  0xc4b094, 0xd0c4b0, 0xa89078, 0xccc8b8, 0xb8a888, 0xd8d0c0, 0x9a8870, 0xe8dcc8,
  0xdcc8b0, 0xbca890, 0xe4d4c0, 0xa89888, 0xd0bca8, 0xc0b0a0, 0xe8e0d0, 0xb8a898,
  0xd8c0a8, 0xc8b8a8, 0xe0d8c8, 0xa89080, 0xd4c8b8, 0xc4b8a8, 0xf0e8d8, 0xb0a088,
] as const

/** Climb / Do Klecánek — teplá omítka (ne olivově zelená). */
const FACADES_CLIMB = [
  0xc8b8a4, 0xd4c4b0, 0xb8a890, 0xccc0b0, 0xd8c8b8, 0xe0d0c0, 0xb0a090, 0xc4b094,
  0xd0c4b0, 0xa89078, 0xccc8b8, 0xb8a888, 0xd8d0c0, 0xe8dcc8, 0xdcc8b0, 0xbca890,
  0xe4d4c0, 0xa89888, 0xd0bca8, 0xc0b0a0, 0xe8e0d0, 0xb8a898, 0xd8c0a8, 0xc8b8a8,
  0xe0d8c8, 0xd4c8b8, 0xc4b8a8, 0xf0e8d8, 0xb0a088, 0xdcc4b0, 0xc8bca8, 0xe4d8c4,
] as const

const ROOFS = [
  0xa04532, 0x6a2a22, 0x5a4a42, 0x8a4030, 0x4a3a32, 0x7a5040, 0x3a3a40, 0xb05030,
  0x2a2a30, 0x8a6a50, 0x504848, 0xc06040, 0x4a4440, 0x6a3a28, 0x484050, 0x9a4838,
] as const

const WINDOW_CITY = [
  0xffc878, 0xffb060, 0xe8d0a0, 0xd0e0ff, 0xffe0a8, 0xa0c8ff, 0xffd090, 0xc8e0ff,
  0xffa878, 0xb0d8ff, 0xffe8c0, 0x90b8e8, 0xffc8a0, 0xc0e8ff, 0xffd8b0, 0xa8d0f0,
] as const

const NEONS = [0xff6a3d, 0x40c8e0, 0xff40a0, 0x60e080, 0xffc040, 0x7080ff, 0xff8040, 0x40e0c0] as const

function pick<T>(arr: readonly T[], i: number): T {
  return arr[((i % arr.length) + arr.length) % arr.length]!
}

type HouseResult = { group: THREE.Group; halfW: number; halfD: number }

/**
 * 8 archetypů × 32 fasád × střechy/okna/neony ≈ 4×+ vizuální variabilita.
 */
export function createVariedHouse(seed: number, style: HouseStyle): HouseResult {
  const facades =
    style === 'city' ? FACADES_CITY : style === 'town' ? FACADES_TOWN : FACADES_CLIMB
  const facade = pick(facades, seed)
  const roofCol = pick(ROOFS, seed * 3 + 1)
  // City noc: fasáda mírně emissive, ať není černá silueta
  const wall =
    style === 'city'
      ? matLambert(facade, { emissive: facade, emissiveIntensity: 0.14 })
      : matLambert(facade)
  const roofM =
    style === 'city'
      ? matLambert(roofCol, { emissive: roofCol, emissiveIntensity: 0.06 })
      : matLambert(roofCol)
  const archetype = seed % 8

  if (style === 'city') {
    switch (archetype) {
      case 0:
        return citySlab(seed, wall, roofM, facade)
      case 1:
        return cityTower(seed, wall, roofM)
      case 2:
        return cityLBlock(seed, wall, roofM, facades)
      case 3:
        return cityTwin(seed, wall, roofM, facades)
      case 4:
        return cityStorefront(seed, wall, roofM)
      case 5:
        return cityStepped(seed, wall, roofM)
      case 6:
        return cityWarehouse(seed, wall, roofM)
      default:
        return cityVilla(seed, wall, roofM)
    }
  }

  return ruralHouse(seed, style, wall, roofM, facades, facade)
}

function citySlab(
  seed: number,
  wall: THREE.MeshStandardMaterial,
  roofM: THREE.MeshStandardMaterial,
  facade: number,
): HouseResult {
  const g = new THREE.Group()
  const w = 6 + (seed % 5) * 1.2
  const d = 5.2 + (seed % 4) * 0.9
  const floors = 3 + (seed % 5)
  const h = floors * 2.9 + 0.3
  g.add(box(w, h, d, wall, 0, h / 2, 0))
  addFlatRoof(g, w, d, h, roofM, seed)
  addCityWindows(g, w, d, h, floors, seed)
  maybeNeon(g, w, d, h, seed)
  maybeBalcony(g, w, d, h, seed)
  if (seed % 3 === 1) {
    const trim = matLambert(shade(facade, 0.75))
    g.add(box(w + 0.15, 0.25, d + 0.15, trim, 0, h * 0.33, 0))
    g.add(box(w + 0.15, 0.25, d + 0.15, trim, 0, h * 0.66, 0))
  }
  return { group: g, halfW: w * 0.5, halfD: d * 0.5 }
}

function cityTower(
  seed: number,
  wall: THREE.MeshStandardMaterial,
  roofM: THREE.MeshStandardMaterial,
): HouseResult {
  const g = new THREE.Group()
  const w = 4.2 + (seed % 3) * 0.6
  const d = 4.2 + (seed % 3) * 0.5
  const floors = 6 + (seed % 5)
  const h = floors * 2.85
  g.add(box(w, h, d, wall, 0, h / 2, 0))
  const cap = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.4, d + 0.6), roofM)
  cap.position.y = h + 0.2
  g.add(cap)
  addCityWindows(g, w, d, h, floors, seed)
  maybeNeon(g, w, d, h, seed)
  return { group: g, halfW: w * 0.5, halfD: d * 0.5 }
}

function cityLBlock(
  seed: number,
  wall: THREE.MeshStandardMaterial,
  roofM: THREE.MeshStandardMaterial,
  facades: readonly number[],
): HouseResult {
  const g = new THREE.Group()
  const w = 7 + (seed % 4) * 0.8
  const d = 6 + (seed % 3) * 0.7
  const h = 8 + (seed % 4) * 1.5
  g.add(box(w, h, d * 0.45, wall, 0, h / 2, -d * 0.28))
  const wing = matLambert(pick(facades, seed + 5))
  g.add(box(w * 0.42, h * 0.85, d, wing, w * 0.28, (h * 0.85) / 2, 0))
  addFlatRoof(g, w, d * 0.45, h, roofM, seed)
  addCityWindows(g, w, d * 0.45, h, 3 + (seed % 3), seed)
  maybeNeon(g, w, d * 0.45, h, seed)
  return { group: g, halfW: w * 0.55, halfD: d * 0.55 }
}

function cityTwin(
  seed: number,
  wall: THREE.MeshStandardMaterial,
  roofM: THREE.MeshStandardMaterial,
  facades: readonly number[],
): HouseResult {
  const g = new THREE.Group()
  const w = 4.5 + (seed % 3) * 0.5
  const d = 5 + (seed % 3) * 0.6
  const hA = 9 + (seed % 4) * 1.2
  const hB = 7 + (seed % 3) * 1.4
  g.add(box(w, hA, d, wall, -w * 0.55, hA / 2, 0))
  const wallB = matLambert(pick(facades, seed + 9))
  g.add(box(w, hB, d, wallB, w * 0.55, hB / 2, 0))
  addFlatRoof(g, w, d, hA, roofM, seed, -w * 0.55)
  addFlatRoof(g, w, d, hB, roofM, seed + 1, w * 0.55)
  addCityWindows(g, w, d, hA, 4, seed, -w * 0.55)
  addCityWindows(g, w, d, hB, 3, seed + 2, w * 0.55)
  return { group: g, halfW: w * 1.1, halfD: d * 0.5 }
}

function cityStorefront(
  seed: number,
  wall: THREE.MeshStandardMaterial,
  roofM: THREE.MeshStandardMaterial,
): HouseResult {
  const g = new THREE.Group()
  const w = 7 + (seed % 4) * 0.9
  const d = 5.5 + (seed % 3) * 0.7
  const h = 6.5 + (seed % 3) * 1.1
  g.add(box(w, h, d, wall, 0, h / 2, 0))
  const shop = matLambert(0x1a1c24, { emissive: pick(WINDOW_CITY, seed), emissiveIntensity: 0.4 })
  g.add(box(w * 0.85, 2.2, 0.12, shop, 0, 1.4, d / 2 + 0.05))
  const awning = matLambert(pick(NEONS, seed), { emissive: pick(NEONS, seed), emissiveIntensity: 0.35 })
  g.add(box(w * 0.9, 0.15, 1.1, awning, 0, 2.6, d / 2 + 0.45))
  addFlatRoof(g, w, d, h, roofM, seed)
  addCityWindows(g, w, d, h, 2, seed)
  maybeNeon(g, w, d, h, seed)
  return { group: g, halfW: w * 0.5, halfD: d * 0.5 }
}

function cityStepped(
  seed: number,
  wall: THREE.MeshStandardMaterial,
  roofM: THREE.MeshStandardMaterial,
): HouseResult {
  const g = new THREE.Group()
  const w = 6.5 + (seed % 3) * 0.8
  const d = 5.5 + (seed % 3) * 0.6
  const h1 = 5 + (seed % 3)
  const h2 = h1 + 3.5 + (seed % 2)
  const h3 = h2 + 3 + (seed % 2)
  g.add(box(w, h1, d, wall, 0, h1 / 2, 0))
  g.add(box(w * 0.75, h2 - h1, d * 0.75, wall, 0, h1 + (h2 - h1) / 2, 0))
  g.add(box(w * 0.5, h3 - h2, d * 0.5, wall, 0, h2 + (h3 - h2) / 2, 0))
  addFlatRoof(g, w * 0.5, d * 0.5, h3, roofM, seed)
  addCityWindows(g, w, d, h1, 2, seed)
  maybeNeon(g, w * 0.5, d * 0.5, h3, seed)
  return { group: g, halfW: w * 0.5, halfD: d * 0.5 }
}

function cityWarehouse(
  seed: number,
  wall: THREE.MeshStandardMaterial,
  roofM: THREE.MeshStandardMaterial,
): HouseResult {
  const g = new THREE.Group()
  const w = 9 + (seed % 4) * 1.1
  const d = 7 + (seed % 3) * 0.9
  const h = 5.5 + (seed % 3) * 0.8
  g.add(box(w, h, d, wall, 0, h / 2, 0))
  const shed = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, 0.35, d + 0.8), roofM)
  shed.position.set(0, h + 0.5, 0.2)
  shed.rotation.x = -0.12
  g.add(shed)
  const door = matLambert(0x2a2c34)
  g.add(box(2.4, 3.2, 0.1, door, -w * 0.25, 1.7, d / 2 + 0.05))
  addCityWindows(g, w, d, h, 2, seed)
  return { group: g, halfW: w * 0.5, halfD: d * 0.5 }
}

function cityVilla(
  seed: number,
  wall: THREE.MeshStandardMaterial,
  roofM: THREE.MeshStandardMaterial,
): HouseResult {
  const g = new THREE.Group()
  const w = 6 + (seed % 4) * 0.7
  const d = 6.5 + (seed % 3) * 0.8
  const h = 5.5 + (seed % 3) * 0.6
  g.add(box(w, h, d, wall, 0, h / 2, 0))
  const roofKind = seed % 3
  if (roofKind === 0) {
    const r = new THREE.Mesh(new THREE.ConeGeometry(w * 0.7, 2.2, 4), roofM)
    r.rotation.y = Math.PI / 4
    r.position.y = h + 1.1
    g.add(r)
  } else if (roofKind === 1) {
    const hip = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.52, 2.3, 4), roofM)
    hip.rotation.y = Math.PI / 4
    hip.position.y = h + 1.1
    g.add(hip)
  } else {
    addFlatRoof(g, w, d, h, roofM, seed)
  }
  addCityWindows(g, w, d, h, 2, seed)
  maybeBalcony(g, w, d, h, seed)
  maybeChimney(g, w, d, h, seed)
  return { group: g, halfW: w * 0.5, halfD: d * 0.5 }
}

function ruralHouse(
  seed: number,
  style: HouseStyle,
  wall: THREE.MeshStandardMaterial,
  roofM: THREE.MeshStandardMaterial,
  facades: readonly number[],
  _facade: number,
): HouseResult {
  const g = new THREE.Group()
  const w = 4.5 + (seed % 5) * 1.0
  const d = 6 + (seed % 4) * 1.2
  const floors = 1 + (seed % 3)
  const h = 3.2 + floors * 1.1 + (seed % 3) * 0.35
  g.add(box(w, h, d, wall, 0, h / 2, 0))

  const roofKind = seed % 4
  if (roofKind === 0) {
    const r = new THREE.Mesh(new THREE.ConeGeometry(w * 0.72, 2.0 + (seed % 3) * 0.35, 4), roofM)
    r.rotation.y = Math.PI / 4
    r.position.y = h + 1.0
    g.add(r)
  } else if (roofKind === 1) {
    addFlatRoof(g, w, d, h, roofM, seed)
  } else if (roofKind === 2) {
    const hip = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.55, 2.4, 4), roofM)
    hip.rotation.y = Math.PI / 4
    hip.position.y = h + 1.15
    g.add(hip)
  } else {
    const shed = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 0.28, d + 0.6), roofM)
    shed.position.set(0, h + 0.4, 0.15)
    shed.rotation.x = -0.18
    g.add(shed)
  }

  const dark = matLambert(0x2a2830)
  const cols = 2 + (seed % 3)
  for (let c = 0; c < cols; c++) {
    g.add(box(0.7, 0.9, 0.08, dark, -w * 0.28 + c * (w * 0.28), h * 0.45, d / 2 + 0.05))
  }
  maybeBalcony(g, w, d, h, seed)
  maybeChimney(g, w, d, h, seed)
  if (seed % 5 === 2) {
    const annex = matLambert(pick(facades, seed + 7))
    g.add(box(w * 0.55, h * 0.45, d * 0.4, annex, w * 0.55, h * 0.22, 0))
  }
  if (style === 'climb' && seed % 4 === 0) {
    const stone = matLambert(0x8a8074)
    g.add(box(w + 0.4, 0.8, d + 0.4, stone, 0, 0.4, 0))
  }
  return { group: g, halfW: w * 0.55, halfD: d * 0.55 }
}

function box(
  w: number,
  h: number,
  d: number,
  mat: THREE.Material,
  x: number,
  y: number,
  z: number,
): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
  m.position.set(x, y, z)
  return m
}

function addFlatRoof(
  g: THREE.Group,
  w: number,
  d: number,
  h: number,
  roofM: THREE.Material,
  seed: number,
  ox = 0,
): void {
  const flat = new THREE.Mesh(new THREE.BoxGeometry(w + 0.5, 0.32, d + 0.5), roofM)
  flat.position.set(ox, h + 0.16, 0)
  g.add(flat)
  if (seed % 2 === 0) {
    const parapet = new THREE.Mesh(
      new THREE.BoxGeometry(w + 0.35, 0.55, d + 0.35),
      matLambert(0x2a2a32),
    )
    parapet.position.set(ox, h + 0.4, 0)
    g.add(parapet)
  }
}

function addCityWindows(
  g: THREE.Group,
  w: number,
  d: number,
  h: number,
  floors: number,
  seed: number,
  ox = 0,
): void {
  const win = matLambert(pick(WINDOW_CITY, seed), {
    emissive: pick(WINDOW_CITY, seed),
    emissiveIntensity: 0.85,
  })
  const pattern = seed % 3
  if (pattern === 0) {
    const bandH = Math.min(h * 0.55, floors * 2.0)
    g.add(box(w * 0.7, bandH, 0.1, win, ox, h * 0.5, d / 2 + 0.06))
  } else if (pattern === 1) {
    const rows = Math.min(floors, 5)
    for (let r = 0; r < rows; r++) {
      const cols = 2 + (seed % 3)
      for (let c = 0; c < cols; c++) {
        g.add(
          box(
            0.7,
            0.85,
            0.08,
            win,
            ox - w * 0.28 + c * (w * 0.28),
            1.4 + r * (h / (rows + 0.5)),
            d / 2 + 0.05,
          ),
        )
      }
    }
  } else {
    g.add(box(w * 0.55, h * 0.62, 0.1, win, ox, h * 0.48, d / 2 + 0.06))
    if (seed % 2 === 0) {
      g.add(box(0.1, h * 0.5, d * 0.5, win, ox + w / 2 + 0.05, h * 0.45, 0))
    }
  }
}

function maybeNeon(g: THREE.Group, w: number, d: number, h: number, seed: number): void {
  if (seed % 3 !== 0) return
  const neonCol = pick(NEONS, seed)
  g.add(
    box(
      w * 0.45,
      0.18,
      0.12,
      matLambert(neonCol, { emissive: neonCol, emissiveIntensity: 0.65 }),
      0,
      h * 0.82,
      d / 2 + 0.1,
    ),
  )
}

function maybeBalcony(g: THREE.Group, w: number, d: number, h: number, seed: number): void {
  if (seed % 4 !== 1) return
  g.add(box(w * 0.45, 0.12, 0.7, matLambert(0x5a5a62), 0, h * 0.55, d / 2 + 0.35))
}

function maybeChimney(g: THREE.Group, w: number, d: number, h: number, seed: number): void {
  if (seed % 3 === 0) return
  g.add(box(0.45, 1.2, 0.45, matLambert(0x6a5a52), w * 0.25, h + 1.5, -d * 0.15))
}

function shade(hex: number, f: number): number {
  const r = Math.min(255, Math.floor(((hex >> 16) & 255) * f))
  const g = Math.min(255, Math.floor(((hex >> 8) & 255) * f))
  const b = Math.min(255, Math.floor((hex & 255) * f))
  return (r << 16) | (g << 8) | b
}
