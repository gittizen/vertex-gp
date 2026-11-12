import {
  FREESTYLE_VEHICLE_KINDS,
  RACE_VEHICLE_KINDS,
  type VehicleKind,
} from '../track/TrackDefs'
import { isRocketFsKind } from '../vehicle/FsKinds'
import { sortKindsBySpeedDesc } from '../vehicle/VehicleProfiles'

const STORAGE_KEY = 'klecgp.race'

/** Automat · manuál (+5 %) · manuál se spojkou (+20 %) */
type TransmissionMode = 'auto' | 'manual' | 'clutch'

export type RaceSettingsValues = {
  /** Jet trať v opačném směru */
  reverse: boolean
  /** Režim řazení (jen PC, jen ne-freestyle peklostroje) */
  transmission: TransmissionMode
  /** Freestyle soutěž (skate / kolo) — body za triky */
  freestyle: boolean
  /** Přeskočit odpočet 3–2–1 */
  skipCountdown: boolean
  /** Počet kol na okruhových tratích (loop); etapy/sandbox ignorují */
  laps: number
  /** Solo: každý závod nové náhodné AI peklostroje (default) */
  randomOpponentsEachRace: boolean
  /** Peklostroje AI soupeřů (3 sloty) — platí když randomOpponentsEachRace=false */
  opponents: [VehicleKind, VehicleKind, VehicleKind]
}

export const DEFAULT_RACE: RaceSettingsValues = {
  /** Rychlý závod + MP: default opačný směr. Kariéra si směr řídí sama. */
  reverse: true,
  transmission: 'auto',
  freestyle: false,
  skipCountdown: false,
  laps: 3,
  randomOpponentsEachRace: true,
  opponents: ['street', 'moto', 'formula'],
}

/** Rychlý závod / MP — číselník 1–69. */
export const RACE_LAP_MIN = 1
export const RACE_LAP_MAX = 69
/** @deprecated dřív pevné chipy; UI teď používá číselník. */
export const RACE_LAP_CHOICES = [1, 2, 3, 4, 5] as const

export function clampRaceLaps(n: unknown): number {
  const v = typeof n === 'number' ? n : Number(n)
  if (!Number.isFinite(v)) return DEFAULT_RACE.laps
  return Math.max(RACE_LAP_MIN, Math.min(RACE_LAP_MAX, Math.round(v)))
}

const TX_MODES: TransmissionMode[] = ['auto', 'manual', 'clutch']

function normOpponent(k: unknown, fallback: VehicleKind): VehicleKind {
  if (typeof k === 'string' && (RACE_VEHICLE_KINDS as string[]).includes(k)) {
    return k as VehicleKind
  }
  return fallback
}

function normTransmission(raw: unknown, legacyManual?: unknown): TransmissionMode {
  if (typeof raw === 'string' && TX_MODES.includes(raw as TransmissionMode)) {
    return raw as TransmissionMode
  }
  if (legacyManual === true || legacyManual === '1') return 'manual'
  return 'auto'
}

/** Manuál / spojka neplatí pro freestyle peklostroje (skate, kolo). */
export function transmissionAllowedFor(kind: VehicleKind): boolean {
  return !(FREESTYLE_VEHICLE_KINDS as string[]).includes(kind)
}

function isFreestyleKind(kind: VehicleKind): boolean {
  return (FREESTYLE_VEHICLE_KINDS as string[]).includes(kind)
}

/**
 * Solo kategorie: freestyle mód NEBO freestyle peklostroj → jen skate/kolo.
 * Klasika s autem → jen ne-freestyle. (Multiplayer si kategorie nemíchá — cokoliv vs cokoliv.)
 */
export function soloCategoryPool(playerKind: VehicleKind, freestyleMode: boolean): VehicleKind[] {
  if (freestyleMode || isFreestyleKind(playerKind)) {
    return [...FREESTYLE_VEHICLE_KINDS]
  }
  return sortKindsBySpeedDesc(RACE_VEHICLE_KINDS.filter((k) => !isFreestyleKind(k)))
}

export function clampOpponentsToCategory(
  opponents: [VehicleKind, VehicleKind, VehicleKind],
  playerKind: VehicleKind,
  freestyleMode: boolean,
): [VehicleKind, VehicleKind, VehicleKind] {
  const pool = soloCategoryPool(playerKind, freestyleMode)
  const fallback = pool[0] ?? 'street'
  const fix = (k: VehicleKind) => (pool.includes(k) ? k : fallback)
  return [fix(opponents[0]), fix(opponents[1]), fix(opponents[2])]
}

/** Jednorázově přepnout uložený směr na opačný (rychlý závod / MP default). */
const REVERSE_DEFAULT_FIX = `${STORAGE_KEY}.dirReverse.v1`

export function loadRaceSettings(): RaceSettingsValues {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem('klec-gp-race')
    if (!raw) return { ...DEFAULT_RACE, opponents: [...DEFAULT_RACE.opponents] }
    const parsed = JSON.parse(raw) as Partial<RaceSettingsValues> & { manualShift?: boolean }
    const op = Array.isArray(parsed.opponents) ? parsed.opponents : DEFAULT_RACE.opponents
    let reverse = Boolean(parsed.reverse)
    const migrateReverse = !localStorage.getItem(REVERSE_DEFAULT_FIX)
    if (migrateReverse) {
      reverse = true
      localStorage.setItem(REVERSE_DEFAULT_FIX, '1')
    }
    const vals: RaceSettingsValues = {
      reverse,
      transmission: normTransmission(parsed.transmission, parsed.manualShift),
      freestyle: false, // freestyle závod zrušen — skate/kolo mají triky v klasice
      skipCountdown: Boolean(parsed.skipCountdown),
      // Chybějící klíč = default 3 (dřív pevné 2 v RaceManager)
      laps: parsed.laps !== undefined ? clampRaceLaps(parsed.laps) : DEFAULT_RACE.laps,
      // Chybějící klíč = default true (starší save bez flagu)
      randomOpponentsEachRace:
        typeof parsed.randomOpponentsEachRace === 'boolean'
          ? parsed.randomOpponentsEachRace
          : true,
      opponents: [
        normOpponent(op[0], DEFAULT_RACE.opponents[0]),
        normOpponent(op[1], DEFAULT_RACE.opponents[1]),
        normOpponent(op[2], DEFAULT_RACE.opponents[2]),
      ],
    }
    if (migrateReverse) saveRaceSettings(vals)
    return vals
  } catch {
    return { ...DEFAULT_RACE, opponents: [...DEFAULT_RACE.opponents] }
  }
}

export function saveRaceSettings(vals: RaceSettingsValues): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(vals))
  try {
    localStorage.setItem(REVERSE_DEFAULT_FIX, '1')
  } catch {
    /* ignore */
  }
}

/** Načti jen uložený směr (po kariéře — ať nepřepíše quick/MP preferenci). */
export function peekPersistedReverse(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem('klec-gp-race')
    if (!raw) return DEFAULT_RACE.reverse
    const parsed = JSON.parse(raw) as Partial<RaceSettingsValues>
    if (typeof parsed.reverse === 'boolean') return parsed.reverse
  } catch {
    /* ignore */
  }
  return DEFAULT_RACE.reverse
}

/** Náhodní soupeři — v solo vždy stejná kategorie jako hráč (FS vč. raket, bez koloběžek). */
export function randomOpponents(
  playerKind: VehicleKind = 'street',
  freestyleMode = false,
): [VehicleKind, VehicleKind, VehicleKind] {
  const pool = soloCategoryPool(playerKind, freestyleMode)
  const pick = () => pool[Math.floor(Math.random() * pool.length)] ?? 'street'
  const out: [VehicleKind, VehicleKind, VehicleKind] = [pick(), pick(), pick()]
  // FS: zvyš šanci na raketového AI soupeře
  if (freestyleMode || isFreestyleKind(playerKind)) {
    const rockets = pool.filter(isRocketFsKind)
    if (rockets.length > 0 && !out.some(isRocketFsKind)) {
      out[Math.floor(Math.random() * 3)] = rockets[Math.floor(Math.random() * rockets.length)]!
    }
  }
  return out
}
