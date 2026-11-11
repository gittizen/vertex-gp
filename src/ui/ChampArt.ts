import { assetUrl } from './assetUrl'
import type { DifficultyId } from '../ai/Difficulty'
import type { MenuTone } from '../render/AtmosphereSettings'
import type { ChampLeague } from '../race/Championship'
import type { VehicleKind } from '../track/TrackDefs'
import type { VehicleBranch } from '../vehicle/VehicleLook'

/** Cache-bust po výměně menu fotek (jinak prohlížeč drží starý JPG/WebP). */
const ART_V = 'v15'

/**
 * Rezervace (ať se nepřekrývá quick race × šamp):
 * - Setup Jet = menu/tile-jet-start.webp
 * - Domů → Závod = menu/race-klecmania-road.webp
 * - Šamp auto Jet = menu/champ-tile-jet-auto.webp (≠ tile-jet-start)
 * - Šamp auto Liga = menu/champ-tile-league-auto.webp (≠ featured)
 */

/** Menu arty preferují WebP (menší decode); cesta může zůstat s .jpg v kódu. */
function toMenuWebp(path: string): string {
  return path.replace(/\.jpe?g$/i, '.webp')
}

function menuArt(path: string): string {
  return `${assetUrl(toMenuWebp(path))}?${ART_V}`
}

/** Přednačte URL (decode mimo kritickou cestu renderu). */
export function preloadMenuArts(urls: readonly string[]): void {
  for (const url of urls) {
    if (!url) continue
    const img = new Image()
    img.decoding = 'async'
    img.src = url
    void img.decode?.().catch(() => {})
  }
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

/** Pit stop — foto aktuálního vozu (starter art). */
export function champPitArt(kind: VehicleKind, branch: VehicleBranch): string {
  return champStarterVehicleArt(kind, branch)
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

/** Liga — velikost ceny, motiv větve (legacy / brief). */
export function champLeagueArt(branch: VehicleBranch): string {
  return menuArt(`menu/champ-tile-league-${branch}.jpg`)
}

/** Cena (baby / small / grand) — unikátní art pro výběr. */
export function champCenaArt(league: ChampLeague): string {
  return menuArt(`menu/champ-tile-cena-${league}.jpg`)
}

/** Sezóna + kalendář — sdílený art. */
export function champSeasonArt(): string {
  return menuArt('menu/champ-tile-season.jpg')
}

/** Žebříček kariéry + menu 1 leaderboard — sdílený art. */
export function champStandingsArt(): string {
  return menuArt('menu/champ-tile-standings.jpg')
}

/**
 * Startovní koupě — foto podle konkrétního vozu (levnější / dražší půlka Jet).
 * Fallback = jet větve.
 */
const STARTER_VEHICLE_ART: Partial<Record<VehicleKind, string>> = {
  limo: 'menu/champ-starter-limo.jpg',
  street: 'menu/champ-starter-street.jpg',
  formula: 'menu/champ-starter-formula.jpg',
  cabrio: 'menu/champ-starter-cabrio.jpg',
  kroska: 'menu/champ-starter-kroska.jpg',
  enduro: 'menu/champ-starter-enduro.jpg',
  moto: 'menu/champ-starter-moto.jpg',
  naked: 'menu/champ-starter-naked.jpg',
  tank: 'menu/champ-starter-tank.jpg',
  truck: 'menu/champ-starter-truck.jpg',
  monster: 'menu/champ-starter-monster.jpg',
  buggy: 'menu/champ-starter-buggy.jpg',
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
  season: string
  standings: string
} {
  return {
    jet: champJetArt(branch),
    pitFallback: menuArt(`menu/champ-pit-${branch}.jpg`),
    series: champSeriesArt(branch, tone),
    classes: menuArt('menu/champ-tile-classes.jpg'),
    featured: menuArt('menu/champ-tile-featured.jpg'),
    league: champLeagueArt(branch),
    cup: menuArt('menu/tile-championship-cup.jpg'),
    season: champSeasonArt(),
    standings: champStandingsArt(),
  }
}

/**
 * Obtížnost začátečník → expert:
 * moss (klid) → ice (lehčí) → road (střed) → ember (těžké) → neon (expert)
 */
export function difficultyArt(id: DifficultyId): string {
  return menuArt(`menu/diff-${id}.jpg`)
}
