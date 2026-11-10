/**
 * Freestyle (skate + kolo): triky na písmena A–Z bez diakritiky.
 * Složitost → body + délka 1–6 s (nepřerušitelné) + animace.
 */

import type { SpinStyle } from './TrickAnim'

export type FreestyleKind = 'skate' | 'bike'

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
  // 1–6 s podle obtížnosti; body = délka triku (1 desetina)
  const dur = Math.round((1 + ((d - 1) / 9) * 5) * 10) / 10
  const peak = 1.6 + d * 0.28
  const points = Math.round(dur * 10) / 10
  return { id, letter, nameCs, nameEn, difficulty: d, dur, peak, points, spin }
}

/** 26 skate triků A–Z */
export const SKATE_FREESTYLE: FreestyleTrickDef[] = [
  trick('A', 'ollie', 'Ollie', 'Ollie', 1, 'none'),
  trick('B', 'nollie', 'Nollie', 'Nollie', 2, 'none'),
  trick('C', 'shoveit', 'Shove-it', 'Shove-it', 2, 'shove'),
  trick('D', 'fs180', 'FS 180', 'FS 180', 3, 'yaw'),
  trick('E', 'bs180', 'BS 180', 'BS 180', 3, 'yaw'),
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
  trick('P', 'bs360', 'BS 360', 'BS 360', 6, 'yaw'),
  trick('Q', 'doubleflip', 'Double kickflip', 'Double kickflip', 8, 'doublekick'),
  trick('R', 'hospital', 'Hospital flip', 'Hospital flip', 7, 'heel'),
  trick('S', 'pressure', 'Pressure flip', 'Pressure flip', 7, 'kick'),
  trick('T', 'gazelle', 'Gazelle', 'Gazelle flip', 9, 'flipyaw'),
  trick('U', 'underflip', 'Underflip', 'Underflip', 8, 'kick'),
  trick('V', 'dolphin', 'Dolphin flip', 'Dolphin flip', 7, 'imp'),
  trick('W', 'lateflip', 'Late flip', 'Late flip', 8, 'doublekick'),
  trick('X', 'nightmare', 'Nightmare flip', 'Nightmare flip', 9, 'laser'),
  trick('Y', 'quadflip', 'Quad flip', 'Quad flip', 10, 'quadkick'),
  trick('Z', 'emiral', 'Emiral flip', 'Emiral flip', 10, 'flipyaw'),
]

/** 26 bike / BMX triků A–Z */
export const BIKE_FREESTYLE: FreestyleTrickDef[] = [
  trick('A', 'bunnyhop', 'Bunny hop', 'Bunny hop', 1, 'none'),
  trick('B', 'manual', 'Manual', 'Manual', 2, 'none'),
  trick('C', 'endo', 'Endo', 'Endo', 2, 'none'),
  trick('D', 'barspin', 'Barspin', 'Barspin', 3, 'yaw'),
  trick('E', 'xup', 'X-up', 'X-up', 3, 'yaw'),
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
  trick('P', 'frontflip', 'Frontflip', 'Frontflip', 8, 'imp'),
  trick('Q', 'flair', 'Flair', 'Flair', 9, 'imp'),
  trick('R', 'truckdriver', 'Truck driver', 'Truck driver', 7, 'yaw'),
  trick('S', 'pegbar', 'Peg barspin', 'Peg barspin', 6, 'yaw'),
  trick('T', 'nohander', 'No-hander', 'No-hander', 5, 'none'),
  trick('U', 'onehander', 'One-hander', 'One-hander', 4, 'none'),
  trick('V', 'invert', 'Invert', 'Invert', 8, 'roll'),
  trick('W', 'turndown', 'Turndown', 'Turndown', 6, 'roll'),
  trick('X', 'doublewhip', 'Double tailwhip', 'Double tailwhip', 9, 'yaw'),
  trick('Y', 'triplewhip', 'Triple whip', 'Triple whip', 10, 'yaw'),
  trick('Z', 'backflipwhip', 'Backflip whip', 'Backflip whip', 10, 'imp'),
]

export function freestyleList(kind: FreestyleKind): FreestyleTrickDef[] {
  return kind === 'bike' ? BIKE_FREESTYLE : SKATE_FREESTYLE
}

export function letterToCode(letter: string): string {
  return `Key${letter.toUpperCase()}`
}

export function codeToLetter(code: string): string | null {
  if (code.startsWith('Key') && code.length === 4) {
    const ch = code.slice(3).toUpperCase()
    return LETTERS.includes(ch) ? ch : null
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
