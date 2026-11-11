import type { VehicleKind } from '../track/TrackDefs'

/**
 * Základní paleta (+ růžová, custom RGB v menu). Jedna modrá.
 */
export const PAINT_COLOR_CHOICES = [
  0xc62828, // červená
  0x1565c0, // modrá
  0x2e7d32, // zelená
  0xef6c00, // oranžová
  0xf9a825, // žlutá
  0xeceff1, // bílá
  0x1a1a1a, // černá
  0xff4da6, // růžová
]

/** @deprecated alias — stejná paleta */
export const BODY_COLOR_CHOICES = PAINT_COLOR_CHOICES
/** @deprecated alias — stejná paleta */
export const ACCENT_COLOR_CHOICES = PAINT_COLOR_CHOICES

export const COLOR_NONE = -1

export type VehicleLook = {
  body: number
  neon: number
  wheel: number
  rider: number
  helm: number
}

export const DEFAULT_VEHICLE_LOOK: VehicleLook = {
  body: PAINT_COLOR_CHOICES[0]!,
  neon: PAINT_COLOR_CHOICES[7]!,
  wheel: 0x1a1a1a,
  rider: 0x1c2430,
  helm: 0x2a2a32,
}

export type VehicleBranch = 'freestyle' | 'auto' | 'moto' | 'monster'

export function vehicleBranch(kind: VehicleKind): VehicleBranch {
  if (
    kind === 'skate' ||
    kind === 'skates' ||
    kind === 'bike' ||
    kind === 'scooter' ||
    kind === 'rocketScooter' ||
    kind === 'rocketSkate' ||
    kind === 'rocketSkates' ||
    kind === 'rocketBike'
  ) {
    return 'freestyle'
  }
  if (
    kind === 'moto' ||
    kind === 'harley' ||
    kind === 'kroska' ||
    kind === 'naked' ||
    kind === 'enduro'
  ) {
    return 'moto'
  }
  if (
    kind === 'monster' ||
    kind === 'truck' ||
    kind === 'tank' ||
    kind === 'buggy' ||
    kind === 'humvee'
  ) {
    return 'monster'
  }
  return 'auto'
}

export function kindsInBranch(branch: VehicleBranch): VehicleKind[] {
  // Pořadí = max km/h sestupně (UI: nejrychlejší nahoře)
  switch (branch) {
    case 'freestyle':
      // Rychlost sestupně (UI nahoře nejrychlejší)
      return [
        'rocketBike',
        'rocketSkates',
        'rocketSkate',
        'bike',
        'skates',
        'skate',
        'scooter',
        'rocketScooter',
      ]
    case 'moto':
      return ['moto', 'naked', 'harley', 'enduro', 'kroska']
    case 'monster':
      return ['monster', 'buggy', 'humvee', 'truck', 'tank']
    default:
      return ['formula', 'cabrio', 'muscle', 'street', 'limo']
  }
}

export function vehicleHasRider(kind: VehicleKind): boolean {
  return (
    kind === 'moto' ||
    kind === 'harley' ||
    kind === 'kroska' ||
    kind === 'naked' ||
    kind === 'enduro' ||
    kind === 'skate' ||
    kind === 'skates' ||
    kind === 'bike' ||
    kind === 'scooter' ||
    kind === 'rocketScooter' ||
    kind === 'rocketSkate' ||
    kind === 'rocketSkates' ||
    kind === 'rocketBike'
  )
}

export function vehicleHasHelm(kind: VehicleKind): boolean {
  return (
    kind === 'moto' ||
    kind === 'harley' ||
    kind === 'kroska' ||
    kind === 'naked' ||
    kind === 'enduro' ||
    kind === 'skate' ||
    kind === 'skates' ||
    kind === 'bike' ||
    kind === 'rocketSkate' ||
    kind === 'rocketSkates' ||
    kind === 'rocketBike'
  )
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0
  return () => {
    t += 0x6d2b79f5
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

/** Klidnější AI paleta — bez křiklavé růžové / random RGB. */
const AI_BODY_COLORS = [
  0xc62828, // červená
  0x1565c0, // modrá
  0x2e7d32, // zelená
  0xef6c00, // oranžová
  0xf9a825, // žlutá
  0xeceff1, // bílá
  0x1a1a1a, // černá
  0x455a64, // ocelová
  0x5d4037, // hnědá
  0x37474f, // grafit
]

const AI_RIDER_COLORS = [0x1c2430, 0x2a2a32, 0x3e2723, 0x37474f, 0x1b5e20, 0x4a148c]
const AI_HELM_COLORS = [0x1a1a1a, 0x263238, 0xeceff1, 0xc62828, 0x1565c0, 0xf9a825]
const AI_WHEEL_COLORS = [0x1a1a1a, 0x263238, 0x37474f, 0xb0bec5]

function pick<T>(rand: () => number, list: T[]): T {
  return list[Math.floor(rand() * list.length)]!
}

/**
 * AI look: realistické kombinace z klidné palety. Neon vždy vypnutý.
 * Seed = slot + raceSalt → stejný závod = stabilní barvy, nový závod = jiné.
 */
export function aiVehicleLook(slot: number, raceSalt = 0): VehicleLook {
  const rand = mulberry32(((slot | 0) + 1) * 9973 + (raceSalt | 0) * 7919 + 42)
  return {
    body: pick(rand, AI_BODY_COLORS),
    neon: COLOR_NONE,
    wheel: pick(rand, AI_WHEEL_COLORS),
    rider: pick(rand, AI_RIDER_COLORS),
    helm: pick(rand, AI_HELM_COLORS),
  }
}
