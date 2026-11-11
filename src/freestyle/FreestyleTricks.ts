/**
 * Freestyle (skate / brusle / BMX + raketové): triky na písmena bez konfliktu se speciálními bindy.
 * Rezervováno (ne triky): P pauza, R restart, C kamera. WASD defaultně = triky (ne řízení).
 */

import type { VehicleKind } from '../track/TrackDefs'
import { fsBaseKind, isFsBoardKind } from '../vehicle/FsKinds'
import type { SpinStyle } from './TrickAnim'

export type FreestyleKind = 'skate' | 'skates' | 'bike'

export type FreestyleTrickDef = {
  id: string
  letter: string
  nameCs: string
  nameEn: string
  difficulty: number
  dur: number
  peak: number
  points: number
  spin: SpinStyle
}

/** Klávesy závodu / menu — nesmí spouštět FS trik. P = pauza (jako Esc). WASD = triky. */
export const RESERVED_TRICK_LETTERS = new Set(['P', 'R', 'C'])

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

function trick(
  letter: string,
  id: string,
  nameCs: string,
  nameEn: string,
  difficulty: number,
  spin: SpinStyle,
): FreestyleTrickDef {
  const d = Math.max(1, Math.min(10, difficulty))
  const dur = Math.round((1 + ((d - 1) / 9) * 5) * 10) / 10
  const peak = 1.6 + d * 0.28
  const points = Math.round(dur * 10) / 10
  return { id, letter, nameCs, nameEn, difficulty: d, dur, peak, points, spin }
}

/** Skate triky — volná písmena (bez P/R/C; WASD = základní triky). */
export const SKATE_FREESTYLE: FreestyleTrickDef[] = [
  trick('W', 'ollie', 'Ollie', 'Ollie', 1, 'none'),
  trick('A', 'nosegrab', 'Nosegrab', 'Nosegrab', 3, 'none'),
  trick('S', 'boardslide', 'Boardslide', 'Boardslide', 3, 'roll'),
  trick('D', 'indy', 'Indy', 'Indy', 3, 'none'),
  trick('B', 'nollie', 'Nollie', 'Nollie', 2, 'none'),
  trick('E', 'bs360', 'BS 360', 'BS 360', 6, 'yaw'),
  trick('F', 'kickflip', 'Kickflip', 'Kickflip', 4, 'kick'),
  trick('G', 'heelflip', 'Heelflip', 'Heelflip', 4, 'heel'),
  trick('H', 'varialflip', 'Varial flip', 'Varial flip', 5, 'tre'),
  trick('I', 'hardflip', 'Hardflip', 'Hardflip', 5, 'kick'),
  trick('J', 'inwardheel', 'Inward heel', 'Inward heelflip', 5, 'heel'),
  trick('K', 'treflip', '360 flip', 'Tre flip', 6, 'tre'),
  trick('L', 'impossible', 'Impossible', 'Impossible', 7, 'imp'),
  trick('M', 'laserflip', 'Laser flip', 'Laser flip', 8, 'laser'),
  trick('N', 'bigspin', 'Bigspin', 'Bigspin', 6, 'yaw'),
  trick('O', 'fs360', 'FS 360', 'FS 360', 6, 'yaw'),
  trick('Q', 'shove', 'Shove-it', 'Shove-it', 5, 'yaw'),
  trick('T', 'gazelle', 'Gazelle', 'Gazelle flip', 9, 'flipyaw'),
  trick('U', 'underflip', 'Underflip', 'Underflip', 8, 'kick'),
  trick('V', 'dolphin', 'Dolphin flip', 'Dolphin flip', 7, 'imp'),
  trick('X', 'nightmare', 'Nightmare flip', 'Nightmare flip', 9, 'laser'),
  trick('Y', 'quadflip', 'Quad flip', 'Quad flip', 10, 'quadkick'),
  trick('Z', 'emiral', 'Emiral flip', 'Emiral flip', 10, 'flipyaw'),
]

/**
 * Kolečkové brusle — mezi skate a BMX (obtížnosti o ~0.5 níž než skate flip / blíž grindům).
 */
export const SKATES_FREESTYLE: FreestyleTrickDef[] = [
  trick('W', 'rollout', 'Roll-out', 'Roll-out', 1, 'none'),
  trick('A', 'alleyoop', 'Alley-oop', 'Alley-oop', 3, 'yaw'),
  trick('S', 'soulbasic', 'Soul', 'Soul', 2, 'roll'),
  trick('D', 'frontside', 'Frontside', 'Frontside', 3, 'yaw'),
  trick('B', 'royale', 'Royale', 'Royale', 2, 'none'),
  trick('F', 'soul', 'Soul grind', 'Soul grind', 3, 'roll'),
  trick('G', 'makio', 'Makio', 'Makio', 4, 'roll'),
  trick('H', 'unity', 'Unity', 'Unity', 5, 'yaw'),
  trick('I', 'fishbrain', 'Fishbrain', 'Fishbrain', 5, 'heel'),
  trick('J', 'mizou', 'Mizou', 'Mizou', 5, 'roll'),
  trick('K', 'backslide', 'Backslide', 'Backslide', 6, 'yaw'),
  trick('L', 'topsoul', 'Top soul', 'Top soul', 6, 'roll'),
  trick('M', 'acid', 'Acid', 'Acid', 7, 'kick'),
  trick('N', 'savoslav', 'Savoslav', 'Savoslav', 6, 'yaw'),
  trick('O', '360spin', '360 spin', '360 spin', 6, 'yaw'),
  trick('Q', '540spin', '540 spin', '540 spin', 7, 'yaw'),
  trick('E', 'royalspin', 'Royal spin', 'Royal spin', 6, 'yaw'),
  trick('T', 'trailer', 'Trailer', 'Trailer', 8, 'flipyaw'),
  trick('U', 'torque', 'Torque', 'Torque', 7, 'kick'),
  trick('V', 'sweatheart', 'Sweetheart', 'Sweetheart', 7, 'imp'),
  trick('X', 'fullcab', 'Full cab', 'Full cab', 8, 'laser'),
  trick('Y', 'bio', 'Bio', 'Bio', 9, 'quadkick'),
  trick('Z', 'hawaii', 'Hawaii', 'Hawaii', 10, 'flipyaw'),
]

/** Bike / BMX — stejná rezervovaná písmena. */
export const BIKE_FREESTYLE: FreestyleTrickDef[] = [
  trick('W', 'bunnyhop', 'Bunnyhop', 'Bunnyhop', 1, 'none'),
  trick('A', 'endo', 'Endo', 'Endo', 3, 'imp'),
  trick('S', 'fakie', 'Fakie', 'Fakie', 2, 'none'),
  trick('D', 'footjam', 'Footjam', 'Footjam', 3, 'none'),
  trick('B', 'manual', 'Manual', 'Manual', 2, 'none'),
  trick('F', 'tabletop', 'Tabletop', 'Tabletop', 4, 'roll'),
  trick('G', 'cancan', 'Can-can', 'Can-can', 4, 'roll'),
  trick('H', 'tailwhip', 'Tailwhip', 'Tailwhip', 5, 'yaw'),
  trick('I', 'toboggan', 'Toboggan', 'Toboggan', 5, 'roll'),
  trick('J', 'barspin360', '360 barspin', '360 barspin', 6, 'yaw'),
  trick('K', 'superman', 'Superman', 'Superman', 6, 'none'),
  trick('L', 'nothing', 'Nothing', 'Nothing', 5, 'none'),
  trick('M', 'tackwhip', 'Tackwhip', 'Tackwhip', 7, 'yaw'),
  trick('N', 'decade', 'Decade', 'Decade', 7, 'yaw'),
  trick('O', 'backflip', 'Backflip', 'Backflip', 8, 'imp'),
  trick('Q', 'frontflip', 'Frontflip', 'Frontflip', 8, 'imp'),
  trick('E', 'barspin', 'Barspin', 'Barspin', 5, 'yaw'),
  trick('T', 'nohander', 'No-hander', 'No-hander', 5, 'none'),
  trick('U', 'onehander', 'One-hander', 'One-hander', 4, 'none'),
  trick('V', 'invert', 'Invert', 'Invert', 8, 'roll'),
  trick('X', 'doublewhip', 'Double tailwhip', 'Double tailwhip', 9, 'yaw'),
  trick('Y', 'triplewhip', 'Triple whip', 'Triple whip', 10, 'yaw'),
  trick('Z', 'backflipwhip', 'Backflip whip', 'Backflip whip', 10, 'imp'),
]

export function freestyleKindOf(kind: VehicleKind | FreestyleKind): FreestyleKind {
  if (kind === 'skate' || kind === 'skates' || kind === 'bike') return kind
  if (isFsBoardKind(kind as VehicleKind)) return fsBaseKind(kind as VehicleKind)
  return 'skate'
}

export function freestyleList(kind: VehicleKind | FreestyleKind): FreestyleTrickDef[] {
  const base = freestyleKindOf(kind)
  const all =
    base === 'bike' ? BIKE_FREESTYLE : base === 'skates' ? SKATES_FREESTYLE : SKATE_FREESTYLE
  return all.filter((tr) => !RESERVED_TRICK_LETTERS.has(tr.letter))
}

export function letterToCode(letter: string): string {
  return `Key${letter.toUpperCase()}`
}

export function codeToLetter(code: string): string | null {
  if (code.startsWith('Key') && code.length === 4) {
    const ch = code.slice(3).toUpperCase()
    if (!LETTERS.includes(ch) || RESERVED_TRICK_LETTERS.has(ch)) return null
    return ch
  }
  return null
}

/** Umístění → body závodu (freestyle součet). */
export function placePoints(place: number): number {
  if (place === 1) return 100
  if (place === 2) return 70
  if (place === 3) return 45
  if (place === 4) return 25
  return Math.max(5, 30 - place * 5)
}

/**
 * FS závod: triky váží víc než čas/umístění; umístění (čas) pořád přispívá.
 * placeWeight 0.35 ≈ šamp FS.
 */
export function freestyleRaceScore(trickPts: number, place: number, placeWeight = 0.35): number {
  return Math.round(Math.max(0, trickPts) + placePoints(place) * placeWeight)
}
