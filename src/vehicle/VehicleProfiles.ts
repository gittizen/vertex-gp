import type { VehicleKind } from '../track/TrackDefs'
import type { VehicleTuning } from './VehiclePhysics'
import type { PlayerTuningValues } from '../tuning/PlayerTuning'
import { DEFAULT_PLAYER_TUNING, tuningToPhysics } from '../tuning/PlayerTuning'

/**
 * Cruise max (km/h) při default tuningu — jen plyn dopředu.
 * Tachometr ukazuje vždy skutečnou rychlost (stejná jednotka u všech peklostrojů).
 * Popisy v menu se berou z těchto čísel.
 */
/** −20 % oproti dřívějšímu katalogu (hráč i AI berou stejný strop). */
export const CATALOG_MAX_KMH: Record<VehicleKind, number> = {
  street: 320,
  moto: 358,
  harley: 322, // −10 % vs moto
  kroska: 286, // −20 % vs moto
  formula: 435,
  monster: 243,
  truck: 194,
  tank: 175,
  limo: 288, // −10 % vs street
  skate: 77,
  bike: 102,
  scooter: 2,
}

/** speedCapMult tak, aby (118 + df*5)*1.3*cap*3.6 ≈ targetKmh */
function capForTarget(downforce: number, targetKmh: number): number {
  const denom = (118 + downforce * 5) * 1.3 * 3.6
  return targetKmh / Math.max(1, denom)
}

/** Reference DF při DEFAULT_PLAYER_TUNING + násobitelích profilu. */
const REF_DF = tuningToPhysics(DEFAULT_PLAYER_TUNING).downforce
const STREET_DF = REF_DF * 0.7
const FORMULA_DF = REF_DF * 1.35
const MONSTER_DF = REF_DF * 0.25
const TANK_DF = REF_DF * 0.2
const SKATE_DF = REF_DF * 0.25

const STREET_CAP = capForTarget(STREET_DF, CATALOG_MAX_KMH.street)
const MOTO_CAP = capForTarget(STREET_DF, CATALOG_MAX_KMH.moto)
const HARLEY_CAP = capForTarget(STREET_DF, CATALOG_MAX_KMH.harley)
const KROSKA_CAP = capForTarget(STREET_DF, CATALOG_MAX_KMH.kroska)
const FORMULA_CAP = capForTarget(FORMULA_DF, CATALOG_MAX_KMH.formula)
const MONSTER_CAP = capForTarget(MONSTER_DF, CATALOG_MAX_KMH.monster)
const TRUCK_CAP = capForTarget(MONSTER_DF, CATALOG_MAX_KMH.truck)
const TANK_CAP = capForTarget(TANK_DF, CATALOG_MAX_KMH.tank)
const LIMO_CAP = capForTarget(STREET_DF, CATALOG_MAX_KMH.limo)
const SKATE_CAP = capForTarget(SKATE_DF, CATALOG_MAX_KMH.skate)
const BIKE_CAP = capForTarget(SKATE_DF, CATALOG_MAX_KMH.bike)

/** Relativní strop rychlosti vozidla (pro přepočet AI tempa). */
export function speedCapMultFor(kind: VehicleKind): number {
  if (kind === 'skate') return SKATE_CAP
  if (kind === 'bike') return BIKE_CAP
  if (kind === 'moto') return MOTO_CAP
  if (kind === 'harley') return HARLEY_CAP
  if (kind === 'kroska') return KROSKA_CAP
  if (kind === 'formula') return FORMULA_CAP
  if (kind === 'monster') return MONSTER_CAP
  if (kind === 'truck') return TRUCK_CAP
  if (kind === 'tank') return TANK_CAP
  if (kind === 'limo') return LIMO_CAP
  if (kind === 'scooter') return capForTarget(0.1, CATALOG_MAX_KMH.scooter)
  return STREET_CAP
}

export function catalogMaxKmh(kind: VehicleKind): number {
  return CATALOG_MAX_KMH[kind] ?? CATALOG_MAX_KMH.street
}

/**
 * AI tempo vůči původnímu nastavení tratě (defaultní vozidlo).
 * Rychlejší vůz → vyšší mult, aby AI drželo tempo s hráčem.
 */
export function aiSpeedMultForVehicle(
  trackAiMult: number,
  trackDefault: VehicleKind,
  selected: VehicleKind,
): number {
  const base = speedCapMultFor(trackDefault)
  const use = speedCapMultFor(selected)
  return trackAiMult * (use / Math.max(0.05, base))
}

function streetBase(playerTuning?: PlayerTuningValues): ReturnType<typeof tuningToPhysics> {
  return tuningToPhysics(playerTuning ?? DEFAULT_PLAYER_TUNING)
}

function monsterBase(playerTuning?: PlayerTuningValues): ReturnType<typeof tuningToPhysics> {
  return tuningToPhysics(playerTuning ?? DEFAULT_PLAYER_TUNING)
}

/** Herní fyzika podle typu vozu. */
export function profileForKind(
  kind: VehicleKind,
  playerTuning?: PlayerTuningValues,
): Partial<VehicleTuning> {
  if (kind === 'scooter') {
    return {
      power: 2,
      brakeForce: 40,
      downforce: 0.1,
      grip: 0.4,
      drag: 0.8,
      mass: 0.5,
      speedCapMult: speedCapMultFor('scooter'),
      steerResp: 0.3,
    }
  }

  if (kind === 'skate' || kind === 'bike') {
    const base = tuningToPhysics(playerTuning ?? DEFAULT_PLAYER_TUNING)
    const tempo = kind === 'bike' ? 1.3 * 1.2 : 1.3
    return {
      ...base,
      power: base.power * 0.45 * tempo,
      downforce: base.downforce * 0.25,
      grip: base.grip * 0.95,
      drag: 0.2,
      mass: kind === 'bike' ? 0.72 : 0.65,
      speedCapMult: kind === 'bike' ? BIKE_CAP : SKATE_CAP,
      steerResp: kind === 'bike' ? 1.15 : 1.3,
    }
  }

  if (kind === 'moto') {
    const base = streetBase(playerTuning)
    return {
      ...base,
      power: base.power * 0.95,
      downforce: base.downforce * 0.7,
      grip: base.grip * 1.05,
      drag: 0.24,
      speedCapMult: MOTO_CAP,
    }
  }

  if (kind === 'harley') {
    const base = streetBase(playerTuning)
    // Fat-rear cruiser: max jako dřív (−10 % vs moto), řízení +5 % vs moto
    return {
      ...base,
      power: base.power * 0.95 * 0.9,
      downforce: base.downforce * 0.7,
      grip: base.grip * 1.05,
      drag: 0.26,
      mass: 1.05,
      speedCapMult: HARLEY_CAP,
      steerResp: 1.05,
    }
  }

  if (kind === 'kroska') {
    const base = streetBase(playerTuning)
    // Cross: −20 % max vs silniční, +20 % akcelerace
    return {
      ...base,
      power: base.power * 0.95 * 1.2,
      downforce: base.downforce * 0.65,
      grip: base.grip * 1.08,
      drag: 0.25,
      mass: 0.95,
      speedCapMult: KROSKA_CAP,
      steerResp: 1.08,
    }
  }

  if (kind === 'formula') {
    const base = tuningToPhysics(playerTuning ?? DEFAULT_PLAYER_TUNING)
    return {
      ...base,
      power: base.power * 1.15,
      downforce: base.downforce * 1.35,
      grip: base.grip * 1.18,
      drag: 0.16,
      mass: 0.85,
      speedCapMult: FORMULA_CAP,
      steerResp: 1.12,
    }
  }

  if (kind === 'monster') {
    const base = monsterBase(playerTuning)
    return {
      ...base,
      power: base.power * 1.1,
      brakeForce: base.brakeForce * 0.82,
      downforce: base.downforce * 0.25,
      grip: base.grip * 0.88,
      drag: 0.32,
      mass: 1.45,
      speedCapMult: MONSTER_CAP,
      // +50 % dříve, teď ještě +30 %
      steerResp: 0.78 * 1.5 * 1.3,
    }
  }

  // Kamion: −20 % oproti monsteru, stejná rodina řízení
  if (kind === 'truck') {
    const base = monsterBase(playerTuning)
    return {
      ...base,
      power: base.power * 1.1 * 0.8,
      brakeForce: base.brakeForce * 0.82 * 0.8,
      downforce: base.downforce * 0.25,
      grip: base.grip * 0.88,
      drag: 0.34,
      mass: 1.55,
      speedCapMult: TRUCK_CAP,
      steerResp: 0.78 * 1.5 * 1.3 * 1.1, // +10 % steer
    }
  }

  // Tank: −10 % vs kamion; steer +10 % navíc
  if (kind === 'tank') {
    const base = monsterBase(playerTuning)
    return {
      ...base,
      power: base.power * 1.1 * 0.8 * 0.9,
      brakeForce: base.brakeForce * 0.82 * 0.8,
      downforce: base.downforce * 0.2,
      grip: base.grip * 0.9,
      drag: 0.36,
      mass: 1.7,
      speedCapMult: TANK_CAP,
      steerResp: 0.78 * 1.3 * 1.5 * 1.3 * 1.1,
    }
  }

  // Limuzína: −10 % vs auto
  if (kind === 'limo') {
    const base = streetBase(playerTuning)
    return {
      ...base,
      power: base.power * 0.95 * 0.9,
      downforce: base.downforce * 0.7,
      grip: base.grip * 1.05,
      drag: 0.26,
      mass: 1.15,
      speedCapMult: LIMO_CAP,
      steerResp: 0.92,
    }
  }

  // Auto (street)
  const base = streetBase(playerTuning)
  return {
    ...base,
    power: base.power * 0.95,
    downforce: base.downforce * 0.7,
    grip: base.grip * 1.05,
    drag: 0.24,
    speedCapMult: STREET_CAP,
  }
}

export function aiProfileForKind(kind: VehicleKind, index: number): Partial<VehicleTuning> {
  if (kind === 'scooter') {
    return {
      power: 2,
      brakeForce: 40,
      downforce: 0.1,
      grip: 0.4,
      drag: 0.8,
      mass: 0.5,
      speedCapMult: speedCapMultFor('scooter'),
      steerResp: 0.3,
    }
  }
  if (kind === 'skate') {
    return {
      power: (22 + index * 0.8) * 1.3,
      brakeForce: 70,
      downforce: 0.3,
      grip: 1.05 + index * 0.02,
      drag: 0.2,
      mass: 0.66,
      speedCapMult: SKATE_CAP,
      steerResp: 1.28,
    }
  }
  if (kind === 'bike') {
    return {
      power: (22 + index * 0.8) * 1.3 * 1.2,
      brakeForce: 72,
      downforce: 0.32,
      grip: 1.06 + index * 0.02,
      drag: 0.2,
      mass: 0.73,
      speedCapMult: BIKE_CAP,
      steerResp: 1.12,
    }
  }
  if (kind === 'moto') {
    return {
      power: 46 + index * 1.8,
      brakeForce: 76,
      downforce: 0.75,
      grip: 1.12 + index * 0.025,
      drag: 0.23,
      speedCapMult: MOTO_CAP,
      steerResp: 0.98,
    }
  }
  if (kind === 'harley') {
    return {
      power: (46 + index * 1.8) * 0.9,
      brakeForce: 76,
      downforce: 0.75,
      grip: 1.12 + index * 0.025,
      drag: 0.26,
      mass: 1.05,
      speedCapMult: HARLEY_CAP,
      steerResp: 1.05,
    }
  }
  if (kind === 'kroska') {
    return {
      power: (46 + index * 1.8) * 1.2,
      brakeForce: 74,
      downforce: 0.7,
      grip: 1.14 + index * 0.025,
      drag: 0.25,
      mass: 0.95,
      speedCapMult: KROSKA_CAP,
      steerResp: 1.05,
    }
  }
  if (kind === 'formula') {
    return {
      power: 62 + index * 1.5,
      brakeForce: 92,
      downforce: 1.35 + index * 0.04,
      grip: 1.28 + index * 0.03,
      drag: 0.15,
      mass: 0.86,
      speedCapMult: FORMULA_CAP,
      steerResp: 1.1,
    }
  }
  if (kind === 'monster') {
    return {
      power: 56 + index * 1.4,
      brakeForce: 62,
      downforce: 0.28,
      grip: 0.98 + index * 0.025,
      drag: 0.3,
      mass: 1.42,
      speedCapMult: MONSTER_CAP,
      steerResp: 0.8 * 1.5 * 1.3,
    }
  }
  if (kind === 'truck') {
    return {
      power: (56 + index * 1.4) * 0.8,
      brakeForce: 62 * 0.8,
      downforce: 0.28,
      grip: 0.98 + index * 0.025,
      drag: 0.34,
      mass: 1.52,
      speedCapMult: TRUCK_CAP,
      steerResp: 0.8 * 1.5 * 1.3 * 1.1,
    }
  }
  if (kind === 'tank') {
    return {
      power: (56 + index * 1.4) * 0.8 * 0.9,
      brakeForce: 62 * 0.8,
      downforce: 0.22,
      grip: 1.0 + index * 0.02,
      drag: 0.36,
      mass: 1.68,
      speedCapMult: TANK_CAP,
      steerResp: 0.8 * 1.3 * 1.5 * 1.3 * 1.1,
    }
  }
  if (kind === 'limo') {
    return {
      power: (46 + index * 1.8) * 0.9,
      brakeForce: 76,
      downforce: 0.75,
      grip: 1.12 + index * 0.025,
      drag: 0.26,
      mass: 1.12,
      speedCapMult: LIMO_CAP,
      steerResp: 0.92,
    }
  }
  return {
    power: 46 + index * 1.8,
    brakeForce: 76,
    downforce: 0.75,
    grip: 1.12 + index * 0.025,
    drag: 0.23,
    speedCapMult: STREET_CAP,
    steerResp: 0.98,
  }
}
