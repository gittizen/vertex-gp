import { GAME_STORAGE_NS } from '../input/KeyBindings'
import { TRACKS } from '../track/TrackDefs'
import { placePoints } from '../freestyle/FreestyleTricks'

/** Tratě šampionátu — bez Plácku. */
export const CHAMPIONSHIP_TRACKS: string[] = TRACKS.filter((t) => !t.sandbox).map((t) => t.id)

export type ChampRoundResult = {
  trackId: string
  place: number
  pts: number
}

export type ChampionshipState = {
  round: number
  results: ChampRoundResult[]
  /** Součet bodů hráče */
  points: number
  done: boolean
}

const STORAGE_KEY = `${GAME_STORAGE_NS}.championship`

export const DEFAULT_CHAMPIONSHIP: ChampionshipState = {
  round: 0,
  results: [],
  points: 0,
  done: false,
}

export function loadChampionship(): ChampionshipState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_CHAMPIONSHIP, results: [] }
    const p = JSON.parse(raw) as Partial<ChampionshipState>
    return {
      round: typeof p.round === 'number' ? Math.max(0, Math.min(CHAMPIONSHIP_TRACKS.length, p.round)) : 0,
      results: Array.isArray(p.results) ? p.results : [],
      points: typeof p.points === 'number' ? p.points : 0,
      done: Boolean(p.done),
    }
  } catch {
    return { ...DEFAULT_CHAMPIONSHIP, results: [] }
  }
}

export function saveChampionship(state: ChampionshipState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

export function resetChampionship(): ChampionshipState {
  const s = { ...DEFAULT_CHAMPIONSHIP, results: [] as ChampRoundResult[] }
  saveChampionship(s)
  return s
}

export function championshipTrackId(state: ChampionshipState = loadChampionship()): string | null {
  if (state.done || state.round >= CHAMPIONSHIP_TRACKS.length) return null
  return CHAMPIONSHIP_TRACKS[state.round] ?? null
}

export function recordChampionshipPlace(place: number): ChampionshipState {
  const state = loadChampionship()
  if (state.done) return state
  const trackId = CHAMPIONSHIP_TRACKS[state.round]
  if (!trackId) {
    state.done = true
    saveChampionship(state)
    return state
  }
  const pts = placePoints(place)
  state.results.push({ trackId, place, pts })
  state.points += pts
  state.round += 1
  if (state.round >= CHAMPIONSHIP_TRACKS.length) state.done = true
  saveChampionship(state)
  return state
}

export function championshipProgressLabel(state: ChampionshipState = loadChampionship()): string {
  const total = CHAMPIONSHIP_TRACKS.length
  if (state.done) return `${total}/${total}`
  return `${Math.min(state.round + 1, total)}/${total}`
}
