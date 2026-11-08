import { GAME_STORAGE_NS } from '../input/KeyBindings'

/** Solo soutěže (ne multiplayer). */
export type CompetitionId =
  | 'none'
  | 'championship'
  | 'timeAttack'
  | 'trickHunt'
  | 'cleanRun'
  | 'paceGhost'
  | 'sprintDash'
  | 'driftScore'

export type CompetitionSettingsValues = {
  id: CompetitionId
}

const STORAGE_KEY = `${GAME_STORAGE_NS}.competition`

export const COMPETITIONS: { id: CompetitionId }[] = [
  { id: 'none' },
  { id: 'championship' },
  { id: 'timeAttack' },
  { id: 'trickHunt' },
  { id: 'cleanRun' },
  { id: 'paceGhost' },
  { id: 'sprintDash' },
  { id: 'driftScore' },
]

export const DEFAULT_COMPETITION: CompetitionSettingsValues = {
  id: 'none',
}

export function loadCompetitionSettings(): CompetitionSettingsValues {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_COMPETITION }
    const parsed = JSON.parse(raw) as Partial<CompetitionSettingsValues>
    const id = COMPETITIONS.some((c) => c.id === parsed.id)
      ? (parsed.id as CompetitionId)
      : 'none'
    return { id }
  } catch {
    return { ...DEFAULT_COMPETITION }
  }
}

export function saveCompetitionSettings(vals: CompetitionSettingsValues): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(vals))
}
