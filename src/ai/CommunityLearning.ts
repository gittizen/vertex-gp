import type { DifficultyId } from './Difficulty'
import type { VehicleKind } from '../track/TrackDefs'
import { speedCapMultFor } from '../vehicle/VehicleProfiles'
import {
  DEFAULT_PLAYER_TUNING,
  tuningPaceFactor,
  type PlayerTuningValues,
} from '../tuning/PlayerTuning'
import { GAME_STORAGE_NS } from '../input/KeyBindings'
import { pullCloudPaceModel, pushCloudPaceSample } from './CloudPace'

const SAMPLES_KEY = `${GAME_STORAGE_NS}.community-races-v1`
const MODEL_KEY = `${GAME_STORAGE_NS}.ai-learned-v1`
const SETTINGS_KEY = `${GAME_STORAGE_NS}.ai-learn-settings`
const CLIENT_KEY = `${GAME_STORAGE_NS}.learn-client-id`
const RATE_KEY = `${GAME_STORAGE_NS}.learn-rate-v1`

/** Max změna naučeného tempa vs design / předchozí (±5 %). */
export const LEARN_MAX_DELTA = 0.05
const LOCAL_RATE_MS = 20_000

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
  /** paceMs přepočtené na neutral tuning (pro model) */
  paceNeutralMs?: number
  tuneFactor?: number
  capScale?: number
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
  /** Učit se z dojetých závodů lokálně (default on) */
  enabled: boolean
  /** Posílat anonymní tempo na cloud (opt-in telemetry) */
  upload: boolean
  /** Použít naučené tempo v AI (default on) */
  applyToAi: boolean
}

const DEFAULT_SETTINGS: LearnSettings = {
  enabled: true,
  upload: true,
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
      upload: p.upload !== false,
      applyToAi: p.applyToAi !== false,
    }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function learnClientId(): string {
  try {
    const existing = localStorage.getItem(CLIENT_KEY)
    if (existing) return existing
    const id = `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
    localStorage.setItem(CLIENT_KEY, id)
    return id
  } catch {
    return 'anon'
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

/** IQR winsorize — outliery (DC / AFK / cheat lap) nekazí median. */
function robustTimes(times: number[]): number[] {
  if (times.length < 4) return [...times].sort((a, b) => a - b)
  const sorted = [...times].sort((a, b) => a - b)
  const q1 = percentile(sorted, 0.25)
  const q3 = percentile(sorted, 0.75)
  const iqr = Math.max(1, q3 - q1)
  const lo = q1 - 1.5 * iqr
  const hi = q3 + 1.5 * iqr
  return sorted.map((v) => Math.min(hi, Math.max(lo, v)))
}

/** Recent-biased median: novější jízdy váží víc (senior analytik blend). */
function weightedMedian(samples: { ms: number; at: number }[]): number {
  if (!samples.length) return 0
  if (samples.length === 1) return samples[0]!.ms
  const now = Date.now()
  const day = 86_400_000
  const weighted: number[] = []
  for (const s of samples) {
    const ageDays = Math.max(0, (now - s.at) / day)
    const w = Math.max(1, Math.round(4 * Math.exp(-ageDays / 21)))
    const clipped = s.ms
    for (let i = 0; i < w; i++) weighted.push(clipped)
  }
  const robust = robustTimes(weighted)
  return percentile(robust, 0.5)
}

/** Přepočet na „medium street + neutral tuning“ ekvivalent tempa (slot 2). */
function toMediumStreetPace(
  paceMs: number,
  difficulty: DifficultyId,
  vehicle: VehicleKind,
  tuneFactor = 1,
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
  // Max tuning by neměl zrychlit medium AI — převod na stock
  ms = ms * Math.max(0.78, Math.min(1.28, tuneFactor))
  return ms
}

function clampPace(ms: number, anchorMs: number | null | undefined): number {
  if (!(ms > 800)) return ms
  if (!(anchorMs && anchorMs > 800)) return ms
  const lo = anchorMs * (1 - LEARN_MAX_DELTA)
  const hi = anchorMs * (1 + LEARN_MAX_DELTA)
  return Math.min(hi, Math.max(lo, ms))
}

function localRateOk(trackId: string): boolean {
  try {
    const raw = localStorage.getItem(RATE_KEY)
    const map = raw ? (JSON.parse(raw) as Record<string, number>) : {}
    const last = Number(map[trackId] || 0)
    const now = Date.now()
    if (now - last < LOCAL_RATE_MS) return false
    map[trackId] = now
    localStorage.setItem(RATE_KEY, JSON.stringify(map))
    return true
  } catch {
    return true
  }
}

/** Po dojetí: ulož sample + přepočítej model. Nevolat z multiplayeru. */
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
  tuning?: PlayerTuningValues
  /** Designový targetPaceMs mapy — clamp Δ */
  designPaceMs?: number
}): CommunityRaceSample | null {
  const settings = loadLearnSettings()
  if (!settings.enabled) return null
  if (!(input.paceMs > 500) || !(input.finishTimeMs > 500)) return null
  if (input.isStage === false && input.totalLaps < 1) return null
  if (input.vehicle === 'scooter') return null
  if (!localRateOk(input.trackId)) return null

  const tune = input.tuning ?? DEFAULT_PLAYER_TUNING
  const tuneFactor = tuningPaceFactor(tune)
  const capScale = speedCapMultFor(input.vehicle) / Math.max(0.05, speedCapMultFor('street'))
  const paceNeutralMs = Math.round(input.paceMs * tuneFactor)

  const sample: CommunityRaceSample = {
    id: uid(),
    player: (input.player || 'Hráč').trim().slice(0, 24),
    trackId: input.trackId,
    vehicle: input.vehicle,
    difficulty: input.difficulty,
    finishTimeMs: input.finishTimeMs,
    paceMs: input.paceMs,
    paceNeutralMs,
    tuneFactor,
    capScale,
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
  rebuildLearnedModel(input.designPaceMs ? { [input.trackId]: input.designPaceMs } : undefined)
  pushCommunityBundle()

  if (settings.upload) {
    void pushCloudPaceSample(sample, learnClientId()).then((ok) => {
      if (ok) void syncCloudPaceModel()
    })
  }
  return sample
}

/** Přestav model z celého archivu (robustní median + recent weight). */
export function rebuildLearnedModel(designByTrack?: Record<string, number>): LearnedPaceModel {
  const prev = loadLearnedModel()
  const samples = loadCommunitySamples()
  const groups = new Map<string, { ms: number; at: number }[]>()

  for (const s of samples) {
    // Ukládáme buňky per track + vehicle + difficulty (neutral pace)
    const key = `${s.trackId}|${s.vehicle}|${s.difficulty}`
    const arr = groups.get(key) ?? []
    arr.push({ ms: s.paceNeutralMs ?? s.paceMs, at: s.at })
    groups.set(key, arr)
  }

  // Také street-normalized medium cells pro AI override na mapě
  const streetNorm = new Map<string, { ms: number; at: number }[]>()
  for (const s of samples) {
    const base = s.paceNeutralMs ?? s.paceMs
    const norm = toMediumStreetPace(base, s.difficulty, s.vehicle, 1)
    if (!(norm > 500)) continue
    const key = s.trackId
    const arr = streetNorm.get(key) ?? []
    arr.push({ ms: norm, at: s.at })
    streetNorm.set(key, arr)
  }

  const cells: LearnedPaceCell[] = []
  for (const [key, rows] of groups) {
    const [trackId, vehicle, difficulty] = key.split('|') as [
      string,
      VehicleKind,
      DifficultyId,
    ]
    const times = rows.map((r) => r.ms)
    const robust = robustTimes(times)
    const medianMs = weightedMedian(rows)
    cells.push({
      trackId,
      vehicle,
      difficulty,
      paceMs: Math.round(medianMs),
      sampleCount: rows.length,
      medianMs: Math.round(medianMs),
      p25Ms: Math.round(percentile(robust, 0.25)),
      p75Ms: Math.round(percentile(robust, 0.75)),
      updatedAt: Date.now(),
    })
  }

  // Synthetic cells: track|street|normal from normalized pool (pro AiDriver)
  for (const [trackId, rows] of streetNorm) {
    if (rows.length < 1) continue
    const times = rows.map((r) => r.ms)
    const robust = robustTimes(times)
    let medianMs = weightedMedian(rows)
    const prevCell = prev.cells.find(
      (c) => c.trackId === trackId && c.vehicle === 'street' && c.difficulty === 'normal',
    )
    const design = designByTrack?.[trackId] ?? prevCell?.paceMs
    medianMs = clampPace(medianMs, design)
    const existing = cells.find(
      (c) => c.trackId === trackId && c.vehicle === 'street' && c.difficulty === 'normal',
    )
    if (existing && existing.sampleCount >= rows.length) continue
    cells.push({
      trackId,
      vehicle: 'street',
      difficulty: 'normal',
      paceMs: Math.round(medianMs),
      sampleCount: rows.length,
      medianMs: Math.round(medianMs),
      p25Ms: Math.round(percentile(robust, 0.25)),
      p75Ms: Math.round(percentile(robust, 0.75)),
      updatedAt: Date.now(),
    })
  }

  const model: LearnedPaceModel = { cells, version: 1 }
  saveLearnedModel(model)
  return model
}

/** Stáhni cloud model a slouč (clamp Δ). Volat při startu / menu. */
export async function syncCloudPaceModel(): Promise<boolean> {
  const cloud = await pullCloudPaceModel()
  if (!cloud || !cloud.cells.length) return false
  const local = loadLearnedModel()
  const byKey = new Map(local.cells.map((c) => [`${c.trackId}|${c.vehicle}|${c.difficulty}`, c]))
  for (const c of cloud.cells) {
    if (!(c.paceMs > 800)) continue
    const key = `${c.trackId}|${c.vehicle}|${c.difficulty}`
    const prev = byKey.get(key)
    const paced = Math.round(clampPace(c.paceMs, prev?.paceMs ?? c.paceMs))
    byKey.set(key, {
      ...c,
      paceMs: paced,
      medianMs: paced,
      updatedAt: Date.now(),
    })
  }
  saveLearnedModel({ cells: [...byKey.values()], version: 1 })
  return true
}

/**
 * Runtime tempo pro AI (po dojetí aktualizované).
 * Preferuje naučené street/normal pro trať; blend s defaultem mapy při málo samplech.
 */
export function learnedTargetPaceMs(trackId: string, fallbackMs?: number): number | null {
  const settings = loadLearnSettings()
  if (!settings.applyToAi) return null
  const model = loadLearnedModel()
  const cell = model.cells.find(
    (c) => c.trackId === trackId && c.vehicle === 'street' && c.difficulty === 'normal',
  )
  if (!cell || cell.sampleCount < 1 || !(cell.paceMs > 800)) return null
  // Málo dat → jemně mícháme s designovým targetPaceMs (ne skok po 1 jízdě)
  const fb = fallbackMs && fallbackMs > 800 ? fallbackMs : null
  let ms = cell.paceMs
  if (fb && cell.sampleCount < 5) {
    const w = cell.sampleCount / 5
    ms = cell.paceMs * w + fb * (1 - w)
  }
  // Tvrdý strop změny vs design mapy
  if (fb) ms = clampPace(ms, fb)
  return Math.round(ms)
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
