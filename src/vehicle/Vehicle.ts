import * as THREE from 'three'
import type { VehicleKind } from '../track/TrackDefs'
import { createVehicleMesh } from './VehicleMeshes'
import { DEFAULT_VEHICLE_LOOK, type VehicleLook } from './VehicleLook'
import { VehiclePhysics, type VehicleControls, type VehicleTuning } from './VehiclePhysics'
import type { Track } from '../track/Track'
import {
  freestyleList,
  type FreestyleTrickDef,
} from '../freestyle/FreestyleTricks'
import { evalTrickAnim } from '../freestyle/TrickAnim'

export type DriverInfo = {
  id: string
  name: string
  team: string
  color: number
  isPlayer: boolean
  /** true = AI výplň (nečeká se na ni v multiplayer finish) */
  isBot?: boolean
}

export class Vehicle {
  mesh: THREE.Group
  readonly physics: VehiclePhysics
  readonly info: DriverInfo
  kind: VehicleKind = 'street'
  neonColor = DEFAULT_VEHICLE_LOOK.neon
  wheelColor = DEFAULT_VEHICLE_LOOK.wheel
  riderColor = DEFAULT_VEHICLE_LOOK.rider
  helmColor = DEFAULT_VEHICLE_LOOK.helm
  lap = 0
  checkpoint = 0
  raceDistance = 0
  finished = false
  finishTime = 0
  bestLapMs = Infinity
  currentLapStart = 0
  armedForLap = false
  /** Cache progress pro rychlý constrain / AI */
  trackT = 0
  /** Výška vozovky (kopce) */
  groundY = 0
  /** 0–1 turbo (monster) — pro audio */
  turboAmount = 0
  /** 0–1 skate Shift / monster wheelie — HUD */
  pushAmount = 0
  /** 0–1 Tab/Alt boost — HUD flash */
  tabBoostAmount = 0
  /** Monster: jízda po zadních (Shift) */
  wheelie = false
  /** World yaw přívěsu (tahač) — sleduje stopu hitchi */
  private trailerHeading = 0
  private trailerAxleX = 0
  private trailerAxleZ = 0
  private trailerReady = false
  /** Pád (moto/skate/bike) nebo crash formule — nasedání / objevení */
  fallen = false
  /** Solo nesmrtelnost — beginFall no-op. */
  immortal = false
  /** true = formule bouchla (HUD); false = pád ze sedla */
  crashBurst = false
  remountLeft = 0
  private pitch = 0
  private lean = 0
  private wheeliePitch = 0
  /** Výška nad tratí při triku / rampě */
  private airY = 0
  private pushPhase = 0
  private recoverLeft = 0
  private bounceCd = 0
  /** Plynulé zpomalení při zatáčení 0–1 */
  private turnSlow = 0
  /** Tab boost: čas držení + bazální rychlost */
  private tabHold = 0
  private tabBase = 0
  /**
   * 0–1 naplnění Shift boostu.
   * ~1 s nahoru při držení, ~1 s dolů po puštění (brzda zrychlí útlum).
   */
  private shiftBoost01 = 0
  private static readonly SHIFT_RAMP_SEC = 1
  /** Freestyle zapnutý ze závodu */
  freestyleOn = false
  /** Body z triků v aktuálním závodě */
  trickPoints = 0
  /** Drift body (Kasárny / drift soutěž) */
  driftPoints = 0
  lastTrickLabel = ''
  /** Jednorázový impuls pro kameru / SFX (náraz / pád). */
  private impactImpulse = 0
  private trick: string | 'none' = 'none'
  private trickDef: FreestyleTrickDef | null = null
  private trickT = 0
  private trickDur = 0
  /** Dočasný náklon celého meshe během triku */
  private trickBody = { pitch: 0, roll: 0, yaw: 0 }
  private fallSpin = 0
  private fallSlide = 0
  /** Skok z rampy (všechny peklostroje) */
  private rampAirborne = false
  private rampVy = 0
  private rampCd = 0
  /**
   * Hood kamera ve stylu Forza — na kapotě (ne ve vzduchu před autem):
   * `hoodZ` / `hoodY` v lokálním prostoru meshe (+Z dopředu).
   */
  hoodCam = { hoodZ: 1.2, hoodY: 0.85 }
  /**
   * Chase framing vs street auto (~1 = stejné vyplnění záběru).
   * back/height škálují vzdálenost kamery; lookY výšku pohledu.
   */
  camFit = { back: 1, height: 1, lookY: 0.72 }
  /** Měkký contact stín pod autem — stabilní i když directional shadow map blbne. */
  private contactShadow: THREE.Mesh

  constructor(info: DriverInfo, tuning?: Partial<VehicleTuning>, kind: VehicleKind = 'street') {
    this.info = info
    this.physics = new VehiclePhysics(tuning)
    this.kind = kind
    this.mesh = createVehicleMesh(kind, info.color)
    this.contactShadow = new THREE.Mesh(
      new THREE.CircleGeometry(1.55, 24),
      new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.32,
        depthWrite: false,
      }),
    )
    this.contactShadow.rotation.x = -Math.PI / 2
    this.contactShadow.renderOrder = 1
    this.applyMeshShadows()
    this.bakeHoodCam()
  }

  setKind(kind: VehicleKind, scene?: THREE.Scene): void {
    if (this.kind === kind) {
      this.applyLook(this.getLook())
      return
    }
    const parent = this.mesh.parent
    parent?.remove(this.mesh)
    disposeGroup(this.mesh)
    this.kind = kind
    this.mesh = createVehicleMesh(kind, this.info.color, this.neonColor)
    this.applyLook(this.getLook())
    this.applyMeshShadows()
    this.bakeHoodCam()
    if (parent) parent.add(this.mesh)
    else scene?.add(this.mesh)
  }

  getLook(): VehicleLook {
    return {
      body: this.info.color,
      neon: this.neonColor,
      wheel: this.wheelColor,
      rider: this.riderColor,
      helm: this.helmColor,
    }
  }

  applyLook(look: VehicleLook): void {
    this.setColor(look.body)
    this.setNeon(look.neon)
    this.setWheelColor(look.wheel)
    this.setRiderColor(look.rider)
    this.setHelmColor(look.helm)
  }

  /** Forza Hood + chase framing podle siluety (referenční street auto). */
  private bakeHoodCam(): void {
    this.mesh.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(this.mesh)
    const size = new THREE.Vector3()
    box.getSize(size)
    const frontZ = Math.max(0.5, box.max.z)
    const h = Math.max(0.4, size.y)
    // Na kapotě: ~55 % k předku, výška ~62 % siluety (nad kapotou, pod střechou)
    const hoodZ = box.min.z + (frontZ - box.min.z) * 0.72
    const hoodY = box.min.y + h * 0.58
    this.hoodCam = { hoodZ, hoodY: Math.max(0.35, hoodY) }

    // Referenční street: délka ~4.4, výška ~1.25 — stejné vyplnění záběru
    const refLen = 4.4
    const refH = 1.25
    const len = Math.max(1.2, size.z)
    const height = Math.max(0.6, size.y)
    // Délka váží méně (kamion), výška/šířka víc — aby skate/bike nebyly moc daleko
    const back = clamp(0.55 * (len / refLen) + 0.45 * (height / refH), 0.72, 2.15)
    const hFit = clamp(height / refH, 0.75, 2.05)
    this.camFit = {
      back,
      height: hFit,
      lookY: clamp(0.45 + height * 0.28, 0.55, 2.4),
    }
  }

  private shadowCast = false

  private applyMeshShadows(): void {
    this.mesh.traverse((obj) => {
      const m = obj as THREE.Mesh
      if (!m.isMesh || m === this.contactShadow) return
      m.castShadow = this.shadowCast
      m.receiveShadow = this.shadowCast
    })
    this.contactShadow.castShadow = false
    this.contactShadow.receiveShadow = false
  }

  /** Zapne/vypne stín auta (vizuál Shadows) — bez terénních z-fightů. */
  setCastShadow(on: boolean): void {
    this.shadowCast = on
    this.applyMeshShadows()
  }

  reset(x: number, z: number, heading: number, raceTimeMs: number): void {
    this.physics.reset(x, z, heading)
    this.lap = 0
    this.checkpoint = 0
    this.raceDistance = 0
    this.finished = false
    this.finishTime = 0
    this.bestLapMs = Infinity
    this.currentLapStart = raceTimeMs
    this.armedForLap = false
    this.trackT = 0
    this.groundY = 0
    this.pitch = 0
    this.lean = 0
    this.trailerHeading = heading
    this.trailerReady = false
    this.turboAmount = 0
    this.pushAmount = 0
    this.wheelie = false
    this.wheeliePitch = 0
    this.tabBoostAmount = 0
    this.impactImpulse = 0
    this.fallen = false
    this.crashBurst = false
    this.remountLeft = 0
    this.airY = 0
    this.pushPhase = 0
    this.turnSlow = 0
    this.tabHold = 0
    this.tabBase = 0
    this.shiftBoost01 = 0
    this.trickPoints = 0
    this.driftPoints = 0
    this.physics.driftPoints = 0
    this.lastTrickLabel = ''
    this.trick = 'none'
    this.trickDef = null
    this.trickT = 0
    this.trickDur = 0
    this.trickBody = { pitch: 0, roll: 0, yaw: 0 }
    this.fallSpin = 0
    this.fallSlide = 0
    this.recoverLeft = 0
    this.bounceCd = 0
    this.rampAirborne = false
    this.rampVy = 0
    this.rampCd = 0
    this.syncTurboVisual(0)
    this.syncPushVisual(0)
    this.resetBoardPivot()
    this.resetOlliePose()
    this.setRiderVisible(true)
    this.mesh.visible = true
    this.syncMesh()
  }

  /** Během triku nejde startovat další; řízení FS = 50 %. */
  get trickLocked(): boolean {
    return this.trick !== 'none'
  }

  /** Pád jen moto / harley / skate / kolo. */
  canCrashFall(): boolean {
    return this.isMotoKind() || this.kind === 'skate' || this.kind === 'bike'
  }

  /** Klasická / chopper / cross motorka. */
  isMotoKind(): boolean {
    return this.kind === 'moto' || this.kind === 'harley' || this.kind === 'kroska'
  }

  /** Formule: bouračka při tvrdém nárazu. */
  canFormulaCrash(): boolean {
    return this.kind === 'formula'
  }

  isBoardKind(): boolean {
    return this.kind === 'skate' || this.kind === 'bike'
  }

  /** Monster / kamion / tank — turbo + wheelie. */
  isMonsterFamily(): boolean {
    return this.kind === 'monster' || this.kind === 'truck' || this.kind === 'tank'
  }

  /**
   * Tachometr — vždy skutečná rychlost (m/s × 3.6).
   * Stejná fyzická rychlost = stejné číslo u auta i skatu. Žádný přepočet podle peklostroje.
   */
  get displaySpeedKmh(): number {
    return Math.round(Math.abs(this.physics.speed) * 3.6)
  }

  /** Cruise max (plyn dopředu) — pro popisy / UI, ne přepočet tachometru. */
  get displayMaxKmh(): number {
    return Math.round(this.physics.maxSpeedAbs * 3.6)
  }

  update(dt: number, controls: VehicleControls, track: Track): void {
    if (this.finished) {
      this.physics.speed *= Math.exp(-2 * dt)
      this.physics.latVel *= Math.exp(-3 * dt)
      this.turboAmount = Math.max(0, this.turboAmount - dt * 3)
      this.pushAmount = Math.max(0, this.pushAmount - dt * 3)
      this.syncTurboVisual(this.turboAmount)
      this.syncPushVisual(this.pushAmount)
      this.syncMesh(dt)
      return
    }

    if (this.fallen) {
      this.updateFall(dt, track)
      return
    }

    this.physics.surfaceGrip = track.def.surfaceGrip
    const board = this.isBoardKind()
    // Freestyle board nikdy drift brzdu; u aut ji drží Game/controlFeel
    if (board || this.freestyleOn) this.physics.driftMode = false
    const locked = this.trickLocked
    const shiftHeld = (controls.push ?? 0) > 0.5
    this.wheelie = (this.isMonsterFamily() || this.isMotoKind()) && shiftHeld
    // FS trik: zatáčení v letu 50 %; ostatní locked = 0
    let steerIn = controls.steer
    if (locked) {
      steerIn = board && this.freestyleOn ? steerIn * 0.5 : 0
    }
    // Wheelie (monster + moto): řízení jen 30 % základu
    if (this.wheelie) steerIn *= 0.3
    const ebrakeIn =
      this.physics.driftMode && !board ? (controls.ebrake ?? 0) : 0
    const shiftKind =
      this.isMonsterFamily() || this.isMotoKind() || this.isBoardKind()
    // Drž push i při dojezdu boostu (~1 s), ať physics nestahuje dřív
    const pushOut =
      shiftKind && (shiftHeld || this.shiftBoost01 > 0.02) ? 1 : shiftHeld ? 1 : 0
    const steered: VehicleControls = {
      throttle: controls.throttle,
      brake: controls.brake,
      steer: steerIn,
      push: pushOut,
      ebrake: ebrakeIn,
      tab: controls.tab,
      trickLetter: controls.trickLetter,
    }
    this.physics.update(dt, steered)
    this.sanitizeMotion()
    this.driftPoints = Math.floor(this.physics.driftPoints)
    this.applyMonsterTurbo(dt, controls)
    this.applyWheelieBoost(dt, shiftHeld, controls.brake ?? 0)
    if (board) {
      this.applySkateTurnSlow(dt, Math.abs(steerIn))
      // Tab/Alt: kadence; Shift: kolo 2× / skate 3× max; triky
      const wantTab = !locked && (controls.tab ?? 0) > 0.5
      this.applySkateTabBoost(dt, wantTab)
      this.applyBoardShiftBoost(dt, !locked && shiftHeld, controls.brake ?? 0)
      // V základu šlape / odráží; Alt/Tab = 3× kadence
      this.updateBoardCadence(dt, wantTab, locked)
      this.applyBoardTricks(dt, controls)
      this.sanitizeMotion()
      this.applySlopeGravity(dt, 0.5)
    } else {
      this.applySlopeGravity(dt, 1)
    }

    this.updateRampJump(dt, track)

    const hit = track.constrain(this.physics.x, this.physics.z, this.trackT)
    this.physics.x = hit.x
    this.physics.z = hit.z
    this.trackT = hit.t
    this.followSurface(track, hit.t, dt)

    if (this.bounceCd > 0) this.bounceCd = Math.max(0, this.bounceCd - dt)
    if (hit.hit && this.bounceCd <= 0 && this.airY < 0.2 && !this.rampAirborne) {
      const absSpd = Math.abs(this.physics.speed)
      const maxSpd = this.physics.maxSpeedAbs
      // FS board: pád jen při nárazu během triku
      const boardFs = this.isBoardKind() && this.freestyleOn
      if (boardFs) {
        if (this.trick !== 'none' && absSpd > maxSpd * 0.4) {
          this.beginFall(false)
        } else {
          this.bounceOffWall(hit.nx, hit.nz)
          this.bounceCd = 0.4
          this.recoverLeft = 3
        }
      } else if (this.canCrashFall() && absSpd > maxSpd * 0.4) {
        this.beginFall(false)
      } else if (this.canFormulaCrash() && absSpd > maxSpd * 0.8) {
        this.beginFall(true)
      } else {
        this.bounceOffWall(hit.nx, hit.nz)
        this.bounceCd = 0.4
        this.recoverLeft = 3
      }
    }
    this.recoverHeading(track, dt)
    this.syncMesh(dt)
  }

  /** Spotřebuj impact impuls (kamera / audio) — 0 když nic. */
  consumeImpact(): number {
    const v = this.impactImpulse
    this.impactImpulse = 0
    return v
  }

  private beginFall(formulaCrash: boolean): void {
    if (this.immortal) return
    this.fallen = true
    this.crashBurst = formulaCrash
    this.impactImpulse = Math.max(this.impactImpulse, formulaCrash ? 0.75 : 0.55)
    // Náhodná pauza 0,1–1,2 s (pád i formule)
    this.remountLeft = 0.1 + Math.random() * 1.1
    this.fallSpin = 0
    this.fallSlide = 0.6 + Math.random() * 0.5
    this.physics.speed = 0
    this.physics.latVel = 0
    this.physics.angularVel = 0
    this.trick = 'none'
    this.trickDef = null
    this.trickT = 0
    this.trickDur = 0
    this.airY = 0
    this.rampAirborne = false
    this.rampVy = 0
    this.pushAmount = 0
    this.wheelie = false
    this.tabHold = 0
    this.tabBase = 0
    this.resetBoardPivot()
    this.resetOlliePose()
    this.setRiderVisible(false)
    if (formulaCrash) this.mesh.visible = false
  }

  /** Rampa na Plácku — skok pro všechny. FS board padá jen při nárazu během triku. */
  private updateRampJump(dt: number, track: Track): void {
    if (this.rampCd > 0) this.rampCd = Math.max(0, this.rampCd - dt)

    if (!this.rampAirborne && this.rampCd <= 0 && this.airY < 0.15) {
      const pad = track.findJumpPad(this.physics.x, this.physics.z)
      if (pad) {
        const spd = Math.abs(this.physics.speed)
        if (spd >= pad.minSpeed) {
          this.rampAirborne = true
          this.rampVy = Math.min(22, 5.5 + spd * pad.launch)
          this.physics.speed += pad.boost * Math.sign(this.physics.speed || 1)
          this.rampCd = 1.2
        }
      }
    }

    if (!this.rampAirborne) return

    this.rampVy -= 28 * dt
    this.airY += this.rampVy * dt
    if (this.airY <= 0) {
      this.airY = 0
      this.rampAirborne = false
      this.rampVy = 0
    }
  }

  private updateFall(dt: number, track: Track): void {
    this.remountLeft = Math.max(0, this.remountLeft - dt)
    this.fallSpin += dt * 9
    this.fallSlide = Math.max(0, this.fallSlide - dt * 0.35)
    this.physics.speed = 0
    this.physics.latVel = 0
    const hit = track.constrain(this.physics.x, this.physics.z, this.trackT)
    this.physics.x = hit.x
    this.physics.z = hit.z
    this.trackT = hit.t
    this.followSurface(track, hit.t, dt)

    // Vozidlo leží / se kutálí; jezdec „vedle“
    const rideH = this.isBoardKind() ? 0.35 : 0.15
    this.mesh.position.set(this.physics.x, this.groundY + rideH, this.physics.z)
    this.mesh.rotation.order = 'YXZ'
    this.mesh.rotation.y = this.physics.heading
    this.mesh.rotation.x = this.pitch + Math.sin(this.fallSpin) * 0.4
    this.mesh.rotation.z = Math.PI * 0.5 * Math.min(1, this.fallSpin * 0.7)

    if (this.remountLeft <= 0) {
      this.fallen = false
      this.crashBurst = false
      this.fallSpin = 0
      this.fallSlide = 0
      this.mesh.visible = true
      this.mesh.rotation.z = 0
      this.setRiderVisible(true)
      this.lean = 0
      this.syncMesh(dt)
    }
  }

  private setRiderVisible(on: boolean): void {
    this.mesh.traverse((obj) => {
      if (obj instanceof THREE.Group && obj.userData.skateRider) {
        obj.visible = on
      }
      // Motorka: jezdec je v root group bez flagu — schovej meshes s helm/suit přes celý rider subtree
      if (obj.userData.motoRider) obj.visible = on
    })
  }

  /** Monsterstruck / kamion / tank: boost při plynu; žluté kužely při Shift nebo Tab. */
  private applyMonsterTurbo(dt: number, controls: VehicleControls): void {
    if (!this.isMonsterFamily()) {
      this.setTurboInput(0, dt, false)
      return
    }
    this.setTurboInput(controls.throttle, dt, true)
    const shiftHeld = (controls.push ?? 0) > 0.5
    const tabHeld = (controls.tab ?? 0) > 0.5
    if (shiftHeld || tabHeld) {
      this.syncTurboVisual(Math.max(this.turboAmount, shiftHeld ? 0.75 : 0.55))
    } else {
      this.syncTurboVisual(0)
    }
  }

  /** Cílový násobek cruise při plném Shiftu. */
  private shiftBoostMult(): number {
    if (this.isMonsterFamily()) return 1.56
    if (this.kind === 'kroska') return 1.3
    if (this.isMotoKind()) return 1.1
    if (this.kind === 'bike') return 2
    if (this.kind === 'skate') return 3
    return 1
  }

  /**
   * Společný náběh/dojezd Shift boostu (~1 s).
   * `shiftBoost01` 0→1 při držení; po puštění 1→0. Brzda zrychlí útlum.
   * Cíl = cruise × lerp(1, mult, u) — kratší hold = jen část cesty k max.
   */
  private updateShiftBoostRamp(dt: number, holding: boolean, brake: number): void {
    const mult = this.shiftBoostMult()
    if (mult <= 1) {
      this.shiftBoost01 = 0
      return
    }
    const ramp = 1 / Vehicle.SHIFT_RAMP_SEC
    const braking = brake > 0.15
    if (holding && !braking) {
      this.shiftBoost01 = Math.min(1, this.shiftBoost01 + dt * ramp)
    } else {
      const down = ramp * (braking ? 1.75 : 1)
      this.shiftBoost01 = Math.max(0, this.shiftBoost01 - dt * down)
    }

    this.pushAmount = holding
      ? Math.max(this.pushAmount, this.shiftBoost01)
      : this.shiftBoost01

    if (this.shiftBoost01 <= 0.001) return

    const cruise = Math.max(6, this.physics.maxSpeedAbs)
    const peak = cruise * mult
    const desiredAbs = cruise + (peak - cruise) * this.shiftBoost01
    const sign = Math.sign(this.physics.speed || 1) || 1
    const abs = Math.abs(this.physics.speed)
    const nearCruise = abs >= cruise * 0.9

    if (braking) {
      // Brzda už ubrala rychlost; jen nenech envelope tlačit nahoru
      if (abs > desiredAbs) {
        this.physics.speed += (desiredAbs * sign - this.physics.speed) * (1 - Math.exp(-10 * dt))
      }
      return
    }

    // U cruise (nebo výš) sleduj desired — u řídí, jak daleko k peaku jsme
    if (nearCruise || abs > cruise) {
      const desired = desiredAbs * sign
      this.physics.speed += (desired - this.physics.speed) * (1 - Math.exp(-14 * dt))
    }
  }

  /**
   * Shift wheelie: monster +56 %, moto/Harley +10 %, Kroska +30 %.
   * Ramp rychlosti ~1 s; řízení při wheelie 30 %.
   */
  private applyWheelieBoost(dt: number, holding: boolean, brake: number): void {
    const monster = this.isMonsterFamily()
    const moto = this.isMotoKind()
    if (!monster && !moto) {
      this.wheelie = false
      this.wheeliePitch = 0
      return
    }
    this.wheelie = holding
    const want = holding ? (moto ? 0.48 : 0.55) : 0
    this.wheeliePitch += (want - this.wheeliePitch) * (1 - Math.exp(-8 * dt))
    this.updateShiftBoostRamp(dt, holding, brake)
    if (holding) {
      this.physics.latVel *= Math.exp(-3.2 * dt)
      this.physics.angularVel *= Math.exp(-4.5 * dt)
    }
  }

  /** Plynulé −30 % rychlosti při zatáčení (ne cukavě). */
  private applySkateTurnSlow(dt: number, steerAbs: number): void {
    const want = steerAbs > 0.12 ? Math.min(1, steerAbs) : 0
    const k = 1 - Math.exp(-4.2 * dt)
    this.turnSlow += (want - this.turnSlow) * k
    const target = this.physics.speed * (1 - 0.3 * this.turnSlow)
    this.physics.speed += (target - this.physics.speed) * (1 - Math.exp(-5.5 * dt))
  }

  /**
   * Tab/Alt: plynulé zrychlení ~2 s.
   * Skate +45 %, kolo +30 %. Animaci šlapání/odrážení řeší updateBoardCadence.
   */
  private applySkateTabBoost(dt: number, holding: boolean): void {
    if (this.kind !== 'skate' && this.kind !== 'bike') return
    if (!holding) {
      this.tabHold = 0
      this.tabBase = 0
      this.tabBoostAmount = Math.max(0, this.tabBoostAmount - dt * 3.5)
      return
    }
    const sign = Math.sign(this.physics.speed || 1) || 1
    const abs = Math.abs(this.physics.speed)
    const cruise = Math.max(8, this.physics.maxSpeedAbs)
    // Zamkni base jen na začátku držení — žádný feedback loop
    if (this.tabBase < 0.5) {
      this.tabBase = Math.max(abs, cruise * 0.65)
    }
    this.tabHold = Math.min(2, this.tabHold + dt)
    const u = this.tabHold / 2
    const smooth = u * u * (3 - 2 * u)
    this.tabBoostAmount = Math.min(1, 0.35 + smooth * 0.65)
    const gain = this.kind === 'bike' ? 0.3 : 0.45
    const target = this.tabBase * (1 + gain * smooth) * sign
    this.physics.speed += (target - this.physics.speed) * (1 - Math.exp(-5.2 * dt))
  }

  /**
   * Kolo / skate: v základu pořád šlape / odráží.
   * Tab/Alt = 3× kadence. Při triku nebo pádu animace stojí.
   */
  private updateBoardCadence(dt: number, tabHeld: boolean, locked: boolean): void {
    if (this.kind !== 'skate' && this.kind !== 'bike') return
    if (this.fallen || locked || this.trick !== 'none') {
      this.syncPushVisual(this.pushAmount)
      return
    }
    const base = this.kind === 'bike' ? 7.2 : 6.2
    const rate = base * (tabHeld ? 3 : 1)
    this.pushAmount = Math.min(1, this.pushAmount + dt * 4)
    this.pushAmount = Math.max(0.7, this.pushAmount)
    this.pushPhase += dt * rate
    this.syncPushVisual(this.pushAmount)
  }

  /** Po tricích / bounce: ošetři Infinity/NaN (zamrzání kamery i fyziky). */
  private sanitizeMotion(): void {
    const p = this.physics
    if (!Number.isFinite(p.heading)) p.heading = 0
    else {
      // Wrap — zabraňuje driftu do obřích čísel po tricích
      p.heading = ((p.heading + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI
    }
    if (!Number.isFinite(p.speed)) p.speed = 0
    if (!Number.isFinite(p.latVel)) p.latVel = 0
    if (!Number.isFinite(p.angularVel)) p.angularVel = 0
    if (!Number.isFinite(p.x)) p.x = 0
    if (!Number.isFinite(p.z)) p.z = 0
    if (!Number.isFinite(this.airY) || this.airY > 40) this.airY = 0
    if (!Number.isFinite(this.pitch)) this.pitch = 0
    if (!Number.isFinite(this.groundY)) this.groundY = 0
    if (!Number.isFinite(this.trickBody.yaw)) this.trickBody = { pitch: 0, roll: 0, yaw: 0 }
  }

  /**
   * Shift: kolo → 2× max, skate → 3× max (vůči cruise).
   * Stejný ~1 s náběh/dojezd jako monster/moto.
   */
  private applyBoardShiftBoost(dt: number, holding: boolean, brake: number): void {
    if (this.kind !== 'skate' && this.kind !== 'bike') return
    this.updateShiftBoostRamp(dt, holding, brake)
    if (holding) this.physics.latVel *= Math.exp(-5 * dt)
  }

  /**
   * Freestyle: písmeno A–Z spustí trik (1–6 s, nepřerušitelný) + animace.
   * Funguje jen u skate / kola když freestyleOn.
   */
  private applyBoardTricks(dt: number, controls: VehicleControls): void {
    if (this.kind !== 'skate' && this.kind !== 'bike') return
    // Probíhající trik doběhne i když se freestyleOn mezitím vypne (mobilní gate / QA).
    if (!this.freestyleOn && this.trick === 'none') return

    if (this.trick === 'none') {
      const letter = controls.trickLetter
      if (letter) {
        const def = freestyleList(this.kind).find((tr) => tr.letter === letter)
        if (def) this.startFreestyleTrick(def)
      }
      return
    }

    // Probíhá — nelze přerušit
    this.trickT += dt
    const dur = Math.max(0.05, this.trickDur || 1)
    const u = clamp(this.trickT / dur, 0, 1)
    this.applyTrickAnimation(u)

    if (this.trickT >= this.trickDur) {
      if (this.trickDef) {
        this.trickPoints += this.trickDef.points
        this.lastTrickLabel = `${this.trickDef.letter} · ${this.trickDef.nameCs} +${this.trickDef.points}`
      }
      this.trick = 'none'
      this.trickDef = null
      this.trickT = 0
      this.trickDur = 0
      if (!this.rampAirborne) this.airY = 0
      this.trickBody = { pitch: 0, roll: 0, yaw: 0 }
      this.resetBoardPivot()
      this.resetOlliePose()
    }
  }

  private startFreestyleTrick(def: FreestyleTrickDef): void {
    this.trick = def.id
    this.trickDef = def
    this.trickT = 0
    this.trickDur = def.dur
    this.lastTrickLabel = `${def.letter} · ${def.nameCs}`
    const boost = def.difficulty <= 2 ? 3.5 : 2.2
    this.physics.speed += boost * Math.sign(this.physics.speed || 1)
  }

  /** QA — spusť trik přímo (obejde Input). */
  forceTrick(letter = 'A'): boolean {
    if (this.kind !== 'skate' && this.kind !== 'bike') return false
    this.freestyleOn = true
    if (this.trick !== 'none') return false
    const L = String(letter).toUpperCase().slice(0, 1)
    const def = freestyleList(this.kind).find((tr) => tr.letter === L)
    if (!def) return false
    this.startFreestyleTrick(def)
    return true
  }

  private applyTrickAnimation(u: number): void {
    const def = this.trickDef
    if (!def) return
    const pose = evalTrickAnim(u, def.spin, def.peak, def.difficulty)
    // Prvních ~0.5 s: realistický startup (crouch; skate + kick předku)
    const st = Math.min(1, this.trickT / 0.5)
    const stPulse = Math.sin(Math.PI * st)
    if (this.kind === 'bike') {
      pose.crouch = Math.max(pose.crouch, stPulse * 0.9)
      pose.arms = Math.max(pose.arms, stPulse * 0.35)
      pose.backLeg = Math.min(pose.backLeg, -stPulse * 0.55)
      pose.frontLeg = Math.min(pose.frontLeg, -stPulse * 0.4)
    } else if (this.kind === 'skate') {
      pose.crouch = Math.max(pose.crouch, stPulse * 0.95)
      pose.arms = Math.max(pose.arms, stPulse * 0.45)
      pose.backLeg = Math.min(pose.backLeg, -stPulse * 0.7)
      // Přední noha kopne do frontu desky
      pose.frontLeg = Math.max(pose.frontLeg, stPulse * 1.15)
      pose.board.x -= stPulse * 0.4
      pose.body.pitch -= stPulse * 0.12
    }
    // Během rampy řídí výšku fyzika skoku; trik jen přidá „pop“
    if (this.rampAirborne) {
      this.airY = Math.max(this.airY, pose.airY * 0.35)
    } else {
      this.airY = pose.airY * (1 - pose.squash * 0.35)
    }
    this.trickBody = { ...pose.body }

    this.mesh.traverse((obj) => {
      if (obj instanceof THREE.Group && obj.userData.skateBoard) {
        obj.rotation.set(pose.board.x, pose.board.y, pose.board.z)
        const s = 1 - pose.squash * 0.12
        obj.scale.set(s, 1 + pose.squash * 0.08, s)
      }
      if (obj instanceof THREE.Group && obj.userData.ollieBackLeg) {
        obj.rotation.x = pose.backLeg
      }
      if (obj instanceof THREE.Group && obj.userData.ollieFrontLeg) {
        if (this.pushAmount < 0.1) {
          obj.rotation.x = pose.frontLeg
          obj.position.z = 0.08 + Math.sin(u * Math.PI) * 0.1 + (this.kind === 'skate' ? stPulse * 0.06 : 0)
        }
      }
      if (obj instanceof THREE.Mesh && obj.userData.ollieTorso) {
        const baseY = this.kind === 'bike' ? 1.22 : 1.28
        const basePitch = this.kind === 'bike' ? 0.85 : 0
        obj.rotation.x = basePitch + pose.crouch * 0.5
        obj.rotation.y = pose.torsoTwist
        obj.position.y = baseY - pose.crouch * 0.14 - pose.squash * 0.08
      }
      if (obj instanceof THREE.Mesh && obj.userData.ollieArm) {
        const side = obj.position.x < 0 ? 1 : -1
        if (this.kind === 'bike') {
          obj.rotation.z = side * pose.arms * 0.35
          obj.rotation.x = -1.15 - pose.arms * 0.2
        } else {
          obj.rotation.z = side * pose.arms
          obj.rotation.x = -pose.arms * 0.35
        }
      }
    })
  }

  private resetBoardPivot(): void {
    this.mesh.traverse((obj) => {
      if (obj instanceof THREE.Group && obj.userData.skateBoard) {
        obj.rotation.set(0, 0, 0)
        obj.scale.set(1, 1, 1)
      }
    })
  }

  private resetOlliePose(): void {
    const bike = this.kind === 'bike'
    this.mesh.traverse((obj) => {
      if (obj instanceof THREE.Group && (obj.userData.ollieBackLeg || obj.userData.ollieFrontLeg)) {
        if (bike) {
          obj.rotation.x = obj.userData.pushLeg ? 0.4 : 0.65
          obj.position.y = 0.92
          if (obj.userData.ollieFrontLeg) obj.position.z = 0.1
          else obj.position.z = -0.12
        } else {
          obj.rotation.x = 0
          obj.position.y = 0.92
          if (obj.userData.ollieFrontLeg) obj.position.z = 0.1
        }
      }
      if (obj instanceof THREE.Mesh && obj.userData.ollieTorso) {
        if (bike) {
          obj.rotation.x = 0.85
          obj.rotation.y = 0
          obj.position.set(0, 1.22, 0.12)
        } else {
          obj.rotation.x = 0
          obj.rotation.y = 0
          obj.position.y = 1.28
        }
      }
      if (obj instanceof THREE.Mesh && obj.userData.ollieArm) {
        obj.rotation.z = 0
        obj.rotation.x = bike ? (obj.position.z > 0.65 ? -1.25 : -1.05) : 0
      }
    })
  }

  /** Má tento peklostroj hráčský Shift (wheelie / board boost)? */
  hasShiftSpecial(): boolean {
    return this.isMonsterFamily() || this.isMotoKind() || this.isBoardKind()
  }

  /**
   * AI Shift burst — vizuál + náběh `shiftBoost01`.
   * Vrací násobek tempa (1 = bez boostu) pro rail AiDriver.
   */
  tickAiShift(dt: number, holding: boolean): number {
    if (!this.hasShiftSpecial()) {
      this.wheelie = false
      this.wheeliePitch = 0
      this.shiftBoost01 = 0
      return 1
    }
    if (this.isMonsterFamily() || this.isMotoKind()) {
      this.wheelie = holding
      const want = holding ? (this.isMotoKind() ? 0.48 : 0.55) : 0
      this.wheeliePitch += (want - this.wheeliePitch) * (1 - Math.exp(-8 * dt))
      if (holding && this.isMonsterFamily()) {
        this.syncTurboVisual(Math.max(this.turboAmount, 0.75))
      }
    }
    if (this.isBoardKind()) {
      this.pushAmount = holding ? Math.max(this.pushAmount, 0.85) : this.pushAmount
    }
    this.updateShiftBoostRamp(dt, holding, 0)
    const mult = this.shiftBoostMult()
    if (mult <= 1) return 1
    return 1 + (mult - 1) * this.shiftBoost01
  }

  /** AI — skate odrážka / kolo šlapání (pořád v pohybu). */
  setPushVisual(amount: number, dt: number): void {
    if (this.kind !== 'skate' && this.kind !== 'bike') {
      this.pushAmount = 0
      this.syncPushVisual(0)
      return
    }
    const target = Math.max(0.7, clamp(amount, 0, 1))
    this.pushAmount += (target - this.pushAmount) * Math.min(1, 10 * dt)
    const cadence = this.kind === 'bike' ? 7.2 : 6.2
    this.pushPhase += dt * cadence
    this.syncPushVisual(this.pushAmount)
  }

  private syncPushVisual(amount: number): void {
    // Žlutý turbo/jiskry u skate pryč — jen animace nohou + kliky
    const active = amount > 0.08 && this.trick === 'none'
    const phase = this.pushPhase
    this.mesh.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.userData.pushSpark) {
        obj.visible = false
      }
      if (obj instanceof THREE.Group && obj.userData.pedalCrank) {
        obj.rotation.x = active ? phase : obj.rotation.x
      }
      if (this.kind === 'bike') {
        if (obj instanceof THREE.Group && obj.userData.ollieBackLeg && this.trick === 'none') {
          const stroke = active ? Math.sin(phase) * 0.7 * amount : 0
          obj.rotation.x = 0.65 + stroke
          obj.position.y = 0.92
        }
        if (obj instanceof THREE.Group && obj.userData.pushLeg && this.trick === 'none') {
          const stroke = active ? Math.sin(phase + Math.PI) * 0.7 * amount : 0
          obj.rotation.x = 0.4 + stroke
          obj.rotation.z = 0
          obj.position.y = 0.92
          obj.position.z = 0.1
        }
        if (obj instanceof THREE.Mesh && obj.userData.pushShin && this.trick === 'none') {
          obj.rotation.x = active ? 0.4 + Math.max(0, Math.sin(phase + Math.PI)) * 0.55 * amount : 0.4
        }
        if (obj instanceof THREE.Mesh && obj.userData.pushFoot && this.trick === 'none') {
          obj.rotation.x = active ? -0.2 - Math.sin(phase + Math.PI) * 0.25 * amount : 0
        }
        return
      }
      if (obj instanceof THREE.Group && obj.userData.pushLeg && this.trick === 'none') {
        const stroke = active ? Math.sin(phase) * 0.55 * amount : 0
        obj.rotation.x = stroke * 1.1
        obj.rotation.z = stroke * 0.35
        obj.position.y = 0.92 - Math.abs(stroke) * 0.1
        obj.position.z = 0.1 + Math.max(0, stroke) * 0.28
      }
      if (obj instanceof THREE.Mesh && obj.userData.pushShin && this.trick === 'none') {
        obj.rotation.x = active ? Math.max(0, Math.sin(phase)) * 0.7 : 0
      }
      if (obj instanceof THREE.Mesh && obj.userData.pushFoot && this.trick === 'none') {
        obj.rotation.x = active ? -0.4 - Math.sin(phase) * 0.35 : 0
      }
    })
  }

  /** Prudký profil — gravitační tah po sklonu. */
  private applySlopeGravity(dt: number, mult = 1): void {
    const g = (this.isBoardKind() ? 28 : 12) * mult
    this.physics.speed += Math.sin(this.pitch) * g * dt
  }

  /**
   * Turbo vstup (hráč i AI). `applyBoost` = true přidá rychlost (hráč);
   * AI už řídí tempo po railu, takže jen vizuál/zvuk.
   */
  setTurboInput(throttle: number, dt: number, applyBoost = false): void {
    if (!this.isMonsterFamily()) {
      this.turboAmount = 0
      this.syncTurboVisual(0)
      return
    }
    const throttling = throttle > 0.25 && this.physics.speed >= -0.5
    if (throttling) {
      this.turboAmount = Math.min(1, this.turboAmount + dt * 4.5)
      if (applyBoost) {
        const boost = 55 * throttle * (0.35 + this.turboAmount * 0.85) * dt
        this.physics.speed += boost
      }
    } else {
      this.turboAmount = Math.max(0, this.turboAmount - dt * 1.6)
    }
    // Vizuál kuželů řídí hráč přes Tab (applyMonsterTurbo); AI sem nechá plameny při boostu
    if (!applyBoost) this.syncTurboVisual(this.turboAmount)
  }

  private syncTurboVisual(amount: number): void {
    this.mesh.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh) || !obj.userData.turboFlame) return
      const s = 0.08 + amount * 2.8
      obj.scale.set(s * 0.9, s * 1.35, s)
      const mat = obj.material
      if (mat instanceof THREE.MeshLambertMaterial) {
        mat.emissiveIntensity = 0.3 + amount * 2.8
        mat.color.setHex(amount > 0.4 ? 0xfff0a0 : 0xff7a20)
        mat.emissive.setHex(amount > 0.4 ? 0xffcc33 : 0xff4400)
      }
      obj.visible = amount > 0.03
    })
  }

  /**
   * Odraz −30 % rychlosti, měkký odraz (+20 % síly oproti 50% soft).
   * Směr se pak 3 s vrací k ose tratě.
   */
  bounceOffWall(nx: number, nz: number): void {
    const p = this.physics
    const hitStrength = Math.min(1, Math.abs(p.speed) / 55)
    this.impactImpulse = Math.max(this.impactImpulse, 0.28 + hitStrength * 0.55)
    const fx = Math.sin(p.heading)
    const fz = Math.cos(p.heading)
    const rx = Math.cos(p.heading)
    const rz = -Math.sin(p.heading)
    let vx = fx * p.speed + rx * p.latVel
    let vz = fz * p.speed + rz * p.latVel
    const nLen = Math.hypot(nx, nz) || 1
    const nnx = nx / nLen
    const nnz = nz / nLen
    const dot = vx * nnx + vz * nnz
    // Plný odraz −2·dot; soft −1·dot; +20 % → −1.2·dot
    if (dot < 0) {
      vx -= 1.2 * dot * nnx
      vz -= 1.2 * dot * nnz
    }
    const mag = Math.hypot(vx, vz)
    if (mag < 0.05) {
      p.speed *= 0.7
      p.latVel *= 0.4
      p.angularVel *= 0.5
      return
    }
    const bounceHeading = Math.atan2(vx, vz)
    p.heading = lerpAngle(p.heading, bounceHeading, 0.6)
    p.speed = mag * Math.sign(p.speed || 1) * 0.7
    p.latVel *= 0.35
    p.angularVel *= 0.45
  }

  private recoverHeading(track: Track, dt: number): void {
    if (this.recoverLeft <= 0) return
    if (track.def.sandbox) {
      // Na Plácku žádná „osa tratě“ — jen ztlumit spin
      this.recoverLeft = Math.max(0, this.recoverLeft - dt)
      this.physics.angularVel *= Math.exp(-2.8 * dt)
      return
    }
    this.recoverLeft = Math.max(0, this.recoverLeft - dt)
    const s = track.sample(this.trackT)
    const target = Math.atan2(s.tangent.x, s.tangent.z)
    const blend = 1 - Math.exp((-dt * 1.15) / Math.max(0.35, this.recoverLeft * 0.45 + 0.55))
    this.physics.heading = lerpAngle(this.physics.heading, target, blend)
    this.physics.angularVel *= Math.exp(-2.2 * dt)
  }

  followSurface(track: Track, t: number, dt: number): void {
    if (track.def.sandbox) {
      const k = 1 - Math.exp(-16 * dt)
      this.groundY += (0 - this.groundY) * k
      this.pitch += (0 - this.pitch) * k
      return
    }
    const s = track.sample(t)
    const k = 1 - Math.exp(-16 * dt)
    this.groundY += (s.position.y - this.groundY) * k
    const slope = -Math.atan2(s.tangent.y, Math.hypot(s.tangent.x, s.tangent.z))
    this.pitch += (slope - this.pitch) * k
  }

  /** Motorka / skate / kolo — výrazný náklon. */
  wantsBikeLean(): boolean {
    return this.isMotoKind() || this.kind === 'skate' || this.kind === 'bike'
  }

  syncMesh(dt = 1 / 60): void {
    const board = this.isBoardKind()
    const rideH = board ? 0.62 : 0.2
    const air = this.airY
    this.mesh.position.set(this.physics.x, this.groundY + rideH + air, this.physics.z)
    this.mesh.rotation.order = 'YXZ'
    this.mesh.rotation.y = this.physics.heading + this.trickBody.yaw
    this.mesh.rotation.x = this.pitch - this.wheeliePitch + this.trickBody.pitch
    // Contact blob na zemi ve world space (ne child meshe → neklopí se s autem)
    const host = this.mesh.parent
    if (host && this.contactShadow.parent !== host) host.add(this.contactShadow)
    this.contactShadow.position.set(this.physics.x, this.groundY + 0.04, this.physics.z)
    this.contactShadow.rotation.set(-Math.PI / 2, 0, 0)
    this.contactShadow.visible = air < 1.2
    // roll z lean + trik se sčítá níže

    let targetLean: number
    if (this.isMotoKind()) {
      const maxLean = (70 * Math.PI) / 180
      let lean = this.physics.latVel * 0.12 + this.physics.angularVel * 0.75
      const turning = Math.abs(this.physics.angularVel) > 0.12 || Math.abs(this.physics.latVel) > 1.5
      if (turning) lean *= 1.2
      targetLean = clamp(lean, -maxLean, maxLean)
    } else if (board) {
      // Freestyle: ~50 % náklonu oproti moto
      const maxLean = ((70 * Math.PI) / 180) * 0.5
      let lean = (this.physics.latVel * 0.12 + this.physics.angularVel * 0.75) * 0.5
      const turning = Math.abs(this.physics.angularVel) > 0.12 || Math.abs(this.physics.latVel) > 1.5
      if (turning) lean *= 1.2
      targetLean = clamp(lean, -maxLean, maxLean)
    } else {
      const absSpeed = Math.abs(this.physics.speed)
      const speedFactor = clamp(absSpeed / 95, 0, 1)
      const soft = (this.physics.latVel * 0.018 + this.physics.angularVel * 0.035) * speedFactor * speedFactor
      targetLean = clamp(soft, -0.07, 0.07)
    }
    // Moto/board: do náklonu svižně, srovnání po výjezdu pomalu (jako v realitě)
    const rising = Math.abs(targetLean) > Math.abs(this.lean) + 0.02
    let leanRate: number
    if (this.isMotoKind()) leanRate = rising ? 7.5 : 2.2
    else if (board) leanRate = rising ? 8.5 : 3.0
    else leanRate = 7
    const leanK = 1 - Math.exp(-leanRate * dt)
    this.lean += (targetLean - this.lean) * leanK
    this.mesh.rotation.z = -this.lean + this.trickBody.roll
    this.syncTrailerJoint(dt)
    this.spinWheels(dt)
  }

  /**
   * Tahač: přívěs ve stopě hitchi (follow-the-leader).
   * Náprava drží délku za točnicí a míří na ni — žádné umělé „kývání“.
   */
  private syncTrailerJoint(_dt: number): void {
    if (this.kind !== 'truck') return
    const p = this.physics
    if (!Number.isFinite(p.x) || !Number.isFinite(p.z) || !Number.isFinite(p.heading)) return

    const hitchLocalZ = 0.05
    const trailerLen = 3.8
    const fx = Math.sin(p.heading)
    const fz = Math.cos(p.heading)
    const hitchX = p.x + fx * hitchLocalZ
    const hitchZ = p.z + fz * hitchLocalZ

    if (!this.trailerReady) {
      this.trailerHeading = p.heading
      this.trailerAxleX = hitchX - fx * trailerLen
      this.trailerAxleZ = hitchZ - fz * trailerLen
      this.trailerReady = true
    }

    const dx = hitchX - this.trailerAxleX
    const dz = hitchZ - this.trailerAxleZ
    if (dx * dx + dz * dz > 1e-6) {
      this.trailerHeading = Math.atan2(dx, dz)
    }
    const tfx = Math.sin(this.trailerHeading)
    const tfz = Math.cos(this.trailerHeading)
    this.trailerAxleX = hitchX - tfx * trailerLen
    this.trailerAxleZ = hitchZ - tfz * trailerLen

    let rel = this.trailerHeading - p.heading
    if (!Number.isFinite(rel)) rel = 0
    rel = ((rel + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI
    if (rel <= -Math.PI) rel += Math.PI * 2
    rel = clamp(rel, -1.05, 1.05)

    this.mesh.traverse((obj) => {
      if (!(obj instanceof THREE.Group) || !obj.userData.truckTrailer) return
      obj.rotation.order = 'YXZ'
      obj.rotation.y = rel
    })
  }

  private spinWheels(dt: number): void {
    if (this.fallen || this.airY > 0.35) return
    const speed = this.physics.speed
    if (Math.abs(speed) < 0.4) return
    this.mesh.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh) || !obj.userData.spinWheel) return
      const radius = Number(obj.userData.spinRadius) || 0.35
      const ang = (speed / Math.max(0.08, radius)) * dt
      const axis = obj.userData.spinAxis === 'z' ? 'z' : 'x'
      obj.rotation[axis] += ang
    })
  }

  setColor(color: number): void {
    this.info.color = color
    const none = color < 0
    this.mesh.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh) || !obj.userData.bodyPaint) return
      obj.visible = !none
      if (none) return
      const mat = obj.material
      if (
        mat instanceof THREE.MeshStandardMaterial ||
        mat instanceof THREE.MeshLambertMaterial ||
        mat instanceof THREE.MeshPhongMaterial ||
        mat instanceof THREE.MeshBasicMaterial
      ) {
        mat.color.setHex(color)
        if (mat instanceof THREE.MeshStandardMaterial) {
          mat.emissive.setHex(color)
        }
      }
    })
  }

  setNeon(color: number): void {
    this.neonColor = color
    const none = color < 0
    this.mesh.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh) || !obj.userData.neonGlow) return
      obj.visible = !none
      if (none) return
      const mat = obj.material
      if (
        mat instanceof THREE.MeshStandardMaterial ||
        mat instanceof THREE.MeshLambertMaterial ||
        mat instanceof THREE.MeshPhongMaterial ||
        mat instanceof THREE.MeshBasicMaterial
      ) {
        mat.color.setHex(color)
        if ('emissive' in mat) {
          mat.emissive.setHex(color)
          mat.emissiveIntensity = 0.85
        }
      }
    })
  }

  setWheelColor(color: number): void {
    this.wheelColor = color
    this.tintByFlag('wheelPaint', color, 0x1a1a1a)
  }

  setRiderColor(color: number): void {
    this.riderColor = color
    this.tintByFlag('riderPaint', color, 0x1c2430)
  }

  setHelmColor(color: number): void {
    this.helmColor = color
    this.tintByFlag('helmPaint', color, 0x2a2a32)
  }

  private tintByFlag(flag: string, color: number, noneHex: number): void {
    const none = color < 0
    const hex = none ? noneHex : color
    this.mesh.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh) || !obj.userData[flag]) return
      const mat = obj.material
      if (
        mat instanceof THREE.MeshStandardMaterial ||
        mat instanceof THREE.MeshLambertMaterial ||
        mat instanceof THREE.MeshPhongMaterial ||
        mat instanceof THREE.MeshBasicMaterial
      ) {
        mat.color.setHex(hex)
        if ('emissive' in mat && mat instanceof THREE.MeshLambertMaterial) {
          mat.emissive.setHex(none ? 0x000000 : hex)
          mat.emissiveIntensity = none ? 0 : 0.15
        }
      }
    })
  }
}

function lerpAngle(a: number, b: number, t: number): number {
  // Bez while — Infinity/NaN po tricích by zamrzlo hru
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Number.isFinite(a) ? a : 0
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI
  if (d <= -Math.PI) d += Math.PI * 2
  return a + d * clamp(t, 0, 1)
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

function disposeGroup(g: THREE.Group): void {
  g.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry.dispose()
      const mat = obj.material
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
      else mat.dispose()
    }
  })
}
