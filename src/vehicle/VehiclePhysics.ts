export type VehicleTuning = {
  power: number
  brakeForce: number
  downforce: number
  grip: number
  drag: number
  mass: number
  /** Násobitel ostrosti řízení */
  steerResp: number
  /** Násobitel hard capu top speed (formule ~1.4) */
  speedCapMult: number
}

/** Formula-style defaults: planted grip, strong aero, stable brakes. */
export const DEFAULT_TUNING: VehicleTuning = {
  power: 60.5,
  brakeForce: 90,
  downforce: 1.25,
  grip: 1.22,
  drag: 0.18,
  mass: 1,
  steerResp: 1,
  speedCapMult: 1,
}

export type VehicleControls = {
  throttle: number
  brake: number
  steer: number
  /** Shift — skate boost / monster wheelie */
  push?: number
  /** Tab — plynulé zrychlení 2 s */
  tab?: number
  /** Freestyle: právě stisknuté písmeno A–Z (nebo null) */
  trickLetter?: string | null
  /** Drift e-brake (Space na drift mapách) */
  ebrake?: number
}

export class VehiclePhysics {
  x = 0
  z = 0
  heading = 0
  speed = 0
  /** Boční smyk (kladný = vpravo) */
  latVel = 0
  angularVel = 0
  gear = 1
  /**
   * auto · manual (+5 %) · clutch (+20 %, řadí jen se spojkou).
   * `manualShift` = true pro manual i clutch (kompatibilita).
   */
  transmission: 'auto' | 'manual' | 'clutch' = 'auto'
  /** Povrch tratě — 1 suchý, ~0.65 led (hratelné) */
  surfaceGrip = 1
  /** Mírná stabilizace smyku z nastavení ovládání. */
  stabilityAssist = false
  /** NFS Carbon drift (jen drift tratě, ne freestyle). */
  driftMode = false
  /** Nasbírané drift body (float → zaokrouhlí Vehicle). */
  driftPoints = 0
  private driftChain = 0
  private driftLive = false

  get manualShift(): boolean {
    return this.transmission !== 'auto'
  }

  set manualShift(on: boolean) {
    if (!on) this.transmission = 'auto'
    else if (this.transmission === 'auto') this.transmission = 'manual'
  }

  private speedBonus(): number {
    if (this.transmission === 'clutch') return 1.2
    if (this.transmission === 'manual') return 1.05
    return 1
  }

  readonly tuning: VehicleTuning

  constructor(tuning: Partial<VehicleTuning> = {}) {
    this.tuning = { ...DEFAULT_TUNING, ...tuning }
  }

  applyTuning(tuning: Partial<VehicleTuning>): void {
    Object.assign(this.tuning, tuning)
  }

  reset(x: number, z: number, heading: number): void {
    this.x = x
    this.z = z
    this.heading = heading
    this.speed = 0
    this.latVel = 0
    this.angularVel = 0
    this.gear = 1
    this.driftPoints = 0
    this.driftChain = 0
    this.driftLive = false
  }

  /** `clutchIn` musí být true u režimu spojky. */
  shiftUp(clutchIn = true): void {
    if (!this.manualShift) return
    if (this.transmission === 'clutch' && !clutchIn) return
    if (this.gear >= 1 && this.gear < 7) this.gear += 1
  }

  shiftDown(clutchIn = true): void {
    if (!this.manualShift) return
    if (this.transmission === 'clutch' && !clutchIn) return
    if (this.gear > 1) this.gear -= 1
  }

  private idealGear(absSpeed: number): number {
    if (absSpeed < 22) return 1
    if (absSpeed < 48) return 2
    if (absSpeed < 78) return 3
    if (absSpeed < 115) return 4
    if (absSpeed < 150) return 5
    if (absSpeed < 190) return 6
    return 7
  }

  update(dt: number, controls: VehicleControls): void {
    const { power, brakeForce, downforce, grip, drag, mass, speedCapMult, steerResp } = this.tuning
    const absSpeed = Math.abs(this.speed)
    const surf = Math.max(0.45, this.surfaceGrip)
    const icy = surf < 0.85
    const manualBonus = this.speedBonus()
    const ideal = this.idealGear(absSpeed)
    const mismatch = this.manualShift ? Math.abs(this.gear - ideal) : 0
    const gearFactor = !this.manualShift ? 1 : mismatch === 0 ? 1 : mismatch === 1 ? 0.55 : 0.28

    const forwardRatio =
      this.speed >= 0
        ? this.speed < 18
          ? 1.25
          : this.speed < 40
            ? 1.12
            : this.speed < 65
              ? 1.0
              : this.speed < 95
                ? 0.9
                : this.speed < 125
                  ? 0.8
                  : this.speed < 160
                    ? 0.72
                    : 0.65
        : 0.85

    const cruiseMax = (118 + downforce * 5) * 1.3 * speedCapMult * manualBonus
    const accel = (controls.throttle * power * forwardRatio * gearFactor * manualBonus) / mass
    const brake = (controls.brake * brakeForce) / mass
    const reversePower = (power * 0.4) / mass

    // Max = strop jen při plynu dopředu. Shift / turbo / triky můžou jet nad ním
    // (aplikují se až po physics.update ve Vehicle).
    if (controls.throttle > 0) {
      if (this.speed < -0.4) {
        this.speed += brakeForce * 0.95 * dt
      } else if (this.speed < cruiseMax) {
        this.speed += accel * dt
        if (this.speed > cruiseMax) this.speed = cruiseMax
      }
    }

    if (controls.brake > 0) {
      if (this.speed > 1.2) {
        this.speed -= brake * dt
      } else if (this.speed > 0 && this.speed <= 1.2) {
        this.speed = Math.max(0, this.speed - brake * dt)
        if (this.speed < 0.15) {
          this.speed -= reversePower * controls.brake * dt
        }
      } else {
        this.speed -= reversePower * controls.brake * dt
      }
    }

    const steerLoad = Math.abs(controls.steer)
    const aero = (drag + downforce * 0.045 * (absSpeed / 55)) * (0.75 + steerLoad * 0.35)
    if (absSpeed > 0.05) {
      this.speed -= Math.sign(this.speed) * aero * absSpeed * dt
    }
    // Po boostu: jemně zpět k cruise max (boost ve Vehicle pak zase zatlačí výš).
    if (this.speed > cruiseMax) {
      const over = this.speed - cruiseMax
      this.speed -= over * (1 - Math.exp(-1.4 * dt))
    }
    if (Math.abs(this.speed) < 0.05 && controls.throttle === 0 && controls.brake === 0) {
      this.speed = 0
    }

    const maxReverse = 16
    // Tab/Alt boost strop (+45 % nad cruise) — skate/kolo
    const boostCeil = cruiseMax * 1.45
    this.speed = Math.max(-maxReverse, Math.min(boostCeil, this.speed))

    if (!this.manualShift) {
      if (this.speed < -0.35) this.gear = -1
      else this.gear = this.idealGear(Math.abs(this.speed))
    } else if (this.speed < -0.35) {
      this.gear = -1
    } else if (this.gear < 1) {
      this.gear = 1
    }

    const aeroGrip = grip * surf * (0.9 + downforce * 0.35 * Math.min(1, absSpeed / 55))
    const steerInput = controls.steer

    // Na ledě drž řídicí odezvu — smyk řeší latVel, ne mrtvý volant
    const steerAuth = icy ? Math.max(0.92, aeroGrip * 1.15) : aeroGrip

    const speedGate = absSpeed < 4 ? Math.max(0.4, absSpeed / 4) : 1
    const topSpeedScale = 1 / (1 + absSpeed * (icy ? 0.01 : 0.012))
    const maxYawRate = (icy ? 1.95 : 1.85) * steerAuth * steerResp
    const targetYaw = steerInput * maxYawRate * speedGate * (0.5 + 0.5 * topSpeedScale)

    const steerLerp = 1 - Math.exp(-(icy ? 8 : 9) * (0.75 + steerResp * 0.25) * dt)
    this.angularVel += (targetYaw - this.angularVel) * steerLerp

    const load = Math.abs(steerInput) * absSpeed
    const gripBudget = (icy ? 16 : 22) * aeroGrip
    if (load > gripBudget && absSpeed > 14) {
      const push = Math.min(0.4, (load - gripBudget) / (load + 1))
      if (icy) {
        // Mírný drift, ne spin
        this.angularVel *= 1 + push * 0.22
        this.latVel += steerInput * absSpeed * push * 0.18 * dt
        this.speed *= 1 - push * 0.22 * dt
      } else {
        this.angularVel *= 1 - push * 0.35
        this.speed *= 1 - push * 0.55 * dt
      }
    }

    if (icy && controls.throttle > 0.65 && Math.abs(steerInput) > 0.35 && absSpeed > 22) {
      this.latVel += steerInput * absSpeed * 0.1 * dt
      this.angularVel += steerInput * 0.22 * dt
    }

    if (controls.brake > 0.5 && Math.abs(steerInput) > 0.2 && absSpeed > 20) {
      this.angularVel += steerInput * (icy ? 0.4 : 0.35) * dt
      if (icy) this.latVel += steerInput * absSpeed * 0.06 * dt
    }

    // NFS Carbon e-brake drift — Space na drift mapách
    const ebrake = controls.ebrake ?? 0
    if (this.driftMode && ebrake > 0.5 && absSpeed > 12) {
      const dir =
        Math.abs(steerInput) > 0.08
          ? steerInput
          : Math.sign(this.angularVel || this.latVel || 1)
      this.angularVel += dir * 2.55 * dt
      this.latVel += dir * absSpeed * 0.34 * dt
      this.speed *= Math.exp(-0.62 * dt)
      if (controls.throttle > 0.25) {
        this.angularVel *= 1 + 0.22 * dt
        this.latVel *= 1 + 0.1 * dt
        this.speed += (controls.throttle * power * 0.22 * dt) / mass
      }
    }

    this.heading += this.angularVel * dt

    if (Math.abs(steerInput) > 0.25 && absSpeed > 12) {
      this.speed *= 1 - Math.abs(steerInput) * (0.18 + downforce * 0.03) * (icy ? 0.7 : 1) * dt
    }

    // Rychlejší návrat z bočního smyku = čitelnější řízení
    // V aktivním driftu pomalejší „lepivost“ (Carbon chain)
    const assist = this.stabilityAssist && !this.driftMode ? 2.4 : 0
    const driftHold = this.driftMode && ebrake > 0.5 ? 0.45 : 1
    const latDecay = Math.exp(-(3.2 + grip * surf * 6.5 * driftHold + assist) * dt)
    this.latVel *= latDecay
    if (this.stabilityAssist && !this.driftMode) this.angularVel *= Math.exp(-1.1 * dt)
    const latCap = absSpeed * (this.driftMode ? 0.55 : icy ? 0.38 : 0.28)
    if (Math.abs(this.latVel) > latCap) {
      this.latVel = Math.sign(this.latVel) * latCap
    }

    this.updateDriftScore(dt, absSpeed, ebrake)

    const forwardX = Math.sin(this.heading)
    const forwardZ = Math.cos(this.heading)
    const rightX = Math.cos(this.heading)
    const rightZ = -Math.sin(this.heading)
    this.x += forwardX * this.speed * dt + rightX * this.latVel * dt
    this.z += forwardZ * this.speed * dt + rightZ * this.latVel * dt
  }

  get speedKmh(): number {
    return Math.abs(this.speed) * 3.6
  }

  get driftActive(): boolean {
    return this.driftLive
  }

  private updateDriftScore(dt: number, absSpeed: number, ebrake: number): void {
    if (!this.driftMode) {
      this.driftLive = false
      this.driftChain = Math.max(0, this.driftChain - dt * 2)
      return
    }
    const slip = Math.abs(Math.atan2(this.latVel, Math.max(1.2, absSpeed)))
    const drifting = absSpeed > 15 && slip > 0.16 && (ebrake > 0.35 || slip > 0.28)
    this.driftLive = drifting
    if (drifting) {
      this.driftChain = Math.min(4.5, this.driftChain + dt * 0.55)
      const mult = 1 + this.driftChain
      this.driftPoints += absSpeed * slip * mult * 14 * dt
    } else {
      this.driftChain = Math.max(0, this.driftChain - dt * 1.4)
    }
  }

  /**
   * Cruise max (km/h na HUD) — jen plyn dopředu.
   * Shift / turbo / triky můžou krátkodobě jet výš (až ~1.45×).
   */
  get maxSpeedAbs(): number {
    const { downforce, speedCapMult } = this.tuning
    return (118 + downforce * 5) * 1.3 * (speedCapMult || 1) * this.speedBonus()
  }
}
