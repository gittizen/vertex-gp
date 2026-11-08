import type { VehicleKind } from '../track/TrackDefs'
import type { VehicleTuning } from './VehiclePhysics'
import type { PlayerTuningValues } from '../tuning/PlayerTuning'
import { tuningToPhysics } from '../tuning/PlayerTuning'

/** Skate po úpravě na max ~60 km/h */
const SKATE_CAP = 0.14 * 1.3 * (60 / 80)
/** Kolo: tempo +20 % vs skate, max ~80 */
const BIKE_CAP = SKATE_CAP * (80 / 60)
const MONSTER_CAP = 0.95 * 0.8
const TRUCK_CAP = MONSTER_CAP * 0.8
const TANK_CAP = TRUCK_CAP * 0.9
const LIMO_CAP = 1 * 0.95

/** Relativní strop rychlosti vozidla (pro přepočet AI tempa). */
export function speedCapMultFor(kind: VehicleKind): number {
  if (kind === 'skate') return SKATE_CAP
  if (kind === 'bike') return BIKE_CAP
  if (kind === 'formula') return 1.22
  if (kind === 'monster') return MONSTER_CAP
  if (kind === 'truck') return TRUCK_CAP
  if (kind === 'tank') return TANK_CAP
  if (kind === 'limo') return LIMO_CAP
  if (kind === 'scooter') return 0.02
  return 1
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
  return playerTuning
    ? tuningToPhysics(playerTuning)
    : tuningToPhysics({
        power: 25,
        brakes: 25,
        downforce: 15,
        grip: 35,
        steer: 30,
        lightness: 25,
      })
}

function monsterBase(playerTuning?: PlayerTuningValues): ReturnType<typeof tuningToPhysics> {
  return playerTuning
    ? tuningToPhysics(playerTuning)
    : tuningToPhysics({
        power: 48,
        brakes: 22,
        downforce: 6,
        grip: 30,
        steer: 24,
        lightness: 12,
      })
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
      speedCapMult: 0.02,
      steerResp: 0.3,
    }
  }

  if (kind === 'skate' || kind === 'bike') {
    const base = playerTuning
      ? tuningToPhysics(playerTuning)
      : tuningToPhysics({
          power: 22,
          brakes: 22,
          downforce: 5,
          grip: 30,
          steer: 40,
          lightness: 50,
        })
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
      speedCapMult: 1,
    }
  }

  if (kind === 'formula') {
    const base = playerTuning
      ? tuningToPhysics(playerTuning)
      : tuningToPhysics({
          power: 42,
          brakes: 38,
          downforce: 45,
          grip: 48,
          steer: 42,
          lightness: 40,
        })
    return {
      ...base,
      power: base.power * 1.15,
      downforce: base.downforce * 1.35,
      grip: base.grip * 1.18,
      drag: 0.16,
      mass: 0.85,
      speedCapMult: 1.22,
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
      steerResp: 0.78,
    }
  }

  // Kamion: −20 % oproti monsteru, stejné řízení
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
      steerResp: 0.78,
    }
  }

  // Tank: −10 % vs kamion, +30 % citlivost řízení
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
      steerResp: 0.78 * 1.3,
    }
  }

  // Limuzína: −5 % vs auto
  if (kind === 'limo') {
    const base = streetBase(playerTuning)
    return {
      ...base,
      power: base.power * 0.95 * 0.95,
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
    speedCapMult: 1,
  }
}

export function aiProfileForKind(kind: VehicleKind, index: number): Partial<VehicleTuning> {
  if (kind === 'scooter') {
    return { power: 2, brakeForce: 40, downforce: 0.1, grip: 0.4, drag: 0.8, mass: 0.5, speedCapMult: 0.02, steerResp: 0.3 }
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
      speedCapMult: 1,
      steerResp: 0.98,
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
      speedCapMult: 1.22,
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
      steerResp: 0.8,
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
      steerResp: 0.8,
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
      steerResp: 0.8 * 1.3,
    }
  }
  if (kind === 'limo') {
    return {
      power: (46 + index * 1.8) * 0.95,
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
    speedCapMult: 1,
    steerResp: 0.98,
  }
}
