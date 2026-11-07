import type { DifficultyDef } from './Difficulty'
import type { Track } from '../track/Track'
import type { Vehicle } from '../vehicle/Vehicle'

/**
 * Pevná jízda po racing line.
 * Tempo = rovnovážná rychlost vozu (ne hard-cap), srovnatelná s hráčem.
 */
export class AiDriver {
  private readonly slot: number
  private difficulty: DifficultyDef
  private railDist = 0
  private ready = false
  private launch = 0

  constructor(slot: number, difficulty: DifficultyDef) {
    this.slot = slot
    this.difficulty = difficulty
  }

  setDifficulty(d: DifficultyDef): void {
    this.difficulty = d
  }

  reset(track: Track, startT: number, vehicle: Vehicle): void {
    const len = Math.max(1, track.length)
    const stagger = this.slot <= 0 ? 0 : this.slot * 26
    this.railDist = startT * len - stagger
    if (this.railDist < 0) this.railDist += len
    this.launch = 0
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
    const t = ((this.railDist / len) % 1 + 1) % 1
    const corner = cornerFactor(track, t)

    // Rovnovážná rychlost z fyziky — NE hard-cap (ten je ~2–3× vyšší než reálný cruise)
    const eq = equilibriumSpeed(vehicle)
    // Drž tempo blízko hráče, ať neutíkají / nezaostávají extrémně
    const playerRef = Math.max(18, Math.abs(playerSpeed))
    let cruise = eq * 0.55 + playerRef * 0.45
    cruise *= this.difficulty.speedScale * 4
    // Strop podle eq / hráče, pak ×4 celkově
    cruise = Math.min(cruise, eq * 1.05 * this.difficulty.speedScale * 4, playerRef * 1.2 * 4)

    this.launch = Math.min(1, this.launch + dt / 1.1)
    const pace = cruise * (0.35 + 0.65 * this.launch) * (1 - corner * 0.28)

    this.railDist += pace * dt
    vehicle.physics.speed = pace
    vehicle.physics.latVel = 0
    vehicle.physics.angularVel = 0
    this.place(vehicle, track)
  }

  private place(vehicle: Vehicle, track: Track): void {
    const len = Math.max(1, track.length)
    const progress = ((this.railDist / len) % 1 + 1) % 1
    const s = track.sample(progress)
    const lane = laneOffset(this.slot, track.halfWidth)
    vehicle.physics.x = s.position.x + s.normal.x * lane
    vehicle.physics.z = s.position.z + s.normal.z * lane
    vehicle.physics.heading = Math.atan2(s.tangent.x, s.tangent.z)
    vehicle.trackT = progress
    vehicle.syncMesh()
  }
}

/** Odhad udržitelné rychlosti (rovnováha výkon × odpor), ne clamp top-speed. */
function equilibriumSpeed(vehicle: Vehicle): number {
  const { power, drag, downforce, mass, speedCapMult } = vehicle.physics.tuning
  const p = (power * 0.85) / Math.max(0.5, mass)
  let speed = Math.sqrt(Math.max(4, p / Math.max(0.08, drag * 0.75)))
  for (let i = 0; i < 4; i++) {
    const aero = (drag + downforce * 0.045 * (speed / 55)) * 0.75
    speed = Math.sqrt(Math.max(4, p / Math.max(0.08, aero)))
  }
  const hardCap = (118 + downforce * 5) * 1.3 * (speedCapMult || 1)
  // Typicky ~45–90 — hardCap bývá 150+, proto bereme eq a max 55 % capu
  return Math.min(speed, hardCap * 0.55)
}

function laneOffset(slot: number, halfWidth: number): number {
  const spread = Math.max(2.4, Math.min(halfWidth - 1.8, halfWidth * 0.7))
  const lanes = [-0.85, 0, 0.85]
  const idx = Math.max(0, (slot - 1) % lanes.length)
  return lanes[idx] * spread
}

function cornerFactor(track: Track, t: number): number {
  const a = track.sample(t)
  const b = track.sample((t + 0.045) % 1)
  const dot = a.tangent.dot(b.tangent)
  return 1 - Math.max(0, Math.min(1, dot))
}
