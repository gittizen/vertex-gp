export type DifficultyId = 'easy' | 'normal' | 'hard'

export type DifficultyDef = {
  id: DifficultyId
  label: string
  blurb: string
  /** 1 = stejná rychlost na rovince jako hráč */
  speedScale: number
}

export const DIFFICULTIES: DifficultyDef[] = [
  {
    id: 'easy',
    label: 'Lehká',
    blurb: 'Soupeři o kousek pomalejší',
    speedScale: 0.94,
  },
  {
    id: 'normal',
    label: 'Střední',
    blurb: 'Stejné tempo jako ty',
    speedScale: 1,
  },
  {
    id: 'hard',
    label: 'Těžká',
    blurb: 'Soupeři jedou naplno',
    speedScale: 1.06,
  },
]

export function getDifficulty(id: string): DifficultyDef {
  return DIFFICULTIES.find((d) => d.id === id) ?? DIFFICULTIES[1]
}
