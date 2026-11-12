import type { DifficultyDef } from './Difficulty'
import { learnedTargetPaceMs } from './CommunityLearning'
import { freestyleList } from '../freestyle/FreestyleTricks'
import type { Track } from '../track/Track'
import type { VehicleKind } from '../track/TrackDefs'
import type { Vehicle } from '../vehicle/Vehicle'
import { catalogMaxKmh, speedCapMultFor } from '../vehicle/VehicleProfiles'
import { isFsBoardKind } from '../vehicle/FsKinds'

/**
 * Rychlostní násobiče slotů (slot 0 = hráč).
 * targetPaceMs = čas 2. jezdce (medium, street).
 * 1. jezdec = o 10 % rychlejší než ten čas (čas × 0.9 → rychlost × 1/0.9).
 * 3. jezdec = −20 %.
 */
const SLOT_SPEED = [1, 1 / 0.9, 1.0, 0.8]
/** Kompenzace zatáček + náběhu, ať průměrné tempo ≈ cíl */
const CORNER_COMP = 1.34
const PACE_BOOST = 4 * 1.1 * 1.1

/**
 * AI Shift bursty — analytik: očekávaný příspěvek k tempu.
 * ~1–2 holdy / kolo na rovince × průměrný mult → ~+1.5 % avg speed u shift vozů.
 * Cruise se dělí `AI_SHIFT_PACE_FACTOR`, ať dojezd ≈ targetPaceMs i s bursty.
 */
export const AI_SHIFT_DUTY = 0.1
export const AI_SHIFT_AVG_MULT = 1.28
export const AI_SHIFT_PACE_FACTOR = 1 + AI_SHIFT_DUTY * (AI_SHIFT_AVG_MULT - 1) * 0.55
const SHIFT_CORNER_MAX = 0.22
const SHIFT_HOLD_FRAC = 0.055

/**
 * Náběh ze startu podle typu — vizuálně rozdílný, finální čas drží catch-up dluh.
 * durationSec: jak dlouho trvá plný launch (0→1)
 * startFrac: podíl cruise na GO (0=stojí, 1=hned cruise)
 * accelBlend: jak agresivně dohání target při akceleraci
 */
export type LaunchFeel = { durationSec: number; startFrac: number; accelBlend: number }

export function launchFeelFor(kind: VehicleKind): LaunchFeel {
  switch (kind) {
    case 'formula':
      return { durationSec: 1.35, startFrac: 0.22, accelBlend: 2.4 }
    case 'moto':
      return { durationSec: 1.55, startFrac: 0.18, accelBlend: 2.2 }
    case 'harley':
      return { durationSec: 1.75, startFrac: 0.16, accelBlend: 2.0 }
    case 'naked':
      return { durationSec: 1.45, startFrac: 0.19, accelBlend: 2.3 }
    case 'enduro':
      return { durationSec: 1.5, startFrac: 0.18, accelBlend: 2.35 }
    case 'kroska':
      return { durationSec: 1.35, startFrac: 0.2, accelBlend: 2.5 }
    case 'street':
    case 'limo':
      return { durationSec: 2.05, startFrac: 0.14, accelBlend: 1.85 }
    case 'cabrio':
      return { durationSec: 1.85, startFrac: 0.16, accelBlend: 2.0 }
    case 'muscle':
      return { durationSec: 1.95, startFrac: 0.15, accelBlend: 1.9 }
    case 'monster':
    case 'truck':
      return { durationSec: 2.85, startFrac: 0.08, accelBlend: 1.45 }
    case 'buggy':
      return { durationSec: 2.35, startFrac: 0.1, accelBlend: 1.7 }
    case 'humvee':
      return { durationSec: 2.55, startFrac: 0.09, accelBlend: 1.55 }
    case 'tank':
      return { durationSec: 3.4, startFrac: 0.05, accelBlend: 1.2 }
    case 'bike':
    case 'rocketBike':
      return { durationSec: 1.9, startFrac: 0.12, accelBlend: 1.7 }
    case 'skates':
    case 'rocketSkates':
      return { durationSec: 2.1, startFrac: 0.1, accelBlend: 1.6 }
    case 'skate':
    case 'rocketSkate':
      return { durationSec: 2.35, startFrac: 0.08, accelBlend: 1.5 }
    case 'scooter':
    case 'rocketScooter':
      return { durationSec: 4.0, startFrac: 0.02, accelBlend: 0.9 }
    default:
      return { durationSec: 2.0, startFrac: 0.14, accelBlend: 1.8 }
  }
}

/**
 * AI po racing line.
 * targetPaceMs = cílový čas do cíle / kola pro 2. AI na střední (auto).
 */
export class AiDriver {
  private readonly slot: number
  private difficulty: DifficultyDef
  private railDist = 0
  private ready = false
  private launch = 0
  private pace = 0
  /** Metry „zpoždění“ oproti ideálnímu tempu — splatí se mírně vyšší rychlostí po startu. */
  private paceDebt = 0
  /** Vyhlazený náklon (zatáčka + výjezd) — nešpičkuje hned a nesrovná se okamžitě. */
  private leanSmooth = 0
  /**
   * Sezónní forma (kariérní ramp 0.9–1): pod 1 = méně agresivní, víc chyb.
   * Nikdy nezvedá tempo nad `difficulty.speedScale` / hardCap vozidla.
   */
  private seasonForm = 1
  /** FS: kolik triků už v aktuálním kole / etapě. */
  private fsTricksThisLap = 0
  private fsLapIndex = -1
  private fsTrickCd = 0

  constructor(slot: number, difficulty: DifficultyDef) {
    this.slot = slot
    this.difficulty = difficulty
  }

  setDifficulty(d: DifficultyDef): void {
    this.difficulty = d
  }

  /** Kariérní ramp 0.9–1 (1 = plná úroveň). Quick race nechá 1. */
  setSeasonForm(form: number): void {
    this.seasonForm = Math.max(0.85, Math.min(1, form))
  }

  reset(track: Track, startT: number, vehicle: Vehicle): void {
    const len = Math.max(1, track.length)
    this.railDist = startT * len
    if (track.def.loop) {
      this.railDist = ((this.railDist % len) + len) % len
    } else {
      this.railDist = Math.max(0, Math.min(len * 0.02, startT * len))
    }
    // Přirozený náběh ze stání (launchFeel).
    this.launch = 0
    this.pace = 0
    this.paceDebt = 0
    this.leanSmooth = 0
    this.fsTricksThisLap = 0
    this.fsLapIndex = -1
    this.fsTrickCd = 0
    // seasonForm drží Game.applyAiDifficulty — nerestartovat na 1
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

    const wrap = (u: number) => (loop ? ((u % 1) + 1) % 1 : Math.min(0.999, u))
    const cornerNow = cornerFactor(track, t, loop)
    const cornerMid = cornerFactor(track, wrap(t + 0.035), loop)
    const cornerFar = cornerFactor(track, wrap(t + 0.07), loop)
    // Brzdění do zatáčky — výhled ano; náklon bere spíš „teď + těsně za“
    const corner = Math.max(cornerNow, cornerMid * 0.9, cornerFar * 0.7)

    const slotSpeed = SLOT_SPEED[this.slot] ?? 1
    const diffScale = Math.max(0.2, this.difficulty.speedScale)
    const capScale =
      speedCapMultFor(vehicle.kind) / Math.max(0.05, speedCapMultFor('street'))
    const paceMs =
      learnedTargetPaceMs(track.def.id, track.def.targetPaceMs) ?? track.def.targetPaceMs

    let cruise: number
    if (paceMs && paceMs > 800) {
      const base = (len / (paceMs / 1000)) * slotSpeed * diffScale * capScale
      cruise = base * CORNER_COMP
    } else {
      const playerRef = Math.max(12, Math.abs(playerSpeed))
      const eq = equilibriumSpeed(vehicle)
      const trackMult = Math.max(0.35, track.aiSpeedMult ?? 1)
      cruise =
        (eq * 0.55 + playerRef * 0.45) * PACE_BOOST * diffScale * slotSpeed * trackMult
    }

    if (!Number.isFinite(cruise) || cruise < 6) cruise = 6

    // Shift vozidla: lehce stáhni baseline, ať bursty drží průměr ≈ targetPaceMs
    const shiftCapable = vehicle.hasShiftSpecial()
    if (shiftCapable) cruise /= AI_SHIFT_PACE_FACTOR

    // Tvrdý strop = katalogové max daného peklostroje (AI nesmí jet rychleji než hráč s tím vozem)
    const catalogCapMs = catalogMaxKmh(vehicle.kind) / 3.6
    const physicsCap = vehicleCruiseCap(vehicle)
    const hardCap = Math.max(8, Math.min(catalogCapMs, physicsCap) * 0.995)
    cruise = Math.min(cruise, hardCap)

    const feel = launchFeelFor(vehicle.kind)
    const form = this.seasonForm
    // Nižší forma = delší náběh, menší startFrac, slabší accel (agresivita).
    const launchDur = feel.durationSec * (1 + (1 - form) * 0.35)
    const startFrac = feel.startFrac * (0.82 + 0.18 * form)
    const accelBlend = feel.accelBlend * (0.78 + 0.22 * form)
    const prevLaunch = this.launch
    this.launch = Math.min(1, this.launch + dt / Math.max(0.35, launchDur))
    // Ease-out náběh: pomalu ze startu, plný cruise až ke konci launch okna.
    // startFrac jen v rámci hardCap — AI nestartuje nad maxem vozidla.
    const launchEase = 1 - Math.pow(1 - this.launch, 2.15)
    // Nižší forma = víc brzdí do zatáčky (chyby / opatrnost).
    const cornerSlow = 1 - corner * (0.4 + (1 - form) * 0.14)
    const launchFrac = Math.min(1, startFrac + (1 - startFrac) * launchEase)
    let target = Math.min(hardCap, cruise * launchFrac) * Math.max(0.38, cornerSlow)

    // Ideální tempo (okamžitý cruise) vs reálný target → dluh vzdálenosti
    const ideal = cruise * Math.max(0.38, cornerSlow)
    if (this.launch < 1 || prevLaunch < 1) {
      this.paceDebt += Math.max(0, (ideal - target) * dt)
    }
    // Splácení: mírně nad cruise, dokud dluh nezmizí — průměrný čas ≈ targetPaceMs
    // nikdy ale přes hardCap (pravidla peklostroje). Nižší forma = pomalejší catch-up.
    if (this.paceDebt > 0.05 && this.launch >= 0.55) {
      const headroom = Math.max(0, hardCap - target)
      const repay = Math.min(
        this.paceDebt * (0.4 + 0.15 * form),
        cruise * (0.1 + 0.04 * form),
        headroom,
      )
      target += repay
      this.paceDebt = Math.max(0, this.paceDebt - repay * dt)
    }

    target = Math.min(target, hardCap)

    if (target >= this.pace) {
      const blend = Math.min(1, accelBlend * dt)
      this.pace += (target - this.pace) * blend
    } else {
      const brakeBlend = Math.min(1, (4.2 + corner * 5) * dt)
      this.pace += (target - this.pace) * brakeBlend
    }
    this.pace = Math.min(this.pace, hardCap)

    const shiftHold =
      shiftCapable && this.launch >= 0.45 && wantAiShiftBurst(t, this.slot, corner)
    const shiftMult = vehicle.tickAiShift(dt, shiftHold)
    const outPace = Math.min(hardCap, this.pace * Math.max(1, shiftMult))

    const prevPace = this.pace
    this.railDist += outPace * dt
    if (!loop && this.railDist > len) this.railDist = len
    vehicle.physics.speed = outPace

    // Náklon: teď + krátký výhled, silný výjezd (hold za apexem)
    const cornerExit = cornerFactor(track, wrap(t - 0.028), loop)
    const leanCorner = Math.max(cornerNow * 1.05, cornerMid * 0.55, cornerExit * 0.85)
    const turn = turnSign(track, t, loop)
    const bike = vehicle.wantsBikeLean()
    const leanAmt = leanCorner * Math.min(1.35, this.pace / 40)
    const leanDir = bike ? -turn : turn
    const leanTarget = leanDir * leanAmt
    // Asymetrie: do náklonu rychleji, výjezd / srovnání pomaleji (hlavně moto)
    const rising = Math.abs(leanTarget) > Math.abs(this.leanSmooth)
    const leanTau = bike ? (rising ? 0.22 : 0.72) : rising ? 0.18 : 0.35
    const leanK = 1 - Math.exp(-dt / leanTau)
    this.leanSmooth += (leanTarget - this.leanSmooth) * leanK

    vehicle.physics.angularVel = this.leanSmooth * (bike ? 1.15 : 0.55)
    vehicle.physics.latVel = this.leanSmooth * this.pace * (bike ? 0.08 : 0.03)

    if (vehicle.kind === 'monster' || vehicle.kind === 'truck' || vehicle.kind === 'tank') {
      const boosting =
        shiftHold || this.pace > prevPace + 0.05 || (this.pace > 8 && corner < SHIFT_CORNER_MAX)
      vehicle.setTurboInput(boosting ? 1 : 0.15, dt)
    } else {
      vehicle.setTurboInput(0, dt)
    }
    if (vehicle.isBoardKind()) {
      // AI pořád odráží / šlape (vizuál); tempo řeší rail + Shift burst
      vehicle.setPushVisual(shiftHold ? 1 : 0.85, dt)
    }
    this.tickFreestyleTricks(dt, vehicle, track)
    this.place(vehicle, track, dt)
  }

  /**
   * FS soupeři: ≥4 triky / kolo (etapa = 1 „kolo“);
   * slot 1 (nejrychlejší) ≥6 za vyšší body.
   */
  private tickFreestyleTricks(dt: number, vehicle: Vehicle, track: Track): void {
    if (this.slot <= 0 || !isFsBoardKind(vehicle.kind)) return
    vehicle.freestyleOn = true
    this.fsTrickCd = Math.max(0, this.fsTrickCd - dt)

    const loop = track.def.loop
    const len = Math.max(1, track.length)
    let progress = this.railDist / len
    if (loop) progress = ((progress % 1) + 1) % 1
    else progress = Math.max(0, Math.min(1, progress))

    const lapIdx = loop ? Math.floor(Math.max(0, this.railDist) / len) : 0
    if (lapIdx !== this.fsLapIndex) {
      this.fsLapIndex = lapIdx
      this.fsTricksThisLap = 0
    }

    // Slot 1 = nejlepší AI (≥6), 2–3 ≥4
    const targetCount = this.slot === 1 ? 6 : 4
    const list = freestyleList(vehicle.kind)
    if (!list.length) {
      vehicle.tickAiFreestyle(dt, null)
      return
    }

    let wantLetter: string | null = null
    if (
      !vehicle.trickLocked &&
      this.fsTrickCd <= 0 &&
      this.fsTricksThisLap < targetCount &&
      this.launch >= 0.35
    ) {
      // Kolik triků „má být hotovo“ podle postupu (dohání zpoždění)
      const due = Math.min(
        targetCount,
        Math.floor(progress * targetCount + (loop ? 0.02 : 0.05)),
      )
      if (this.fsTricksThisLap < due || progress > 0.92 + this.slot * 0.01) {
        const sorted = [...list].sort((a, b) => a.difficulty - b.difficulty)
        // Slot 1 = nejvyšší body; 2 střed+; 3 střed−
        const pick =
          this.slot === 1
            ? sorted[Math.min(sorted.length - 1, sorted.length - 1 - (this.fsTricksThisLap % 3))]!
            : this.slot === 2
              ? sorted[
                  Math.min(
                    sorted.length - 1,
                    Math.floor(sorted.length * 0.55) + (this.fsTricksThisLap % 3),
                  )
                ]!
              : sorted[Math.min(sorted.length - 1, 2 + (this.fsTricksThisLap % 4))]!
        wantLetter = pick.letter
        this.fsTricksThisLap += 1
        this.fsTrickCd = Math.max(1.15, pick.dur + 0.3)
      }
    }

    vehicle.tickAiFreestyle(dt, wantLetter)
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

function vehicleCruiseCap(vehicle: Vehicle): number {
  const { downforce, speedCapMult } = vehicle.physics.tuning
  return (118 + downforce * 5) * 1.3 * (speedCapMult || 1)
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
  const side = slot % 2 === 0 ? -1 : 1
  return side * Math.min(3.4, halfWidth * 0.32)
}

/** 1–2 Shift okna / kolo, rozfázovaná podle slotu, jen na rovince. */
function wantAiShiftBurst(lapT: number, slot: number, corner: number): boolean {
  if (corner > SHIFT_CORNER_MAX) return false
  const s = Math.max(1, slot | 0)
  const a = (0.2 + s * 0.11) % 1
  const b = (0.62 + s * 0.07) % 1
  return nearFrac(lapT, a, SHIFT_HOLD_FRAC) || nearFrac(lapT, b, SHIFT_HOLD_FRAC)
}

function nearFrac(t: number, center: number, half: number): boolean {
  let d = Math.abs(t - center)
  if (d > 0.5) d = 1 - d
  return d <= half
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

function turnSign(track: Track, t: number, loop: boolean): number {
  const wrap = (u: number) => (loop ? ((u % 1) + 1) % 1 : Math.min(0.999, u))
  const a = track.sample(t)
  const b = track.sample(wrap(t + 0.05))
  const cross = a.tangent.x * b.tangent.z - a.tangent.z * b.tangent.x
  return Math.sign(cross) || 0
}
