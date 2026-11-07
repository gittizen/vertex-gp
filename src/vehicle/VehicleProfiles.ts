import type { VehicleKind } from '../track/TrackDefs'
import type { VehicleTuning } from './VehiclePhysics'
import type { PlayerTuningValues } from '../tuning/PlayerTuning'
import { tuningToPhysics } from '../tuning/PlayerTuning'

/** Herní fyzika podle typu vozu. */
export function profileForKind(
  kind: VehicleKind,
  playerTuning?: PlayerTuningValues,
): Partial<VehicleTuning> {
  if (kind === 'street') {
    const base = playerTuning
      ? tuningToPhysics(playerTuning)
      : tuningToPhysics({
          power: 25,
          brakes: 25,
          downforce: 15,
          grip: 35,
        })
    return {
      ...base,
      power: base.power * 0.95,
      downforce: base.downforce * 0.7,
      grip: base.grip * 1.05,
      drag: 0.24,
      speedCapMult: 1,
    }
  }

  if (kind === 'rally') {
    const base = playerTuning
      ? tuningToPhysics(playerTuning)
      : tuningToPhysics({
          power: 30,
          brakes: 25,
          downforce: 10,
          grip: 35,
        })
    return {
      ...base,
      power: base.power * 0.92,
      brakeForce: base.brakeForce * 0.9,
      downforce: base.downforce * 0.45,
      grip: base.grip * 0.92,
      drag: 0.23,
      mass: 1.05,
      speedCapMult: 1.05,
    }
  }

  // formule — top speed +40 %
  const base = playerTuning
    ? tuningToPhysics(playerTuning)
    : {
        power: 62,
        brakeForce: 92,
        downforce: 1.28,
        grip: 1.24,
        drag: 0.16,
      }
  return {
    ...base,
    drag: Math.min(base.drag ?? 0.16, 0.15),
    speedCapMult: 1.4,
  }
}

export function aiProfileForKind(kind: VehicleKind, index: number): Partial<VehicleTuning> {
  if (kind === 'street') {
    return {
      power: 46 + index * 1.8,
      brakeForce: 76,
      downforce: 0.75,
      grip: 1.12 + index * 0.025,
      drag: 0.23,
      speedCapMult: 1,
    }
  }
  if (kind === 'rally') {
    return {
      power: 48 + index * 1.5,
      brakeForce: 68,
      downforce: 0.5,
      grip: 1.05 + index * 0.03,
      drag: 0.22,
      mass: 1.04,
      speedCapMult: 1.05,
    }
  }
  return {
    power: 68 + index * 1.4,
    brakeForce: 90,
    downforce: 1.2 + index * 0.04,
    grip: 1.2 + index * 0.025,
    drag: 0.15,
    speedCapMult: 1.4,
  }
}
