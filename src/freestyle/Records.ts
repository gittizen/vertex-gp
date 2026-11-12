import { FREESTYLE_VEHICLE_KINDS, type VehicleKind } from '../track/TrackDefs'
import { GAME_STORAGE_NS } from '../input/KeyBindings'
import { pushCloudRecord, syncLocalRecordsToCloud } from './CloudRecords'

export type RecordsBoard = 'race' | 'freestyle'

function isFsVehicle(kind: VehicleKind): boolean {
  return (FREESTYLE_VEHICLE_KINDS as string[]).includes(kind)
}

const STORAGE_KEY = `${GAME_STORAGE_NS}.records`

/** Jména AI botů — nikdy nejdou do žebříčku / cloudu. */
const BOT_NAMES = new Set(['Nikola Beran', 'Petra Holá', 'Marek Diviš'])

export function isBotPlayerName(name: string): boolean {
  const n = (name || '').trim()
  return !n || BOT_NAMES.has(n)
}

/** Dev / autor — pryč ze všech žebříčků (Filip, Filip Khunt, …). */
export function isScrubbedLeaderboardName(name: string): boolean {
  const n = (name || '').trim().toLowerCase()
  if (!n) return false
  return n === 'filip' || n.startsWith('filip ')
}

function isHiddenLeaderboardName(name: string): boolean {
  return isBotPlayerName(name) || isScrubbedLeaderboardName(name)
}

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
  /** Počet kol při závodě (1 = stage / sandbox) */
  laps: number
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
    const entries = Array.isArray(parsed.entries) ? parsed.entries : []
    const cleaned = entries
      .map((e) => ({
        ...e,
        laps: Math.max(1, Math.min(69, Math.round(Number(e.laps) || 1))),
      }))
      .filter((e) => !isHiddenLeaderboardName(e.player))
    // Jednorázově vyčisti lokál od Filip / botů.
    if (cleaned.length !== entries.length) {
      saveStore({ entries: cleaned })
    }
    return { entries: cleaned }
  } catch {
    return { entries: [] }
  }
}

function saveStore(store: RecordsStore): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
}

function sameSlot(a: RecordEntry, b: {
  player: string
  trackId: string
  vehicle: VehicleKind
  laps: number
  immortal: boolean
}): boolean {
  return (
    a.player === b.player &&
    a.trackId === b.trackId &&
    a.vehicle === b.vehicle &&
    a.laps === b.laps &&
    !!a.immortal === b.immortal
  )
}

export function submitRaceRecord(input: {
  player: string
  trackId: string
  vehicle: VehicleKind
  timeMs: number
  fsScore: number
  trickPts: number
  laps?: number
  immortal?: boolean
}): RecordEntry | null {
  const player = (input.player || 'Hráč').trim().slice(0, 24)
  // Boti / Filip / prázdné — neukládat ani nesdílet
  if (isHiddenLeaderboardName(player)) return null

  const immortal = !!input.immortal
  const laps = Math.max(1, Math.min(69, Math.round(input.laps ?? 1)))
  const store = loadStore()
  const existing = store.entries.find((e) =>
    sameSlot(e, { player, trackId: input.trackId, vehicle: input.vehicle, laps, immortal }),
  )
  if (existing) {
    if (input.timeMs > 0 && (existing.bestTimeMs <= 0 || input.timeMs < existing.bestTimeMs)) {
      existing.bestTimeMs = input.timeMs
    }
    if (input.fsScore > existing.bestFsScore) existing.bestFsScore = input.fsScore
    if (input.trickPts > existing.bestTrickPts) existing.bestTrickPts = input.trickPts
    existing.laps = laps
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
    laps,
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
  let list = loadStore().entries.filter((e) => !isHiddenLeaderboardName(e.player))
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

/** Všechny záznamy (pro export kalibrace / sync). */
export function allRecords(): RecordEntry[] {
  return loadStore().entries.filter((e) => !isHiddenLeaderboardName(e.player)).slice()
}

/** Pošli lokální rekordy do světa (bez botů). */
export function shareLocalRecordsWithWorld(): void {
  void syncLocalRecordsToCloud(allRecords())
}
