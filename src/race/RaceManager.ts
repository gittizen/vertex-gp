import type { Track } from '../track/Track'
import type { Vehicle } from '../vehicle/Vehicle'

export type RacePhase = 'countdown' | 'racing' | 'finished'

export type Standing = {
  vehicle: Vehicle
  place: number
}

/** Solo: hned po dojetí hráče. Multi: 15 s od prvního člověka, nebo všichni lidé. */
export type FinishPolicy = 'solo' | 'multi'

export class RaceManager {
  totalLaps = 3
  phase: RacePhase = 'countdown'
  countdown = 3
  private countdownAcc = 0
  raceTimeMs = 0
  standings: Standing[] = []
  private readonly track: Track
  private readonly vehicles: Vehicle[]
  private readonly lastT = new Map<Vehicle, number>()
  /** Etapa: cíl platí až po projetí části tratě (prevence okamžitého konce po Znovu). */
  private readonly stageArmed = new Map<Vehicle, boolean>()
  private finishGraceStartedAt = -1
  finishPolicy: FinishPolicy = 'solo'
  readonly isStage: boolean
  /** Volná plocha (Plácek) — bez kol / cíle, skóre = triky. */
  readonly isSandbox: boolean

  constructor(track: Track, vehicles: Vehicle[]) {
    this.track = track
    this.vehicles = vehicles
    this.isSandbox = !!track.def.sandbox
    this.isStage = !this.isSandbox && !track.def.loop
    this.totalLaps = this.isStage ? 1 : 3
  }

  start(opts?: { skipCountdown?: boolean; laps?: number }): void {
    this.phase = 'countdown'
    this.countdown = 3
    this.countdownAcc = 0
    this.raceTimeMs = 0
    this.standings = []
    this.finishGraceStartedAt = -1
    this.lastT.clear()
    this.stageArmed.clear()
    if (this.isStage) {
      this.totalLaps = 1
    } else if (typeof opts?.laps === 'number' && Number.isFinite(opts.laps)) {
      this.totalLaps = Math.max(1, Math.min(5, Math.round(opts.laps)))
    } else {
      this.totalLaps = 3
    }

    this.vehicles.forEach((v, i) => {
      const pose = this.track.getStartPose(i)
      v.reset(pose.x, pose.z, pose.heading, 0)
      v.groundY = pose.y
      const t0 = this.track.progressAt(pose.x, pose.z)
      this.lastT.set(v, t0)
      this.stageArmed.set(v, false)
      v.trackT = t0
      v.finished = false
      v.finishTime = 0
    })

    if (opts?.skipCountdown) {
      this.phase = 'racing'
      this.countdown = 0
      this.raceTimeMs = 0
      for (const v of this.vehicles) {
        v.currentLapStart = 0
        this.lastT.set(v, this.track.progressAt(v.physics.x, v.physics.z))
      }
    }
  }

  /** QA / skipCountdown za běhu — bez resetu aut. */
  skipToRacing(): void {
    if (this.phase !== 'countdown') return
    this.phase = 'racing'
    this.countdown = 0
    this.raceTimeMs = 0
    for (const v of this.vehicles) {
      v.currentLapStart = 0
      this.lastT.set(v, this.track.progressAt(v.physics.x, v.physics.z))
    }
  }

  /** QA: vynutit konec (solo výsledky). */
  forceFinish(): void {
    const player = this.vehicles.find((v) => v.info.isPlayer)
    if (player && !player.finished) {
      player.finished = true
      player.finishTime = Math.max(1, this.raceTimeMs)
    }
    this.phase = 'finished'
    this.standings = this.computeStandings()
  }

  update(dt: number): void {
    if (this.phase === 'countdown') {
      this.countdownAcc += dt
      // Semafor 3→2→1 (zelené); po 1 hned racing (bez GO delay)
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
    this.tryEndRace()
  }

  private tryEndRace(): void {
    if (this.isSandbox) return

    if (this.finishPolicy === 'solo') {
      const player = this.vehicles.find((v) => v.info.isPlayer)
      if (player?.finished) {
        this.phase = 'finished'
        this.standings = this.computeStandings()
      }
      return
    }

    // Multiplayer: lidé (ne boti)
    const humans = this.vehicles.filter((v) => !v.info.isBot)
    if (humans.length === 0) {
      if (this.vehicles.every((v) => v.finished)) {
        this.phase = 'finished'
        this.standings = this.computeStandings()
      }
      return
    }

    const anyHumanDone = humans.some((v) => v.finished)
    if (!anyHumanDone) return

    if (this.finishGraceStartedAt < 0) {
      this.finishGraceStartedAt = this.raceTimeMs
    }

    const allHumansDone = humans.every((v) => v.finished)
    const graceOver = this.raceTimeMs - this.finishGraceStartedAt >= 15000
    if (allHumansDone || graceOver) {
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

    if (this.isSandbox) {
      v.raceDistance = v.trickPoints
      v.lap = 0
      return
    }

    if (this.isStage) {
      v.raceDistance = t
      v.lap = t >= 0.97 ? 1 : 0
      v.checkpoint = Math.floor(t * this.track.checkpoints.length)
      if (t > 0.18 && t < 0.9) this.stageArmed.set(v, true)
      if (this.stageArmed.get(v) && t >= 0.97) {
        v.finished = true
        v.finishTime = this.raceTimeMs
        v.physics.speed *= 0.45
        if (this.raceTimeMs < v.bestLapMs) v.bestLapMs = this.raceTimeMs
      }
      return
    }

    if (t > 0.45 && t < 0.9) {
      v.armedForLap = true
    }

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
      if (this.isSandbox) {
        if (b.trickPoints !== a.trickPoints) return b.trickPoints - a.trickPoints
        return a.info.name.localeCompare(b.info.name)
      }
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

  /**
   * Časový odstup: na jezdce vpředu (−), nebo náskok když jsi 1. (+).
   * null ve sandboxu / bez soupeře.
   */
  playerGap(): { ms: number; ahead: boolean; name: string } | null {
    if (this.isSandbox || this.phase === 'countdown') return null
    const standings = this.standings
    if (standings.length < 2) return null
    const meIdx = standings.findIndex((s) => s.vehicle.info.isPlayer)
    if (meIdx < 0) return null
    const me = standings[meIdx]!
    const rival =
      me.place === 1 ? standings[1]! : standings.find((s) => s.place === me.place - 1) ?? null
    if (!rival) return null
    const gapUnits = Math.abs(me.vehicle.raceDistance - rival.vehicle.raceDistance)
    const speed = Math.max(
      8,
      (Math.abs(me.vehicle.physics.speed) + Math.abs(rival.vehicle.physics.speed)) * 0.5,
    )
    const ms = (gapUnits * this.track.length) / speed * 1000
    return {
      ms,
      ahead: me.place === 1,
      name: rival.vehicle.info.name,
    }
  }

  displayLap(vehicle: Vehicle): number {
    if (this.isSandbox || this.isStage) return 1
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
