import { t } from '../i18n/i18n'

export type PlayerTuningValues = {
  power: number
  brakes: number
  downforce: number
  grip: number
  steer: number
  lightness: number
}

/** Celkový rozpočet bodů — na max můžeš mít jen jednu věc, zbytek nízko. */
export const TUNING_BUDGET = 250

export const DEFAULT_PLAYER_TUNING: PlayerTuningValues = {
  power: 42,
  brakes: 42,
  downforce: 38,
  grip: 42,
  steer: 40,
  lightness: 36,
}

export function tuningSum(vals: PlayerTuningValues): number {
  return vals.power + vals.brakes + vals.downforce + vals.grip + vals.steer + vals.lightness
}

/**
 * Nastaví jednu hodnotu a případně sebere body z ostatních,
 * aby součet nikdy nepřekročil TUNING_BUDGET.
 */
export function setTuningStat(
  current: PlayerTuningValues,
  key: keyof PlayerTuningValues,
  rawValue: number,
): PlayerTuningValues {
  const next = { ...current }
  const value = Math.max(0, Math.min(100, Math.round(rawValue)))
  next[key] = value

  let overflow = tuningSum(next) - TUNING_BUDGET
  if (overflow <= 0) return next

  const others = (Object.keys(next) as (keyof PlayerTuningValues)[]).filter((k) => k !== key)
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

export function tuningToPhysics(vals: PlayerTuningValues) {
  const k = 1.3
  return {
    power: (58 + vals.power * 0.4 * k) * 0.7 * 1.1,
    brakeForce: 70 + vals.brakes * 0.45 * k,
    downforce: 0.95 + vals.downforce * 0.009 * k,
    grip: 1.05 + vals.grip * 0.0055 * k,
    drag: 0.2 - vals.power * 0.0004 * k + vals.downforce * 0.00035 * k,
    steerResp: 0.7 + vals.steer * 0.007 * k,
    mass: 1.2 - vals.lightness * 0.0042 * k,
  }
}

export function tuningHint(vals: PlayerTuningValues): string {
  const sum = tuningSum(vals)
  const left = TUNING_BUDGET - sum
  const maxed = (Object.keys(vals) as (keyof PlayerTuningValues)[]).find((k) => vals[k] >= 95)

  if (maxed) {
    return t('tune.maxed', { stat: t(`tune.stat.${maxed}`), budget: TUNING_BUDGET })
  }
  if (vals.power > 60 && vals.grip < 20) return t('tune.powerGrip')
  if (vals.downforce > 60 && vals.power < 20) return t('tune.dfPower')
  if (vals.steer > 70 && vals.grip < 25) return t('tune.steerGrip')
  if (vals.lightness > 70 && vals.grip < 25) return t('tune.lightGrip')
  if (left > 0) return t('tune.left', { left, budget: TUNING_BUDGET })
  return t('tune.full')
}
