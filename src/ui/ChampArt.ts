import { assetUrl } from './assetUrl'
import type { DifficultyId } from '../ai/Difficulty'
import type { MenuTone } from '../render/AtmosphereSettings'
import type { VehicleKind } from '../track/TrackDefs'
import type { VehicleBranch } from '../vehicle/VehicleLook'

/** Cache-bust po výměně menu fotek (jinak prohlížeč drží starý JPG). */
const ART_V = 'v11'

/**
 * Rezervace (ať se nepřekrývá quick race × šamp):
 * - Setup Jet = menu/tile-jet-start.jpg
 * - Domů → Závod = menu/race-klecmania-road.jpg
 * - Šamp auto Jet = menu/champ-tile-jet-auto.jpg (≠ tile-jet-start)
 * - Šamp auto Liga = menu/champ-tile-league-auto.jpg (≠ featured)
 */

function menuArt(path: string): string {
  return `${assetUrl(path)}?${ART_V}`
}

/**
 * Třída v hubu (menu 2 šamp) — unikátní foto podle větve.
 * Klecany + moto → Babeta (ne sportbike s helmou).
 */
export function champClassArt(branch: VehicleBranch, tone: MenuTone = 'klecany'): string {
  if (branch === 'moto' && tone === 'klecany') {
    return menuArt('menu/champ-tile-series-moto-klecany.jpg')
  }
  return menuArt(`menu/champ-class-${branch}.jpg`)
}

/** Pit stop — dílna podle peclostroje (moto ≠ auto). */
export function champPitArt(branch: VehicleBranch): string {
  return menuArt(`menu/champ-pit-${branch}.jpg`)
}

/**
 * Jet — start závodu podle větve.
 * Moto = class moto (motorka), ne street-car neon.
 */
export function champJetArt(branch: VehicleBranch): string {
  return menuArt(`menu/champ-tile-jet-${branch}.jpg`)
}

/**
 * Série — FS board, moto, monster, auto.
 * Klecany + moto → Babeta (lokální motiv).
 */
export function champSeriesArt(branch: VehicleBranch, tone: MenuTone = 'klecany'): string {
  if (branch === 'moto' && tone === 'klecany') {
    return menuArt('menu/champ-tile-series-moto-klecany.jpg')
  }
  return menuArt(`menu/champ-tile-series-${branch}.jpg`)
}

/** Liga — velikost ceny, motiv větve. */
export function champLeagueArt(branch: VehicleBranch): string {
  return menuArt(`menu/champ-tile-league-${branch}.jpg`)
}

/**
 * Startovní koupě — foto podle konkrétního vozu (levnější / dražší půlka Jet).
 * Fallback = jet větve.
 */
const STARTER_VEHICLE_ART: Partial<Record<VehicleKind, string>> = {
  limo: 'menu/champ-starter-limo.jpg',
  street: 'menu/champ-starter-street.jpg',
  kroska: 'menu/champ-starter-kroska.jpg',
  enduro: 'menu/champ-starter-enduro.jpg',
  tank: 'menu/champ-starter-tank.jpg',
  truck: 'menu/champ-starter-truck.jpg',
  skate: 'menu/champ-starter-skate.jpg',
  bike: 'menu/champ-starter-bike.jpg',
  skates: 'menu/champ-starter-skates.jpg',
  scooter: 'menu/champ-starter-scooter.jpg',
}

export function champStarterVehicleArt(kind: VehicleKind, branch: VehicleBranch): string {
  const path = STARTER_VEHICLE_ART[kind]
  return path ? menuArt(path) : champJetArt(branch)
}

/** Briefing / pohár — Jet+Série+Liga podle větve (+ tone pro Klecany Babeta). */
export function champBriefArt(
  branch: VehicleBranch = 'auto',
  tone: MenuTone = 'klecany',
): {
  jet: string
  pitFallback: string
  series: string
  classes: string
  featured: string
  league: string
  cup: string
} {
  return {
    jet: champJetArt(branch),
    pitFallback: champPitArt(branch),
    series: champSeriesArt(branch, tone),
    classes: menuArt('menu/champ-tile-classes.jpg'),
    featured: menuArt('menu/champ-tile-featured.jpg'),
    league: champLeagueArt(branch),
    cup: menuArt('menu/tile-championship-cup.jpg'),
  }
}

/**
 * Obtížnost začátečník → expert:
 * moss (klid) → ice (lehčí) → road (střed) → ember (těžké) → neon (expert)
 */
export function difficultyArt(id: DifficultyId): string {
  return menuArt(`menu/diff-${id}.jpg`)
}
