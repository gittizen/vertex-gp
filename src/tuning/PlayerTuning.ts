export type PlayerTuningValues = {
  power: number
  brakes: number
  downforce: number
  grip: number
}

/** Celkový rozpočet bodů — na max (100) můžeš mít jen jednu věc, zbytek na 0. */
export const TUNING_BUDGET = 100

export const DEFAULT_PLAYER_TUNING: PlayerTuningValues = {
  power: 25,
  brakes: 25,
  downforce: 25,
  grip: 25,
}

export function tuningSum(t: PlayerTuningValues): number {
  return t.power + t.brakes + t.downforce + t.grip
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
  // Ber nejdřív z nejvyšších ostatních
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

export function tuningToPhysics(t: PlayerTuningValues) {
  return {
    // Základ −30 %, pak +10 % akcelerace; nižší drag = vyšší top speed
    power: (58 + t.power * 0.4) * 0.7 * 1.1,
    brakeForce: 70 + t.brakes * 0.45,
    downforce: 0.95 + t.downforce * 0.009,
    grip: 1.05 + t.grip * 0.0055,
    drag: 0.2 - t.power * 0.0004 + t.downforce * 0.00035,
  }
}

export function tuningHint(t: PlayerTuningValues): string {
  const sum = tuningSum(t)
  const left = TUNING_BUDGET - sum
  const maxed = (Object.keys(t) as (keyof PlayerTuningValues)[]).find((k) => t[k] >= 95)

  if (maxed) {
    return `Na maximu: ${labelOf(maxed)} — ostatní musí zůstat nízko (rozpočet ${TUNING_BUDGET}).`
  }
  if (t.power > 60 && t.grip < 20) return 'Hodně výkonu, málo gripu — pozor ve výjezdech.'
  if (t.downforce > 60 && t.power < 20) return 'Velký přítlak drží auto, ale bere top speed.'
  if (left > 0) return `Zbývá ${left} bodů z ${TUNING_BUDGET}. Na max můžeš vytáhnout jen jednu věc.`
  return 'Rozpočet plný — přidej jednu věc jen když něco jiného snížíš.'
}

function labelOf(k: keyof PlayerTuningValues): string {
  switch (k) {
    case 'power':
      return 'výkon'
    case 'brakes':
      return 'brzdy'
    case 'downforce':
      return 'přítlak'
    case 'grip':
      return 'grip'
  }
}
