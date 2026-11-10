import { FREESTYLE_VEHICLE_KINDS, type VehicleKind } from '../track/TrackDefs'
import { GAME_STORAGE_NS } from '../input/KeyBindings'
import { pushCloudRecord } from './CloudRecords'

export type RecordsBoard = 'race' | 'freestyle'

function isFsVehicle(kind: VehicleKind): boolean {
  return (FREESTYLE_VEHICLE_KINDS as string[]).includes(kind)
}

const STORAGE_KEY = `${GAME_STORAGE_NS}.records`

export type RecordEntry = {
  player: string
  trackId: string
  vehicle: VehicleKind
  /** Nejlepší čas závodu (ms), nižší = lepší */
  bestTimeMs: number
  /** Nejvyšší freestyle skóre (triky + umístění) */
  bestFsScore: number
  /** Nejvíc bodů jen z triků */
  bestTrickPts: number
  at: number
  /** Solo nesmrtelnost — ve žebříčku s duchem */
  immortal?: boolean
}

export type RecordsStore = {
  entries: RecordEntry[]
}

function loadStore(): RecordsStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { entries: [] }
    const parsed = JSON.parse(raw) as RecordsStore
    return { entries: Array.isArray(parsed.entries) ? parsed.entries : [] }
  } catch {
    return { entries: [] }
  }
}

function saveStore(store: RecordsStore): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
}

export function submitRaceRecord(input: {
  player: string
  trackId: string
  vehicle: VehicleKind
  timeMs: number
  fsScore: number
  trickPts: number
  immortal?: boolean
}): RecordEntry {
  const store = loadStore()
  const player = (input.player || 'Hráč').trim().slice(0, 24)
  const immortal = !!input.immortal
  const existing = store.entries.find(
    (e) =>
      e.player === player &&
      e.trackId === input.trackId &&
      e.vehicle === input.vehicle &&
      !!e.immortal === immortal,
  )
  if (existing) {
    if (input.timeMs > 0 && (existing.bestTimeMs <= 0 || input.timeMs < existing.bestTimeMs)) {
      existing.bestTimeMs = input.timeMs
    }
    if (input.fsScore > existing.bestFsScore) existing.bestFsScore = input.fsScore
    if (input.trickPts > existing.bestTrickPts) existing.bestTrickPts = input.trickPts
    existing.at = Date.now()
    existing.immortal = immortal
    saveStore(store)
    void pushCloudRecord(existing)
    return existing
  }
  const entry: RecordEntry = {
    player,
    trackId: input.trackId,
    vehicle: input.vehicle,
    bestTimeMs: input.timeMs > 0 ? input.timeMs : 0,
    bestFsScore: input.fsScore,
    bestTrickPts: input.trickPts,
    at: Date.now(),
    immortal,
  }
  store.entries.push(entry)
  saveStore(store)
  void pushCloudRecord(entry)
  return entry
}

export function recordsFor(
  trackId?: string,
  vehicle?: VehicleKind,
  board: RecordsBoard = 'race',
): RecordEntry[] {
  let list = loadStore().entries
  if (board === 'freestyle') list = list.filter((e) => isFsVehicle(e.vehicle))
  else list = list.filter((e) => !isFsVehicle(e.vehicle))
  if (trackId) list = list.filter((e) => e.trackId === trackId)
  if (vehicle) list = list.filter((e) => e.vehicle === vehicle)
  return [...list].sort((a, b) => {
    if (board === 'freestyle') {
      if (b.bestFsScore !== a.bestFsScore) return b.bestFsScore - a.bestFsScore
      if (b.bestTrickPts !== a.bestTrickPts) return b.bestTrickPts - a.bestTrickPts
    }
    if (a.bestTimeMs <= 0) return 1
    if (b.bestTimeMs <= 0) return -1
    return a.bestTimeMs - b.bestTimeMs
  })
}

export function topRecords(limit = 20, board: RecordsBoard = 'race'): RecordEntry[] {
  return recordsFor(undefined, undefined, board).slice(0, limit)
}

/** Všechny záznamy (pro export kalibrace). */
export function allRecords(): RecordEntry[] {
  return loadStore().entries.slice()
}
