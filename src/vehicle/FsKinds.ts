import type { VehicleKind } from '../track/TrackDefs'

/** Koloběžka / raketová koloběžka — easter egg past (nelze jet / koupit). */
export function isScooterTrapKind(kind: VehicleKind): boolean {
  return kind === 'scooter' || kind === 'rocketScooter'
}

/** FS board (triky / Shift / Tab) — včetně raketových. */
export function isFsBoardKind(kind: VehicleKind): boolean {
  return (
    kind === 'skate' ||
    kind === 'skates' ||
    kind === 'bike' ||
    kind === 'rocketSkate' ||
    kind === 'rocketSkates' ||
    kind === 'rocketBike'
  )
}

export function isRocketFsKind(kind: VehicleKind): boolean {
  return kind === 'rocketSkate' || kind === 'rocketSkates' || kind === 'rocketBike'
}

/** Neraketový „sourozenec“ pro stats / triky. */
export type FsBaseKind = 'skate' | 'skates' | 'bike'

export function fsBaseKind(kind: VehicleKind): FsBaseKind {
  if (kind === 'rocketSkate' || kind === 'skate') return 'skate'
  if (kind === 'rocketBike' || kind === 'bike') return 'bike'
  return 'skates'
}

/** Shift boost vůči cruise. Raketové +20 % oproti sourozencům. */
export function fsShiftBoostMult(kind: VehicleKind): number {
  const base = fsBaseKind(kind)
  const mult = base === 'skate' ? 3 : base === 'skates' ? 2.5 : 2
  return isRocketFsKind(kind) ? mult * 1.2 : mult
}

/** +30 % základních stats u raketových. */
export const ROCKET_FS_STAT_MULT = 1.3
