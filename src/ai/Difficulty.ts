export type DifficultyId = 'superEasy' | 'easy' | 'normal' | 'hard' | 'superHard'

export type DifficultyDef = {
  id: DifficultyId
  label: string
  blurb: string
  /** 1 = střední */
  speedScale: number
}

/**
 * Lehká = −30 % (0.7).
 * Super lehká = o 20 % lehčí než lehká → 0.7 × 0.8 = 0.56.
 * Těžká = dřív +10 %, teď ještě +10 % → 1.1 × 1.1 = 1.21.
 * Super těžká = o 40 % těžší než těžká → 1.21 × 1.4 ≈ 1.694.
 */
export const DIFFICULTIES: DifficultyDef[] = [
  {
    id: 'superEasy',
    label: 'Super lehká',
    blurb: 'O 20 % lehčí než lehká',
    speedScale: 0.56,
  },
  {
    id: 'easy',
    label: 'Lehká',
    blurb: 'Celé o 30 % lehčí',
    speedScale: 0.7,
  },
  {
    id: 'normal',
    label: 'Střední',
    blurb: '1. +5 % · 2. stejně · 3. −20 %',
    speedScale: 1,
  },
  {
    id: 'hard',
    label: 'Těžká',
    blurb: 'Celé o 21 % těžší',
    speedScale: 1.21,
  },
  {
    id: 'superHard',
    label: 'Super těžká',
    blurb: 'O 40 % těžší než těžká',
    speedScale: 1.694,
  },
]

export function getDifficulty(id: string): DifficultyDef {
  return DIFFICULTIES.find((d) => d.id === id) ?? DIFFICULTIES[2]!
}
