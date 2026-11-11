import type { DifficultyId } from '../ai/Difficulty'
import { getDifficulty } from '../ai/Difficulty'
import { freestyleRaceScore, placePoints } from '../freestyle/FreestyleTricks'
import type { PlayerTuningValues } from '../tuning/PlayerTuning'
import { CHAMP_TUNING_MAX, TUNING_MAX } from '../tuning/PlayerTuning'
import type { VehicleBranch } from '../vehicle/VehicleLook'
import { kindsInBranch } from '../vehicle/VehicleLook'
import type { VehicleKind } from '../track/TrackDefs'
import { catalogMaxKmh } from '../vehicle/VehicleProfiles'

export type ChampCareerEconomySlice = {
  branch: VehicleBranch
  points: number
  difficulty: DifficultyId
  cash: number
  tuning: PlayerTuningValues
}

export const DNF_PLACE = 99

export function isDnfPlace(place: number): boolean {
  return place >= DNF_PLACE || place <= 0
}

/** Mírný bonus za těžší sérii (sponzor) — ceny vozů zůstávají tržní. */
export function purseScaleFromDifficulty(difficulty: DifficultyId): number {
  const s = getDifficulty(difficulty).speedScale
  // superEasy 0.56 → ~0.85, normal 1 → 1, superHard 1.69 → ~1.25
  return Math.max(0.85, Math.min(1.25, 0.75 + s * 0.25))
}

/** Startovní hotovost šampionátu (všechny větve včetně moto). */
export const CHAMP_START_CASH = 45_000

/**
 * Startovní hotovost kariéry — 45 000 Kč (stačí na 2. vůz / mid unlock).
 * Obtížnost neškáluje start; výplaty za kola dál ano.
 */
export function startCash(_difficulty: DifficultyId): number {
  return CHAMP_START_CASH
}

/**
 * Výplata za kolo (klubový šampionát, Kč).
 * Střední pole (~2. místo) ≈ 8 000 → za 18 kol ~144k + start 45k ≈ 189k.
 * Ceny: mid 45k, top 95k → při solidní sezóně oba vozy + trochu tuningu.
 * Slabší sezóna (4.) → mid + tuning, top až při lepších výsledcích.
 */
const PLACE_CASH_BASE: Record<number, number> = {
  1: 12_000,
  2: 8_000,
  3: 5_500,
  4: 3_500,
}

export function placeCash(place: number, difficulty: DifficultyId): number {
  if (isDnfPlace(place)) return 0
  const base = PLACE_CASH_BASE[place] ?? 2_000
  return Math.round(base * purseScaleFromDifficulty(difficulty))
}

export function roundPoints(
  branch: VehicleBranch,
  place: number,
  trickPts = 0,
): number {
  if (isDnfPlace(place)) return 0
  if (branch === 'freestyle') {
    // Stejný vzorec jako freestyleRaceScore — triky > umístění
    return freestyleRaceScore(trickPts, place, 0.35)
  }
  return placePoints(place)
}

/**
 * Tržní ceny odemčení (neškálují se obtížností — stejný ceník).
 * unlockIndex 0 = nejpomalejší (startovní koupě) … dál podle větve.
 */
export function vehicleBuyPrice(
  branch: VehicleBranch,
  unlockIndex: number,
  _difficulty: DifficultyId,
): number | null {
  if (unlockIndex === 0) return 15_000
  if (branch === 'freestyle') {
    // 0–2 neraketové startéry 15k; 3–5 raketové (tier 5 ceník)
    if (unlockIndex === 1) return 15_000 // skates
    if (unlockIndex === 2) return 15_000 // bike
    if (unlockIndex === 3) return 95_000 // rocketSkate
    if (unlockIndex === 4) return 125_000 // rocketSkates
    if (unlockIndex === 5) return 180_000 // rocketBike
    return null
  }
  if (unlockIndex === 1) return 45_000
  if (unlockIndex === 2) return 70_000
  if (unlockIndex === 3) return 125_000
  if (unlockIndex === 4) return 180_000
  return null
}

/**
 * Tier vozidla 1…N (1 = nejpomalejší ve větvi).
 * Cena stupně L: L × 2000 × 2^(tier−1).
 */
export function champVehicleTier(branch: VehicleBranch, kind: VehicleKind): number {
  if (kind === 'scooter') return 1
  // FS: neraketové = tier 2, raketové = tier 5 (ceny upgrade / vůz)
  if (branch === 'freestyle') {
    if (kind === 'rocketSkate' || kind === 'rocketSkates' || kind === 'rocketBike') return 5
    return 2
  }
  const order = kindsInBranch(branch)
    .filter((k): k is Exclude<VehicleKind, 'scooter'> => k !== 'scooter')
    .sort((a, b) => catalogMaxKmh(a) - catalogMaxKmh(b))
  const idx = order.indexOf(kind)
  return Math.max(1, idx < 0 ? 1 : idx + 1)
}

export function champTuneStepCost(level: number, tier: number): number {
  const L = Math.max(1, Math.round(level))
  const T = Math.max(1, Math.round(tier))
  return L * 2000 * 2 ** (T - 1)
}

/**
 * Náklady na posun na `newLevel` z `fromLevel` (suma cen stupňů).
 * Bez vehicle/branch → legacy flat 1000/stupeň (fallback).
 */
export function tuningUpgradeCost(
  newLevel: number,
  _difficulty: DifficultyId,
  fromLevel?: number,
  vehicle?: VehicleKind,
  branch?: VehicleBranch,
): number {
  const max = vehicle && branch ? CHAMP_TUNING_MAX : TUNING_MAX
  const next = Math.max(0, Math.min(max, Math.round(newLevel)))
  if (fromLevel == null) {
    if (vehicle && branch) return champTuneStepCost(Math.max(1, next), champVehicleTier(branch, vehicle))
    return 1_000
  }
  const from = Math.max(0, Math.min(max, Math.round(fromLevel)))
  if (next <= from) return 0
  if (vehicle && branch) {
    const tier = champVehicleTier(branch, vehicle)
    let sum = 0
    for (let L = from + 1; L <= next; L++) sum += champTuneStepCost(L, tier)
    return sum
  }
  return (next - from) * 1_000
}

/** Pohár za sezónu → peněženka do další sezóny. */
const PODIUM_PURSE_BASE: Record<1 | 2 | 3 | 4, number> = {
  1: 80_000,
  2: 50_000,
  3: 30_000,
  4: 12_000,
}

export type SeasonPodiumTier = 1 | 2 | 3 | 4

export function maxPossiblePoints(branch: VehicleBranch, totalRounds = 18): number {
  const perRound =
    branch === 'freestyle'
      ? Math.round(placePoints(1) * 0.35 + 120)
      : placePoints(1)
  return perRound * Math.max(1, totalRounds)
}

export function seasonPodiumTier(
  career: Pick<ChampCareerEconomySlice, 'branch' | 'points'> & { totalRounds?: number },
): SeasonPodiumTier {
  const max = maxPossiblePoints(career.branch, career.totalRounds ?? 18)
  const ratio = max > 0 ? career.points / max : 0
  if (ratio >= 0.85) return 1
  if (ratio >= 0.65) return 2
  if (ratio >= 0.45) return 3
  return 4
}

export function seasonPodiumPurse(
  tier: SeasonPodiumTier,
  difficulty: DifficultyId,
): number {
  return Math.round(PODIUM_PURSE_BASE[tier] * purseScaleFromDifficulty(difficulty))
}

export function cashCarryFraction(leftoverCash: number): number {
  return Math.round(leftoverCash * 0.25)
}

export function canAffordTuningUpgrade(
  career: ChampCareerEconomySlice & { vehicle?: VehicleKind },
  key: keyof PlayerTuningValues,
  targetLevel: number,
): boolean {
  const next = Math.round(targetLevel)
  const from = career.tuning[key]
  if (next <= from || next > CHAMP_TUNING_MAX) return false
  return (
    career.cash >=
    tuningUpgradeCost(next, career.difficulty, from, career.vehicle, career.branch)
  )
}
