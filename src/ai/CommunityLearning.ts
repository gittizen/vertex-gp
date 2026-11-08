import type { DifficultyId } from './Difficulty'
import type { VehicleKind } from '../track/TrackDefs'
import { speedCapMultFor } from '../vehicle/VehicleProfiles'
import { GAME_STORAGE_NS } from '../input/KeyBindings'

const SAMPLES_KEY = `${GAME_STORAGE_NS}.community-races-v1`
const MODEL_KEY = `${GAME_STORAGE_NS}.ai-learned-v1`
const SETTINGS_KEY = `${GAME_STORAGE_NS}.ai-learn-settings`

/** Jedna dojetá jízda člověka (jen po finish). */
export type CommunityRaceSample = {
  id: string
  player: string
  trackId: string
  vehicle: VehicleKind
  difficulty: DifficultyId
  /** Čas etapy / závodu (ms) */
  finishTimeMs: number
  /** Tempo 1 kola / etapy — stejná semantika jako targetPaceMs */
  paceMs: number
  bestLapMs: number
  totalLaps: number
  trackLength: number
  place: number
  isStage: boolean
  at: number
}

/** Agregovaný model pro AI (median tempo 2. jezdce). */
export type LearnedPaceCell = {
  trackId: string
  vehicle: VehicleKind
  difficulty: DifficultyId
  /** Doporučený targetPaceMs pro slot 2 (medium baseline se škáluje difficulty) */
  paceMs: number
  sampleCount: number
  medianMs: number
  p25Ms: number
  p75Ms: number
  updatedAt: number
}

export type LearnedPaceModel = {
  cells: LearnedPaceCell[]
  version: 1
}

export type LearnSettings = {
  /** Učit se z dojetých závodů (default on) */
  enabled: boolean
  /** Použít naučené tempo v AI (default on) */
  applyToAi: boolean
}

const DEFAULT_SETTINGS: LearnSettings = {
  enabled: true,
  applyToAi: true,
}

function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function loadLearnSettings(): LearnSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return { ...DEFAULT_SETTINGS }
    const p = JSON.parse(raw) as Partial<LearnSettings>
    return {
      enabled: p.enabled !== false,
      applyToAi: p.applyToAi !== false,
    }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveLearnSettings(s: LearnSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s))
}

export function loadCommunitySamples(): CommunityRaceSample[] {
  try {
    const raw = localStorage.getItem(SAMPLES_KEY)
    if (!raw) return []
    const p = JSON.parse(raw) as { samples?: CommunityRaceSample[] }
    return Array.isArray(p.samples) ? p.samples : []
  } catch {
    return []
  }
}

function saveCommunitySamples(samples: CommunityRaceSample[]): void {
  // Cap — ať localStorage nepraskne
  const trimmed = samples.length > 800 ? samples.slice(-800) : samples
  localStorage.setItem(SAMPLES_KEY, JSON.stringify({ samples: trimmed }))
}

export function loadLearnedModel(): LearnedPaceModel {
  try {
    const raw = localStorage.getItem(MODEL_KEY)
    if (!raw) return { cells: [], version: 1 }
    const p = JSON.parse(raw) as LearnedPaceModel
    return { cells: Array.isArray(p.cells) ? p.cells : [], version: 1 }
  } catch {
    return { cells: [], version: 1 }
  }
}

function saveLearnedModel(model: LearnedPaceModel): void {
  localStorage.setItem(MODEL_KEY, JSON.stringify(model))
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const i = (sorted.length - 1) * p
  const lo = Math.floor(i)
  const hi = Math.ceil(i)
  if (lo === hi) return sorted[lo]!
  return sorted[lo]! * (hi - i) + sorted[hi]! * (i - lo)
}

/** Přepočet na „medium street“ ekvivalent tempa (slot 2). */
function toMediumStreetPace(
  paceMs: number,
  difficulty: DifficultyId,
  vehicle: VehicleKind,
): number {
  // Difficulty: vyšší speedScale = rychlejší AI = kratší čas. Invertujeme.
  const scale =
    difficulty === 'superEasy'
      ? 0.56
      : difficulty === 'easy'
        ? 0.7
        : difficulty === 'hard'
          ? 1.21
          : difficulty === 'superHard'
            ? 1.694
            : 1
  // Čas na medium ≈ čas * speedScale (rychlejší obtížnost = kratší čas)
  let ms = paceMs * scale
  // Street baseline — rychlejší vůz = kratší čas → přepočet na street
  const cap = speedCapMultFor(vehicle) / Math.max(0.05, speedCapMultFor('street'))
  ms = ms * cap
  return ms
}

/** Po dojetí: ulož sample + přepočítej model. */
export function ingestFinishedRace(input: {
  player: string
  trackId: string
  vehicle: VehicleKind
  difficulty: DifficultyId
  finishTimeMs: number
  paceMs: number
  bestLapMs: number
  totalLaps: number
  trackLength: number
  place: number
  isStage: boolean
}): CommunityRaceSample | null {
  const settings = loadLearnSettings()
  if (!settings.enabled) return null
  if (!(input.paceMs > 500) || !(input.finishTimeMs > 500)) return null
  if (input.isStage === false && input.totalLaps < 1) return null

  const sample: CommunityRaceSample = {
    id: uid(),
    player: (input.player || 'Hráč').trim().slice(0, 24),
    trackId: input.trackId,
    vehicle: input.vehicle,
    difficulty: input.difficulty,
    finishTimeMs: input.finishTimeMs,
    paceMs: input.paceMs,
    bestLapMs: input.bestLapMs,
    totalLaps: input.totalLaps,
    trackLength: input.trackLength,
    place: input.place,
    isStage: input.isStage,
    at: Date.now(),
  }

  const samples = loadCommunitySamples()
  samples.push(sample)
  saveCommunitySamples(samples)
  rebuildLearnedModel()
  pushCommunityBundle()
  return sample
}

/** Přestav model z celého archivu (median per track×vehicle×difficulty). */
export function rebuildLearnedModel(): LearnedPaceModel {
  const samples = loadCommunitySamples()
  const groups = new Map<string, number[]>()

  for (const s of samples) {
    // Ukládáme buňky per track + vehicle + difficulty (raw pace)
    const key = `${s.trackId}|${s.vehicle}|${s.difficulty}`
    const arr = groups.get(key) ?? []
    arr.push(s.paceMs)
    groups.set(key, arr)
  }

  // Také street-normalized medium cells pro AI override na mapě
  const streetNorm = new Map<string, number[]>()
  for (const s of samples) {
    const norm = toMediumStreetPace(s.paceMs, s.difficulty, s.vehicle)
    if (!(norm > 500)) continue
    const key = s.trackId
    const arr = streetNorm.get(key) ?? []
    arr.push(norm)
    streetNorm.set(key, arr)
  }

  const cells: LearnedPaceCell[] = []
  for (const [key, times] of groups) {
    const [trackId, vehicle, difficulty] = key.split('|') as [
      string,
      VehicleKind,
      DifficultyId,
    ]
    const sorted = [...times].sort((a, b) => a - b)
    const medianMs = percentile(sorted, 0.5)
    cells.push({
      trackId,
      vehicle,
      difficulty,
      paceMs: Math.round(medianMs),
      sampleCount: sorted.length,
      medianMs: Math.round(medianMs),
      p25Ms: Math.round(percentile(sorted, 0.25)),
      p75Ms: Math.round(percentile(sorted, 0.75)),
      updatedAt: Date.now(),
    })
  }

  // Synthetic cells: track|street|normal from normalized pool (pro AiDriver)
  for (const [trackId, times] of streetNorm) {
    const sorted = [...times].sort((a, b) => a - b)
    if (sorted.length < 1) continue
    const medianMs = percentile(sorted, 0.5)
    const existing = cells.find(
      (c) => c.trackId === trackId && c.vehicle === 'street' && c.difficulty === 'normal',
    )
    if (existing && existing.sampleCount >= sorted.length) continue
    cells.push({
      trackId,
      vehicle: 'street',
      difficulty: 'normal',
      paceMs: Math.round(medianMs),
      sampleCount: sorted.length,
      medianMs: Math.round(medianMs),
      p25Ms: Math.round(percentile(sorted, 0.25)),
      p75Ms: Math.round(percentile(sorted, 0.75)),
      updatedAt: Date.now(),
    })
  }

  const model: LearnedPaceModel = { cells, version: 1 }
  saveLearnedModel(model)
  return model
}

/**
 * Runtime tempo pro AI (po dojetí aktualizované).
 * Preferuje naučené street/normal pro trať; jinak null → TrackDefs.targetPaceMs.
 */
export function learnedTargetPaceMs(trackId: string): number | null {
  const settings = loadLearnSettings()
  if (!settings.applyToAi) return null
  const model = loadLearnedModel()
  const cell = model.cells.find(
    (c) => c.trackId === trackId && c.vehicle === 'street' && c.difficulty === 'normal',
  )
  if (!cell || cell.sampleCount < 1 || !(cell.paceMs > 800)) return null
  return cell.paceMs
}

export type CommunityBundle = {
  samples: CommunityRaceSample[]
  model: LearnedPaceModel
  settings: LearnSettings
  exportedAt: number
}

export function exportCommunityBundle(): string {
  const bundle: CommunityBundle = {
    samples: loadCommunitySamples(),
    model: loadLearnedModel(),
    settings: loadLearnSettings(),
    exportedAt: Date.now(),
  }
  return JSON.stringify(bundle, null, 2)
}

/** Merge cizího balíku (sdílení mezi hráči) → rebuild. */
export function importCommunityBundle(json: string): { ok: boolean; added: number; error?: string } {
  try {
    const raw = JSON.parse(json) as Partial<CommunityBundle> | CommunityRaceSample[]
    let incoming: CommunityRaceSample[] = []
    if (Array.isArray(raw)) {
      incoming = raw
    } else if (raw && Array.isArray(raw.samples)) {
      incoming = raw.samples
    } else {
      return { ok: false, added: 0, error: 'bad-format' }
    }
    const existing = loadCommunitySamples()
    const ids = new Set(existing.map((s) => s.id))
    let added = 0
    for (const s of incoming) {
      if (!s || typeof s.paceMs !== 'number' || !s.trackId) continue
      if (s.id && ids.has(s.id)) continue
      const sample: CommunityRaceSample = {
        id: s.id || uid(),
        player: String(s.player || 'Hráč').slice(0, 24),
        trackId: String(s.trackId),
        vehicle: s.vehicle || 'street',
        difficulty: s.difficulty || 'normal',
        finishTimeMs: s.finishTimeMs || s.paceMs,
        paceMs: s.paceMs,
        bestLapMs: s.bestLapMs || 0,
        totalLaps: s.totalLaps || 1,
        trackLength: s.trackLength || 0,
        place: s.place || 1,
        isStage: Boolean(s.isStage),
        at: s.at || Date.now(),
      }
      existing.push(sample)
      ids.add(sample.id)
      added++
    }
    saveCommunitySamples(existing)
    rebuildLearnedModel()
    pushCommunityBundle()
    return { ok: true, added }
  } catch (e) {
    return { ok: false, added: 0, error: String(e) }
  }
}

/** Analytický přehled pro data-analytika (Filip). */
export type AnalyticsRow = {
  trackId: string
  vehicle: VehicleKind
  difficulty: DifficultyId
  n: number
  medianMs: number
  p25Ms: number
  p75Ms: number
  learnedPaceMs: number
  players: number
}

export function analyticsTable(): AnalyticsRow[] {
  const model = loadLearnedModel()
  const samples = loadCommunitySamples()
  return model.cells
    .map((c) => {
      const subset = samples.filter(
        (s) =>
          s.trackId === c.trackId &&
          s.vehicle === c.vehicle &&
          s.difficulty === c.difficulty,
      )
      const players = new Set(subset.map((s) => s.player)).size
      return {
        trackId: c.trackId,
        vehicle: c.vehicle,
        difficulty: c.difficulty,
        n: c.sampleCount,
        medianMs: c.medianMs,
        p25Ms: c.p25Ms,
        p75Ms: c.p75Ms,
        learnedPaceMs: c.paceMs,
        players,
      }
    })
    .sort((a, b) => a.trackId.localeCompare(b.trackId) || b.n - a.n)
}

function pushCommunityBundle(): void {
  void fetch('/__klec-community', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: exportCommunityBundle(),
  }).catch(() => {})
}

declare global {
  interface Window {
    __klecLearn?: {
      export: () => string
      import: (json: string) => { ok: boolean; added: number; error?: string }
      analytics: () => AnalyticsRow[]
      rebuild: () => LearnedPaceModel
      settings: () => LearnSettings
      setSettings: (s: Partial<LearnSettings>) => LearnSettings
    }
  }
}

export function installLearnDebugApi(): void {
  if (typeof window === 'undefined') return
  window.__klecLearn = {
    export: () => exportCommunityBundle(),
    import: (json) => importCommunityBundle(json),
    analytics: () => analyticsTable(),
    rebuild: () => rebuildLearnedModel(),
    settings: () => loadLearnSettings(),
    setSettings: (partial) => {
      const next = { ...loadLearnSettings(), ...partial }
      saveLearnSettings(next)
      return next
    },
  }
}
