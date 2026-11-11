import { GAME_STORAGE_NS } from '../input/KeyBindings'

/** Solo soutěže (ne multiplayer). */
export type CompetitionId =
  | 'none'
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

/** Soutěže zrušeny — vždy klasický závod. */
export function loadCompetitionSettings(): CompetitionSettingsValues {
  return { ...DEFAULT_COMPETITION }
}

export function saveCompetitionSettings(_vals?: CompetitionSettingsValues): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_COMPETITION))
}
