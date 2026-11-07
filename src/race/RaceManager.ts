import type { Track } from '../track/Track'
import type { Vehicle } from '../vehicle/Vehicle'

export type RacePhase = 'countdown' | 'racing' | 'finished'

export type Standing = {
  vehicle: Vehicle
  place: number
}

export class RaceManager {
  readonly totalLaps = 3
  phase: RacePhase = 'countdown'
  countdown = 3
  private countdownAcc = 0
  raceTimeMs = 0
  standings: Standing[] = []
  private readonly track: Track
  private readonly vehicles: Vehicle[]
  private readonly lastT = new Map<Vehicle, number>()
  private finishGraceStartedAt = -1

  constructor(track: Track, vehicles: Vehicle[]) {
    this.track = track
    this.vehicles = vehicles
  }

  start(): void {
    this.phase = 'countdown'
    this.countdown = 3
    this.countdownAcc = 0
    this.raceTimeMs = 0
    this.standings = []
    this.finishGraceStartedAt = -1
    this.lastT.clear()

    this.vehicles.forEach((v, i) => {
      const pose = this.track.getStartPose(i)
      v.reset(pose.x, pose.z, pose.heading, 0)
      this.lastT.set(v, this.track.progressAt(pose.x, pose.z))
    })
  }

  update(dt: number): void {
    if (this.phase === 'countdown') {
      this.countdownAcc += dt
      if (this.countdownAcc >= 1) {
        this.countdownAcc = 0
        this.countdown -= 1
        if (this.countdown <= 0) {
          this.phase = 'racing'
          this.raceTimeMs = 0
          for (const v of this.vehicles) {
            v.currentLapStart = 0
            this.lastT.set(v, this.track.progressAt(v.physics.x, v.physics.z))
          }
        }
      }
      return
    }

    if (this.phase === 'finished') return

    this.raceTimeMs += dt * 1000
    for (const v of this.vehicles) {
      this.updateProgress(v)
    }

    this.standings = this.computeStandings()

    const player = this.vehicles.find((v) => v.info.isPlayer)
    if (player?.finished) {
      if (this.finishGraceStartedAt < 0) {
        this.finishGraceStartedAt = this.raceTimeMs
      }
      const allDone = this.vehicles.every((v) => v.finished)
      // Delší grace — rail AI stihne dojet pevným tempem
      const graceOver = this.raceTimeMs - this.finishGraceStartedAt > 50000
      if (allDone || graceOver) {
        for (const v of this.vehicles) {
          if (!v.finished) {
            v.finished = true
            v.finishTime = this.raceTimeMs
          }
        }
        this.phase = 'finished'
        this.standings = this.computeStandings()
      }
    } else if (this.vehicles.every((v) => v.finished)) {
      this.phase = 'finished'
      this.standings = this.computeStandings()
    }
  }

  private updateProgress(v: Vehicle): void {
    if (v.finished) return

    const prevT = this.lastT.get(v) ?? v.trackT
    const t = this.track.progressAt(v.physics.x, v.physics.z, prevT)
    v.trackT = t
    this.lastT.set(v, t)

    if (t > 0.45 && t < 0.9) {
      v.armedForLap = true
    }

    // Crossing start/finish forward only after mid-lap
    if (v.armedForLap && prevT > 0.82 && t < 0.18) {
      const lapTime = this.raceTimeMs - v.currentLapStart
      if (v.lap >= 1 && lapTime > 8000 && lapTime < v.bestLapMs) {
        v.bestLapMs = lapTime
      }
      v.lap += 1
      v.checkpoint = 0
      v.armedForLap = false
      v.currentLapStart = this.raceTimeMs

      if (v.lap >= this.totalLaps) {
        v.finished = true
        v.finishTime = this.raceTimeMs
        v.physics.speed *= 0.45
      }
    }

    v.raceDistance = v.lap + t
    v.checkpoint = Math.floor(t * this.track.checkpoints.length)
  }

  computeStandings(): Standing[] {
    const sorted = [...this.vehicles].sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime
      if (a.finished) return -1
      if (b.finished) return 1
      return b.raceDistance - a.raceDistance
    })
    return sorted.map((vehicle, i) => ({ vehicle, place: i + 1 }))
  }

  playerPlace(): number {
    const s = this.standings.find((x) => x.vehicle.info.isPlayer)
    return s?.place ?? 1
  }

  displayLap(vehicle: Vehicle): number {
    return Math.min(Math.max(vehicle.lap + 1, 1), this.totalLaps)
  }
}

export function formatTime(ms: number): string {
  if (!Number.isFinite(ms) || ms === Infinity || ms < 0) return '--:--.--'
  const totalSec = ms / 1000
  const m = Math.floor(totalSec / 60)
  const s = totalSec - m * 60
  return `${m}:${s.toFixed(2).padStart(5, '0')}`
}
