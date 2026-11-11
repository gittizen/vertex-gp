export type DifficultyId = 'superEasy' | 'easy' | 'normal' | 'hard' | 'superHard'

export type DifficultyDef = {
  id: DifficultyId
  label: string
  blurb: string
  /** 1 = střední */
  speedScale: number
}

/**
 * Tempo AI vůči střední. Strop = katalogové max vozidla (AiDriver hardCap),
 * takže těžké stupně netlačí nad fyziku peklostroje — jen častěji jezdí blízko stropu.
 * Super těžká dřív ~1.69 často narazila do capu a splývala s těžkou.
 */
export const DIFFICULTIES: DifficultyDef[] = [
  {
    id: 'superEasy',
    label: 'Super lehká',
    blurb: 'AI ~40 % pomalejší než střední',
    speedScale: 0.6,
  },
  {
    id: 'easy',
    label: 'Lehká',
    blurb: 'AI o 25 % pomalejší než střední',
    speedScale: 0.75,
  },
  {
    id: 'normal',
    label: 'Střední',
    blurb: '1. +10 % · 2. tvůj čas · 3. −20 %',
    speedScale: 1,
  },
  {
    id: 'hard',
    label: 'Těžká',
    blurb: 'AI o 15 % rychlejší než střední',
    speedScale: 1.15,
  },
  {
    id: 'superHard',
    label: 'Super těžká',
    blurb: 'AI o 32 % rychlejší než střední',
    speedScale: 1.32,
  },
]

export function getDifficulty(id: string): DifficultyDef {
  return DIFFICULTIES.find((d) => d.id === id) ?? DIFFICULTIES[2]!
}
