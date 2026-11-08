import type { DifficultyId } from './Difficulty'
import type { VehicleKind } from '../track/TrackDefs'
import { speedCapMultFor } from '../vehicle/VehicleProfiles'

const STORAGE_KEY = 'klec-gp-pace-cal-v1'

/** Jedna čistá jízda pro kalibraci AI tempa. */
export type PaceSample = {
  trackId: string
  vehicle: VehicleKind
  difficulty: DifficultyId
  /** Nejlepší kolo (loop) nebo čas etapy (stage). */
  paceMs: number
  finishTimeMs: number
  bestLapMs: number
  totalLaps: number
  trackLength: number
  /** m/s z paceMs přes délku tratě (1 kolo / 1 etapa). */
  avgSpeed: number
  isStage: boolean
  isSandbox: boolean
  at: number
}

export type PaceCalStore = {
  samples: PaceSample[]
}

/**
 * Střední obtížnost = hráčovo tempo.
 * Slot AI: 1. +5 %, 2. 100 %, 3. −20 % (už v AiDriver).
 * Ostatní obtížnosti = speedScale z Difficulty.ts.
 *
 * Per-peklostroj: tempo × (cap(kind) / cap(street)) —
 * RaceRoom / GT styl: baseline z jedné třídy, zbytek přes poměr stropů.
 * @see https://www.simwiki.net/wiki/Automatic_AI_-_Performance-based_Dynamic_AI_Scaling
 * @see https://www.gamedeveloper.com/design/how-forza-s-drivatar-actually-works
 */
/** lead = 10 % rychlejší než hráčův čas (čas ×0.9) */
export const PACE_SLOT = { lead: 1 / 0.9, mid: 1.0, pack: 0.8 } as const
export const PACE_BOOST = 4 * 1.1 * 1.1

function loadStore(): PaceCalStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { samples: [] }
    const p = JSON.parse(raw) as PaceCalStore
    return { samples: Array.isArray(p.samples) ? p.samples : [] }
  } catch {
    return { samples: [] }
  }
}

function saveStore(store: PaceCalStore): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
}

export function recordPaceSample(sample: PaceSample): PaceSample {
  const store = loadStore()
  // Stejná trať + stejný vůz + střední → nech jen rychlejší tempo
  const idx = store.samples.findIndex(
    (s) =>
      s.trackId === sample.trackId &&
      s.vehicle === sample.vehicle &&
      s.difficulty === sample.difficulty,
  )
  if (idx >= 0) {
    const prev = store.samples[idx]!
    if (sample.paceMs > 0 && (prev.paceMs <= 0 || sample.paceMs < prev.paceMs)) {
      store.samples[idx] = sample
    }
  } else {
    store.samples.push(sample)
  }
  saveStore(store)
  console.info('[Klec PaceCal]', sample)
  // Dev: ulož do workspace (vite /__klec-pace)
  void fetch('/__klec-pace', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(store),
  }).catch(() => {})
  return sample
}

/** Pošli celý localStorage dump do workspace (z Chrome konzole). */
export function pushPaceToWorkspace(): Promise<boolean> {
  const body = exportPaceJson()
  return fetch('/__klec-pace', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  })
    .then((r) => r.ok)
    .catch(() => false)
}

export function getPaceSamples(): PaceSample[] {
  return loadStore().samples.slice()
}

export function clearPaceSamples(): void {
  saveStore({ samples: [] })
}

/** Odhad aiSpeedMult pro street na mapě (slot mid = hráč). */
export function estimateStreetAiMult(avgSpeed: number, eqSpeed: number): number {
  const v = Math.max(8, avgSpeed)
  const eq = Math.max(8, eqSpeed)
  const blend = eq * 0.55 + v * 0.45
  return v / Math.max(0.01, PACE_BOOST * blend)
}

/** TrackDefs.aiSpeedMult uložený vůči defaultnímu vozidlu mapy. */
export function streetMultToStored(
  streetMult: number,
  trackDefault: VehicleKind,
): number {
  return streetMult * speedCapMultFor(trackDefault) / Math.max(0.05, speedCapMultFor('street'))
}

export function exportPaceJson(): string {
  return JSON.stringify(loadStore(), null, 2)
}

declare global {
  interface Window {
    __klecPace?: {
      list: () => PaceSample[]
      export: () => string
      clear: () => void
      push: () => Promise<boolean>
    }
  }
}

export function installPaceDebugApi(): void {
  if (typeof window === 'undefined') return
  window.__klecPace = {
    list: () => getPaceSamples(),
    export: () => exportPaceJson(),
    clear: () => clearPaceSamples(),
    push: () => pushPaceToWorkspace(),
  }
}
