/**
 * Profil animace freestyle triku — plynulé křivky, multi-osa, jezdec.
 * u ∈ [0,1] průběhu (nepřerušitelné).
 */

export type SpinStyle =
  | 'none'
  | 'kick'
  | 'heel'
  | 'imp'
  | 'shove'
  | 'tre'
  | 'laser'
  | 'roll'
  | 'yaw'
  | 'doublekick'
  | 'quadkick'
  | 'flipyaw'

export type AnimPose = {
  /** Výška nad tratí */
  airY: number
  /** Deska / rám (relativně k pivotu) */
  board: { x: number; y: number; z: number }
  /** Celé vozidlo (dočasný náklon ve vzduchu) */
  body: { pitch: number; roll: number; yaw: number }
  /** Jezdec */
  crouch: number
  backLeg: number
  frontLeg: number
  arms: number
  torsoTwist: number
  /** Land squash 0–1 ke konci */
  squash: number
}

export function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
}

export function easeOutBack(t: number): number {
  const c = 1.70158
  const c3 = c + 1
  return 1 + c3 * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2)
}

export function smoothstep(t: number): number {
  const x = Math.max(0, Math.min(1, t))
  return x * x * (3 - 2 * x)
}

/** Vyhodnotí pose pro daný spin + peak výšky + difficulty. */
export function evalTrickAnim(
  u: number,
  spin: SpinStyle,
  peak: number,
  difficulty: number,
): AnimPose {
  const e = easeInOut(u)
  // Výška: rychlý pop, hangtime, měkký land
  const lift = Math.sin(Math.PI * Math.pow(u, 0.85))
  const airY = lift * peak * (0.85 + difficulty * 0.02)
  const squash = u > 0.82 ? smoothstep((u - 0.82) / 0.18) : 0

  const board = { x: 0, y: 0, z: 0 }
  const body = { pitch: 0, roll: 0, yaw: 0 }
  let crouch = Math.sin(Math.PI * Math.min(1, u * 2.4)) * 0.55
  let backLeg = -0.4 * crouch
  let frontLeg = -0.25 * crouch
  let arms = crouch * 0.5
  let torsoTwist = 0

  const flips = 1 + Math.floor((difficulty - 1) / 4) // 1–3 otáčky u těžších

  switch (spin) {
    case 'none': {
      // Ollie / bunny — nose tip up, pop zadní
      board.x = -Math.sin(Math.PI * e) * 0.55
      body.pitch = -Math.sin(Math.PI * e) * 0.25
      const pop = Math.sin(smoothstep(clamp01((u - 0.12) / 0.35)) * Math.PI)
      backLeg = -0.55 * crouch - pop * 1.1
      frontLeg = -0.3 * crouch + Math.sin(smoothstep(clamp01((u - 0.28) / 0.4)) * Math.PI) * 0.55
      break
    }
    case 'kick':
    case 'doublekick':
    case 'quadkick': {
      const n = spin === 'quadkick' ? 4 : spin === 'doublekick' ? 2 : flips
      board.z = e * Math.PI * 2 * n
      board.x = -Math.sin(Math.PI * e) * 0.35
      body.roll = Math.sin(e * Math.PI * 2 * n) * 0.15
      crouch *= 0.7
      arms = 0.35 + Math.sin(e * Math.PI) * 0.55
      backLeg = -0.8 + Math.sin(e * Math.PI) * 0.4
      frontLeg = 0.2 + Math.sin(e * Math.PI * 2) * 0.5
      break
    }
    case 'heel': {
      board.z = -e * Math.PI * 2 * flips
      board.x = -Math.sin(Math.PI * e) * 0.3
      body.roll = -Math.sin(e * Math.PI * 2) * 0.18
      arms = 0.45 + Math.sin(e * Math.PI) * 0.4
      frontLeg = 0.55 * Math.sin(Math.PI * e)
      break
    }
    case 'imp': {
      board.x = e * Math.PI * 2 * flips
      body.pitch = e * Math.PI * 2 * Math.min(1, flips)
      crouch = 0.2 + Math.sin(Math.PI * e) * 0.5
      arms = 0.8 * Math.sin(Math.PI * e)
      backLeg = -1.1 * Math.sin(Math.PI * e)
      frontLeg = 0.9 * Math.sin(Math.PI * e)
      break
    }
    case 'shove': {
      board.y = e * Math.PI
      board.x = -Math.sin(Math.PI * e) * 0.4
      body.yaw = Math.sin(Math.PI * e) * 0.35
      torsoTwist = Math.sin(Math.PI * e) * 0.5
      break
    }
    case 'tre':
    case 'flipyaw': {
      board.z = e * Math.PI * 2 * flips
      board.y = e * Math.PI * (spin === 'flipyaw' ? 2 : 1)
      board.x = -Math.sin(Math.PI * e) * 0.25
      body.yaw = e * Math.PI * (spin === 'flipyaw' ? 2 : 1) * 0.35
      arms = 0.6 + Math.sin(e * Math.PI * 2) * 0.35
      torsoTwist = Math.sin(e * Math.PI * 2) * 0.4
      break
    }
    case 'laser': {
      board.z = -e * Math.PI * 2 * flips
      board.y = e * Math.PI
      body.roll = Math.sin(e * Math.PI) * 0.4
      arms = 0.7
      break
    }
    case 'roll': {
      // Tabletop / can-can — flat spin ve vzduchu
      const arch = Math.sin(Math.PI * e)
      board.z = arch * 1.35
      body.roll = arch * 1.15
      body.pitch = -arch * 0.35
      crouch = 0.15
      frontLeg = arch * 1.4
      backLeg = -arch * 0.6
      arms = arch * 0.9
      break
    }
    case 'yaw': {
      const turns = difficulty >= 6 ? 2 : 1
      board.y = e * Math.PI * 2 * turns
      body.yaw = e * Math.PI * 2 * turns * 0.5
      board.x = -Math.sin(Math.PI * e) * 0.3
      torsoTwist = Math.sin(e * Math.PI * 2 * turns) * 0.55
      arms = 0.5 + Math.abs(Math.sin(e * Math.PI * 2)) * 0.4
      break
    }
    default:
      break
  }

  // Land settle — deska srovná + squash
  if (squash > 0) {
    const s = easeOutBack(1 - squash)
    board.x *= s
    board.y *= s
    board.z *= s
    body.pitch *= s
    body.roll *= s
    body.yaw *= s
    crouch = squash * 0.75
  }

  return { airY, board, body, crouch, backLeg, frontLeg, arms, torsoTwist, squash }
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v))
}
