import type { DifficultyDef } from './Difficulty'
import type { Track } from '../track/Track'
import type { Vehicle } from '../vehicle/Vehicle'

/** Střední: 1. jezdec +5 %, 2. stejně, 3. −20 % (slot 0 = hráč) */
const SLOT_PACE = [1, 1.05, 1.0, 0.8]

/**
 * Pevná jízda po racing line.
 * Do zatáček brzdí, na rovince jede naplno. Tempo podle slotu + tratě.
 */
export class AiDriver {
  private readonly slot: number
  private difficulty: DifficultyDef
  private railDist = 0
  private ready = false
  private launch = 0
  private pace = 0

  constructor(slot: number, difficulty: DifficultyDef) {
    this.slot = slot
    this.difficulty = difficulty
  }

  setDifficulty(d: DifficultyDef): void {
    this.difficulty = d
  }

  reset(track: Track, startT: number, vehicle: Vehicle): void {
    const len = Math.max(1, track.length)
    // Stejná startovní „lajna“ jako hráč (2+2 grid bez náskoku)
    this.railDist = startT * len
    if (track.def.loop) {
      this.railDist = ((this.railDist % len) + len) % len
    } else {
      this.railDist = Math.max(0, Math.min(len * 0.02, startT * len))
    }
    this.launch = 0
    this.pace = 0
    this.ready = true
    if (this.slot > 0) this.place(vehicle, track)
  }

  drive(dt: number, vehicle: Vehicle, track: Track, playerSpeed = 0): void {
    if (!this.ready || vehicle.finished) {
      vehicle.physics.speed *= Math.exp(-2 * dt)
      vehicle.syncMesh()
      return
    }

    const len = Math.max(1, track.length)
    const loop = track.def.loop
    let t = this.railDist / len
    if (loop) t = ((t % 1) + 1) % 1
    else t = Math.max(0, Math.min(0.999, t))

    const corner = cornerFactor(track, t, loop)
    const eq = equilibriumSpeed(vehicle)
    const playerRef = Math.max(18, Math.abs(playerSpeed))
    const slotPace = SLOT_PACE[this.slot] ?? 1
    const trackMult = track.aiSpeedMult ?? 1

    let cruise = eq * 0.55 + playerRef * 0.45
    // ×4 základ · dřívější +10 % · další +10 %
    const paceBoost = 4 * 1.1 * 1.1
    cruise *= this.difficulty.speedScale * paceBoost * slotPace * trackMult
    cruise = Math.min(
      cruise,
      eq * 1.05 * this.difficulty.speedScale * paceBoost * slotPace * trackMult,
      playerRef * 1.2 * paceBoost * slotPace * trackMult,
    )

    // Start: náběh o 30 % pomalejší
    this.launch = Math.min(1, this.launch + (dt / 1.1) * 0.7)
    const cornerSlow = 1 - corner * 0.62
    const target = cruise * (0.35 + 0.65 * this.launch) * Math.max(0.32, cornerSlow)

    if (target >= this.pace) {
      // Zrychlení ze startu / ze zatáčky: −30 %
      const blend = Math.min(1, 3.6 * dt * 0.7)
      this.pace += (target - this.pace) * blend
    } else {
      // Brzdění do zatáčky beze změny
      this.pace = target
    }

    const prevPace = this.pace
    this.railDist += this.pace * dt
    if (!loop && this.railDist > len) this.railDist = len
    vehicle.physics.speed = this.pace
    // Náklon AI: křivost → angularVel / latVel (moto znaménko opačně než auta)
    const turn = turnSign(track, t, loop)
    const leanAmt = corner * Math.min(1.4, this.pace / 42)
    const bike = vehicle.wantsBikeLean()
    const leanDir = bike ? -turn : turn
    vehicle.physics.angularVel = leanDir * leanAmt * (bike ? 1.15 : 0.55)
    vehicle.physics.latVel = leanDir * leanAmt * this.pace * (bike ? 0.08 : 0.03)
    // AI monstertruck — turbo při zrychlení (stejný vizuál/zvuk jako hráč)
    if (vehicle.kind === 'monster') {
      const boosting = this.pace > prevPace + 0.05 || (this.pace > 8 && corner < 0.25)
      vehicle.setTurboInput(boosting ? 1 : 0.15, dt)
    } else {
      vehicle.setTurboInput(0, dt)
    }
    // AI skate — vizuál odrážení při zrychlení
    if (vehicle.kind === 'skate') {
      const pushing = this.pace > prevPace + 0.08 || (this.launch < 0.85 && this.pace > 5)
      vehicle.setPushVisual(pushing ? 1 : 0, dt)
    }
    this.place(vehicle, track, dt)
  }

  private place(vehicle: Vehicle, track: Track, dt = 1 / 60): void {
    const len = Math.max(1, track.length)
    let progress = this.railDist / len
    if (track.def.loop) progress = ((progress % 1) + 1) % 1
    else progress = Math.max(0, Math.min(1, progress))
    const s = track.sample(progress)
    const lane = laneOffset(this.slot, track.halfWidth)
    vehicle.physics.x = s.position.x + s.normal.x * lane
    vehicle.physics.z = s.position.z + s.normal.z * lane
    vehicle.physics.heading = Math.atan2(s.tangent.x, s.tangent.z)
    vehicle.trackT = progress
    vehicle.followSurface(track, progress, dt)
    vehicle.syncMesh(dt)
  }
}

function equilibriumSpeed(vehicle: Vehicle): number {
  const { power, drag, downforce, mass, speedCapMult } = vehicle.physics.tuning
  const p = (power * 0.85) / Math.max(0.5, mass)
  let speed = Math.sqrt(Math.max(4, p / Math.max(0.08, drag * 0.75)))
  for (let i = 0; i < 4; i++) {
    const aero = (drag + downforce * 0.045 * (speed / 55)) * 0.75
    speed = Math.sqrt(Math.max(4, p / Math.max(0.08, aero)))
  }
  const hardCap = (118 + downforce * 5) * 1.3 * (speedCapMult || 1)
  return Math.min(speed, hardCap * 0.55)
}

function laneOffset(slot: number, halfWidth: number): number {
  // Stejné strany jako startovní 2×2 grid (0|2 vlevo, 1|3 vpravo)
  const side = slot % 2 === 0 ? -1 : 1
  return side * Math.min(3.4, halfWidth * 0.32)
}

function cornerFactor(track: Track, t: number, loop: boolean): number {
  const wrap = (u: number) => (loop ? ((u % 1) + 1) % 1 : Math.min(0.999, u))
  const a = track.sample(t)
  const b = track.sample(wrap(t + 0.03))
  const c = track.sample(wrap(t + 0.06))
  const d = track.sample(wrap(t + 0.1))
  const d1 = a.tangent.dot(b.tangent)
  const d2 = b.tangent.dot(c.tangent)
  const d3 = c.tangent.dot(d.tangent)
  return 1 - Math.max(0, Math.min(d1, d2, d3))
}

/** Směr zatáčky (−1 / 0 / +1) pro náklon AI. */
function turnSign(track: Track, t: number, loop: boolean): number {
  const wrap = (u: number) => (loop ? ((u % 1) + 1) % 1 : Math.min(0.999, u))
  const a = track.sample(t)
  const b = track.sample(wrap(t + 0.05))
  const cross = a.tangent.x * b.tangent.z - a.tangent.z * b.tangent.x
  return Math.sign(cross) || 0
}
