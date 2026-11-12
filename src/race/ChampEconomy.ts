import type { DifficultyId } from '../ai/Difficulty'
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

/** @deprecated Obtížnost už neškáluje Kč — vždy 1. */
export function purseScaleFromDifficulty(_difficulty: DifficultyId): number {
  return 1
}

/** Startovní hotovost šampionátu. */
export const CHAMP_START_CASH = 50_000

/**
 * Startovní hotovost kariéry — 50 000 Kč.
 * Obtížnost neškáluje výplaty.
 */
export function startCash(_difficulty: DifficultyId): number {
  return CHAMP_START_CASH
}

/**
 * Výplata za kolo (×2 oproti dřívějšku). Strop = 1. místo.
 * Opakování stejného kola jen dorovná rozdíl (viz `cashTopUp`).
 */
const PLACE_CASH_BASE: Record<number, number> = {
  1: 24_000,
  2: 16_000,
  3: 11_000,
  4: 7_000,
}

/** Max výplata za jedno kalendářní kolo (= 1. místo). */
export function maxPlaceCash(): number {
  return PLACE_CASH_BASE[1]!
}

export function placeCash(place: number, _difficulty?: DifficultyId): number {
  if (isDnfPlace(place)) return 0
  return PLACE_CASH_BASE[place] ?? 4_000
}

/** Doplatek: už vyplaceno `alreadyPaid`, nové místo → jen rozdíl nahoru (strop 1.). */
export function cashTopUp(place: number, alreadyPaid: number, stageHalf = false): number {
  let full = placeCash(place)
  if (stageHalf) full = Math.round(full * 0.5)
  const cap = stageHalf ? Math.round(maxPlaceCash() * 0.5) : maxPlaceCash()
  const target = Math.min(full, cap)
  const paid = Math.max(0, Math.round(alreadyPaid))
  return Math.max(0, target - paid)
}

/** Kariéra: 1. = 3 … 4. = 0. */
export function champPlacePoints(place: number): number {
  if (isDnfPlace(place)) return 0
  if (place === 1) return 3
  if (place === 2) return 2
  if (place === 3) return 1
  return 0
}

/**
 * FS kariéra: pořadí podle `2×rank(triky)+1×rank(dojezd)` → body 3/2/1/0.
 * Remíza skóre → vyšší triky. `entries[0]` = hráč.
 */
export function freestyleChampPoints(
  entries: { place: number; trickPts: number }[],
): number[] {
  const n = entries.length
  if (n === 0) return []
  const idx = entries.map((_, i) => i)
  const rankPts = (orderBy: (i: number) => number, preferHigher: boolean): number[] => {
    const sorted = [...idx].sort((a, b) => {
      const d = preferHigher ? orderBy(b) - orderBy(a) : orderBy(a) - orderBy(b)
      if (d !== 0) return d
      return a - b
    })
    const out = Array.from({ length: n }, () => 0)
    sorted.forEach((id, rank) => {
      out[id] = champPlacePoints(rank + 1)
    })
    return out
  }
  const byTricks = rankPts((i) => entries[i]!.trickPts, true)
  const byPlace = rankPts((i) => entries[i]!.place, false)
  const combined = idx.map((i) => 2 * byTricks[i]! + byPlace[i]!)
  const sorted = [...idx].sort((a, b) => {
    const d = combined[b]! - combined[a]!
    if (d !== 0) return d
    // Remíza → preferuj triky
    const td = entries[b]!.trickPts - entries[a]!.trickPts
    if (td !== 0) return td
    return entries[a]!.place - entries[b]!.place
  })
  const out = Array.from({ length: n }, () => 0)
  sorted.forEach((id, rank) => {
    out[id] = champPlacePoints(rank + 1)
  })
  return out
}

export function roundPoints(
  branch: VehicleBranch,
  place: number,
  trickPts = 0,
): number {
  if (isDnfPlace(place)) return 0
  if (branch === 'freestyle') {
    // Solo/HUD fallback — kariéra používá freestyleChampPoints se všemi jezdci
    return freestyleChampPoints([{ place, trickPts }, { place: 4, trickPts: 0 }, { place: 3, trickPts: 0 }, { place: 2, trickPts: 0 }])[0] ?? 0
  }
  return champPlacePoints(place)
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

/** Pohár za sezónu → peněženka do další sezóny (×2). */
const PODIUM_PURSE_BASE: Record<1 | 2 | 3 | 4, number> = {
  1: 160_000,
  2: 100_000,
  3: 60_000,
  4: 24_000,
}

export type SeasonPodiumTier = 1 | 2 | 3 | 4

export function maxPossiblePoints(_branch: VehicleBranch, totalRounds = 18): number {
  return 3 * Math.max(1, totalRounds)
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
  _difficulty?: DifficultyId,
): number {
  return PODIUM_PURSE_BASE[tier]!
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
