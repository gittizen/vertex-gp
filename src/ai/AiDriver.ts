import type { DifficultyDef } from './Difficulty'
import { learnedTargetPaceMs } from './CommunityLearning'
import type { Track } from '../track/Track'
import type { VehicleKind } from '../track/TrackDefs'
import type { Vehicle } from '../vehicle/Vehicle'
import { catalogMaxKmh, speedCapMultFor } from '../vehicle/VehicleProfiles'

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
type LaunchFeel = { durationSec: number; startFrac: number; accelBlend: number }

function launchFeelFor(kind: VehicleKind): LaunchFeel {
  switch (kind) {
    case 'formula':
      return { durationSec: 1.35, startFrac: 0.22, accelBlend: 2.4 }
    case 'moto':
      return { durationSec: 1.55, startFrac: 0.18, accelBlend: 2.2 }
    case 'harley':
      return { durationSec: 1.75, startFrac: 0.16, accelBlend: 2.0 }
    case 'kroska':
      return { durationSec: 1.35, startFrac: 0.2, accelBlend: 2.5 }
    case 'street':
    case 'limo':
      return { durationSec: 2.05, startFrac: 0.14, accelBlend: 1.85 }
    case 'monster':
    case 'truck':
      return { durationSec: 2.85, startFrac: 0.08, accelBlend: 1.45 }
    case 'tank':
      return { durationSec: 3.4, startFrac: 0.05, accelBlend: 1.2 }
    case 'bike':
      return { durationSec: 1.9, startFrac: 0.12, accelBlend: 1.7 }
    case 'skate':
      return { durationSec: 2.35, startFrac: 0.08, accelBlend: 1.5 }
    case 'scooter':
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

  constructor(slot: number, difficulty: DifficultyDef) {
    this.slot = slot
    this.difficulty = difficulty
  }

  setDifficulty(d: DifficultyDef): void {
    this.difficulty = d
  }

  reset(track: Track, startT: number, vehicle: Vehicle): void {
    const len = Math.max(1, track.length)
    this.railDist = startT * len
    if (track.def.loop) {
      this.railDist = ((this.railDist % len) + len) % len
    } else {
      this.railDist = Math.max(0, Math.min(len * 0.02, startT * len))
    }
    this.launch = 0
    this.pace = 0
    this.paceDebt = 0
    this.leanSmooth = 0
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
    const prevLaunch = this.launch
    this.launch = Math.min(1, this.launch + dt / Math.max(0.35, feel.durationSec))
    // Ease-out náběh: pomalu ze startu, plný cruise až ke konci launch okna
    const launchEase = 1 - Math.pow(1 - this.launch, 2.15)
    const cornerSlow = 1 - corner * 0.4
    let target =
      cruise * (feel.startFrac + (1 - feel.startFrac) * launchEase) * Math.max(0.38, cornerSlow)

    // Ideální tempo (okamžitý cruise) vs reálný target → dluh vzdálenosti
    const ideal = cruise * Math.max(0.38, cornerSlow)
    if (this.launch < 1 || prevLaunch < 1) {
      this.paceDebt += Math.max(0, (ideal - target) * dt)
    }
    // Splácení: mírně nad cruise, dokud dluh nezmizí — průměrný čas ≈ targetPaceMs
    // nikdy ale přes hardCap (pravidla peklostroje)
    if (this.paceDebt > 0.05 && this.launch >= 0.55) {
      const headroom = Math.max(0, hardCap - target)
      const repay = Math.min(this.paceDebt * 0.55, cruise * 0.14, headroom)
      target += repay
      this.paceDebt = Math.max(0, this.paceDebt - repay * dt)
    }

    target = Math.min(target, hardCap)

    if (target >= this.pace) {
      const blend = Math.min(1, feel.accelBlend * dt)
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
    if (vehicle.kind === 'skate' || vehicle.kind === 'bike') {
      // AI pořád odráží / šlape (vizuál); tempo řeší rail + Shift burst
      vehicle.setPushVisual(shiftHold ? 1 : 0.85, dt)
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
