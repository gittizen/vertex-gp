import type { VehicleKind } from '../track/TrackDefs'
import { CATALOG_MAX_KMH, profileForKind } from './VehicleProfiles'
import {
  DEFAULT_PLAYER_TUNING,
  normalizeTuning,
  tuningMult,
  type PlayerTuningValues,
} from '../tuning/PlayerTuning'

export type StatKey = 'speed' | 'handling' | 'grip' | 'brakes' | 'accel'

export type VehicleStatBars = Record<StatKey, number>

const STAT_KEYS: StatKey[] = ['speed', 'handling', 'grip', 'brakes', 'accel']

/** Základní pruhy nechávají rezervu na tuning (±15 %) — min/max tabulky nejsou „plný strop“. */
const BAR_FLOOR = 2.5
const BAR_SPAN = 6 // → max ≈ 8.5 při default tuningu

function clampStat(n: number): number {
  if (!Number.isFinite(n)) return 1
  return Math.max(1, Math.min(10, Math.round(n * 10) / 10))
}

/** Surové metriky z default profilu — pro normalizaci napříč všemi peklostroji. */
function rawMetrics(kind: VehicleKind): {
  speed: number
  handling: number
  grip: number
  brakes: number
  accel: number
} {
  if (kind === 'scooter' || kind === 'rocketScooter') {
    return { speed: 0, handling: 0, grip: 0, brakes: 0, accel: 0 }
  }
  const p = profileForKind(kind, DEFAULT_PLAYER_TUNING)
  const mass = Math.max(0.4, p.mass ?? 1)
  const power = p.power ?? 40
  const steer = p.steerResp ?? 1
  const grip = p.grip ?? 1
  const brakes = p.brakeForce ?? 70
  return {
    speed: CATALOG_MAX_KMH[kind] ?? 200,
    handling: steer,
    grip,
    brakes,
    accel: power / mass,
  }
}

let cachedBase: Record<VehicleKind, VehicleStatBars> | null = null

function buildBase(): Record<VehicleKind, VehicleStatBars> {
  const kinds = Object.keys(CATALOG_MAX_KMH) as VehicleKind[]
  const raws = kinds.map((k) => ({ k, m: rawMetrics(k) }))
  const maxOf = (sel: (m: (typeof raws)[0]['m']) => number) =>
    Math.max(
      0.001,
      ...raws.filter((r) => r.k !== 'scooter' && r.k !== 'rocketScooter').map((r) => sel(r.m)),
    )

  const maxSpeed = maxOf((m) => m.speed)
  const maxHand = maxOf((m) => m.handling)
  const maxGrip = maxOf((m) => m.grip)
  const maxBrakes = maxOf((m) => m.brakes)
  const maxAccel = maxOf((m) => m.accel)

  const out = {} as Record<VehicleKind, VehicleStatBars>
  for (const { k, m } of raws) {
    if (k === 'scooter' || k === 'rocketScooter') {
      out[k] = { speed: 1, handling: 1, grip: 1, brakes: 1, accel: 1 }
      continue
    }
    out[k] = {
      speed: clampStat(BAR_FLOOR + (m.speed / maxSpeed) * BAR_SPAN),
      handling: clampStat(BAR_FLOOR + (m.handling / maxHand) * BAR_SPAN),
      grip: clampStat(BAR_FLOOR + (m.grip / maxGrip) * BAR_SPAN),
      brakes: clampStat(BAR_FLOOR + (m.brakes / maxBrakes) * BAR_SPAN),
      accel: clampStat(BAR_FLOOR + (m.accel / maxAccel) * BAR_SPAN),
    }
  }
  return out
}

function baseBars(kind: VehicleKind): VehicleStatBars {
  if (!cachedBase) cachedBase = buildBase()
  return cachedBase[kind] ?? { speed: 5, handling: 5, grip: 5, brakes: 5, accel: 5 }
}

/** Stats 1–10 — základ s headroomem; volitelně × aktuální tuning (±15 %). */
export function vehicleStatBars(
  kind: VehicleKind,
  tuning: PlayerTuningValues = DEFAULT_PLAYER_TUNING,
): VehicleStatBars {
  const base = baseBars(kind)
  if (kind === 'scooter' || kind === 'rocketScooter') return base

  const v = normalizeTuning(tuning)
  const pM = tuningMult(v.power)
  const bM = tuningMult(v.brakes)
  const gM = tuningMult(v.grip)
  const sM = tuningMult(v.steer)
  const lM = tuningMult(v.lightness)
  const accelM = Math.sqrt(pM * lM)

  return {
    speed: clampStat(base.speed * pM),
    handling: clampStat(base.handling * sM),
    grip: clampStat(base.grip * gM),
    brakes: clampStat(base.brakes * bM),
    accel: clampStat(base.accel * accelM),
  }
}

export function statKeys(): StatKey[] {
  return [...STAT_KEYS]
}

/** HTML pruhy (fill), ne čísla. */
export function statsBarsHtml(
  kind: VehicleKind,
  label: (key: StatKey) => string,
  tuning: PlayerTuningValues = DEFAULT_PLAYER_TUNING,
): string {
  const bars = vehicleStatBars(kind, tuning)
  return STAT_KEYS.map((key) => {
    const v = bars[key]
    const pct = Math.round((v / 10) * 100)
    return `<div class="veh-stat">
      <span class="veh-stat-label">${label(key)}</span>
      <div class="veh-stat-track" aria-hidden="true"><div class="veh-stat-fill" style="width:${pct}%"></div></div>
    </div>`
  }).join('')
}
