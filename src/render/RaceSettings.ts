import type { VehicleKind } from '../track/TrackDefs'
import { FREESTYLE_VEHICLE_KINDS, RACE_VEHICLE_KINDS } from '../track/TrackDefs'

const STORAGE_KEY = 'klecgp.race'

/** Automat · manuál (+5 %) · manuál se spojkou (+20 %) */
export type TransmissionMode = 'auto' | 'manual' | 'clutch'

export type RaceSettingsValues = {
  /** Jet trať v opačném směru */
  reverse: boolean
  /** Režim řazení (jen PC, jen ne-freestyle peklostroje) */
  transmission: TransmissionMode
  /** Freestyle soutěž (skate / kolo) — body za triky */
  freestyle: boolean
  /** Přeskočit odpočet 3–2–1 */
  skipCountdown: boolean
  /** Solo: každý závod nové náhodné AI peklostroje (default) */
  randomOpponentsEachRace: boolean
  /** Peklostroje AI soupeřů (3 sloty) — platí když randomOpponentsEachRace=false */
  opponents: [VehicleKind, VehicleKind, VehicleKind]
}

export const DEFAULT_RACE: RaceSettingsValues = {
  reverse: false,
  transmission: 'auto',
  freestyle: false,
  skipCountdown: false,
  randomOpponentsEachRace: true,
  opponents: ['street', 'moto', 'formula'],
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

export function isFreestyleKind(kind: VehicleKind): boolean {
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
  return RACE_VEHICLE_KINDS.filter((k) => !isFreestyleKind(k))
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

export function loadRaceSettings(): RaceSettingsValues {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem('klec-gp-race')
    if (!raw) return { ...DEFAULT_RACE, opponents: [...DEFAULT_RACE.opponents] }
    const parsed = JSON.parse(raw) as Partial<RaceSettingsValues> & { manualShift?: boolean }
    const op = Array.isArray(parsed.opponents) ? parsed.opponents : DEFAULT_RACE.opponents
    return {
      reverse: Boolean(parsed.reverse),
      transmission: normTransmission(parsed.transmission, parsed.manualShift),
      freestyle: false, // freestyle závod zrušen — skate/kolo mají triky v klasice
      skipCountdown: Boolean(parsed.skipCountdown),
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
  } catch {
    return { ...DEFAULT_RACE, opponents: [...DEFAULT_RACE.opponents] }
  }
}

export function saveRaceSettings(vals: RaceSettingsValues): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(vals))
}

/** Náhodní soupeři — v solo vždy stejná kategorie jako hráč. */
export function randomOpponents(
  playerKind: VehicleKind = 'street',
  freestyleMode = false,
): [VehicleKind, VehicleKind, VehicleKind] {
  const pool = soloCategoryPool(playerKind, freestyleMode)
  const pick = () => pool[Math.floor(Math.random() * pool.length)] ?? 'street'
  return [pick(), pick(), pick()]
}
