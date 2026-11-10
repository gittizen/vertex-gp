import { t } from '../i18n/i18n'

export type PlayerTuningValues = {
  power: number
  brakes: number
  downforce: number
  grip: number
  steer: number
  lightness: number
}

/** Stupnice slideru 0–10 (10 kroků od nuly). */
export const TUNING_MAX = 10
/** Neutrál uprostřed — 0 = −15 %, 10 = +15 %. */
export const TUNING_NEUTRAL = 5
/** Rozpočet = 6× neutrál; vytáhneš jedno jen když jiné snížíš. */
export const TUNING_BUDGET = TUNING_NEUTRAL * 6

export const DEFAULT_PLAYER_TUNING: PlayerTuningValues = {
  power: TUNING_NEUTRAL,
  brakes: TUNING_NEUTRAL,
  downforce: TUNING_NEUTRAL,
  grip: TUNING_NEUTRAL,
  steer: TUNING_NEUTRAL,
  lightness: TUNING_NEUTRAL,
}

const TUNE_KEYS = Object.keys(DEFAULT_PLAYER_TUNING) as (keyof PlayerTuningValues)[]

/** 0 → 0.85, 5 → 1, 10 → 1.15 (±15 %, celkové okno 30 %). */
export function tuningMult(level: number): number {
  const v = Math.max(0, Math.min(TUNING_MAX, level))
  return 1 + (v - TUNING_NEUTRAL) * 0.03
}

export function tuningSum(vals: PlayerTuningValues): number {
  return vals.power + vals.brakes + vals.downforce + vals.grip + vals.steer + vals.lightness
}

/** Migrace starého 0–100 tuningu → 0–10. */
export function normalizeTuning(raw?: Partial<PlayerTuningValues> | null): PlayerTuningValues {
  const out = { ...DEFAULT_PLAYER_TUNING }
  if (!raw) return out
  const sample = TUNE_KEYS.map((k) => Number(raw[k])).filter((n) => Number.isFinite(n))
  const looksLegacy = sample.some((n) => n > TUNING_MAX)
  for (const k of TUNE_KEYS) {
    let v = Number(raw[k])
    if (!Number.isFinite(v)) continue
    if (looksLegacy) v = Math.round(v / 10)
    out[k] = Math.max(0, Math.min(TUNING_MAX, Math.round(v)))
  }
  // Seříznout rozpočet
  let overflow = tuningSum(out) - TUNING_BUDGET
  if (overflow > 0) {
    const others = [...TUNE_KEYS].sort((a, b) => out[b] - out[a])
    for (const k of others) {
      if (overflow <= 0) break
      const take = Math.min(out[k], overflow)
      out[k] -= take
      overflow -= take
    }
  }
  return out
}

/**
 * Nastaví jednu hodnotu (0–10) a případně sebere body z ostatních
 * kvůli TUNING_BUDGET.
 */
export function setTuningStat(
  current: PlayerTuningValues,
  key: keyof PlayerTuningValues,
  rawValue: number,
): PlayerTuningValues {
  const next = { ...current }
  const value = Math.max(0, Math.min(TUNING_MAX, Math.round(rawValue)))
  next[key] = value

  let overflow = tuningSum(next) - TUNING_BUDGET
  if (overflow <= 0) return next

  const others = TUNE_KEYS.filter((k) => k !== key)
  others.sort((a, b) => next[b] - next[a])

  for (const k of others) {
    if (overflow <= 0) break
    const take = Math.min(next[k], overflow)
    next[k] -= take
    overflow -= take
  }

  if (overflow > 0) {
    next[key] = Math.max(0, next[key] - overflow)
  }

  return next
}

/**
 * Neutrální fyzika (slider = 5) — odpovídá dřívějšímu „default“ feelu.
 * Slider jen násobí ±15 %.
 */
const NEUTRAL_PHYSICS = {
  power: 61.5,
  brakeForce: 94.6,
  downforce: 1.39,
  grip: 1.35,
  drag: 0.195,
  steerResp: 1.06,
  mass: 1.0,
}

export function tuningToPhysics(vals: PlayerTuningValues) {
  const v = normalizeTuning(vals)
  return {
    power: NEUTRAL_PHYSICS.power * tuningMult(v.power),
    brakeForce: NEUTRAL_PHYSICS.brakeForce * tuningMult(v.brakes),
    downforce: NEUTRAL_PHYSICS.downforce * tuningMult(v.downforce),
    grip: NEUTRAL_PHYSICS.grip * tuningMult(v.grip),
    // power ↑ mírně snižuje drag; downforce ↑ mírně zvyšuje
    drag:
      NEUTRAL_PHYSICS.drag *
      (2 - tuningMult(v.power)) *
      (0.5 + 0.5 * tuningMult(v.downforce)),
    steerResp: NEUTRAL_PHYSICS.steerResp * tuningMult(v.steer),
    // lightness ↑ = lehčí auto (−15 % mass při 10)
    mass: NEUTRAL_PHYSICS.mass * (2 - tuningMult(v.lightness)),
  }
}

/**
 * Odhad tempa vs neutrál (slider 5). >1 = rychlejší setup → kratší čas.
 * Pro learn: paceNeutral ≈ paceRaw * tuningPaceFactor(tuning).
 */
export function tuningPaceFactor(vals: PlayerTuningValues): number {
  const score = (p: ReturnType<typeof tuningToPhysics>) =>
    Math.sqrt((p.power / Math.max(0.5, p.mass)) / Math.max(0.08, p.drag))
  const ratio = score(tuningToPhysics(vals)) / score(tuningToPhysics(DEFAULT_PLAYER_TUNING))
  return Math.max(0.78, Math.min(1.28, ratio))
}

export function tuningHint(vals: PlayerTuningValues): string {
  const sum = tuningSum(vals)
  const left = TUNING_BUDGET - sum
  const maxed = TUNE_KEYS.find((k) => vals[k] >= TUNING_MAX)

  if (maxed) {
    return t('tune.maxed', { stat: t(`tune.stat.${maxed}`), budget: TUNING_BUDGET })
  }
  if (vals.power >= 8 && vals.grip <= 3) return t('tune.powerGrip')
  if (vals.downforce >= 8 && vals.power <= 3) return t('tune.dfPower')
  if (vals.steer >= 8 && vals.grip <= 3) return t('tune.steerGrip')
  if (vals.lightness >= 8 && vals.grip <= 3) return t('tune.lightGrip')
  if (left > 0) return t('tune.left', { left, budget: TUNING_BUDGET })
  return t('tune.full')
}
