import * as THREE from 'three'
import type { VehicleKind } from '../track/TrackDefs'
import { createVehicleMesh } from './VehicleMeshes'
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
  neonColor = 0x7a8fa8
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
  /** Monster: jízda po zadních (Shift) */
  wheelie = false
  /** Pád (moto/skate/bike) nebo crash formule — nasedání / objevení */
  fallen = false
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
  private skateCoast = 0
  /** Freestyle zapnutý ze závodu */
  freestyleOn = false
  /** Body z triků v aktuálním závodě */
  trickPoints = 0
  /** Drift body (Kasárny / drift soutěž) */
  driftPoints = 0
  lastTrickLabel = ''
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
  /** Freestyle: musí udělat trik před dopadem, jinak pád */
  private rampNeedTrick = false
  private rampDidTrick = false
  /**
   * Hood kamera ve stylu Forza — na kapotě (ne ve vzduchu před autem):
   * `hoodZ` / `hoodY` v lokálním prostoru meshe (+Z dopředu).
   */
  hoodCam = { hoodZ: 1.2, hoodY: 0.85 }
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
      this.setColor(this.info.color)
      this.setNeon(this.neonColor)
      return
    }
    const parent = this.mesh.parent
    parent?.remove(this.mesh)
    disposeGroup(this.mesh)
    this.kind = kind
    this.mesh = createVehicleMesh(kind, this.info.color, this.neonColor)
    this.setColor(this.info.color)
    this.setNeon(this.neonColor)
    this.applyMeshShadows()
    this.bakeHoodCam()
    if (parent) parent.add(this.mesh)
    else scene?.add(this.mesh)
  }

  /** Forza Hood: kamera na kapotě u předku, ne floating před autem. */
  private bakeHoodCam(): void {
    this.mesh.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(this.mesh)
    const frontZ = Math.max(0.5, box.max.z)
    const h = Math.max(0.4, box.max.y - box.min.y)
    // Na kapotě: ~55 % k předku, výška ~62 % siluety (nad kapotou, pod střechou)
    const hoodZ = box.min.z + (frontZ - box.min.z) * 0.72
    const hoodY = box.min.y + h * 0.58
    this.hoodCam = { hoodZ, hoodY: Math.max(0.35, hoodY) }
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
    this.turboAmount = 0
    this.pushAmount = 0
    this.wheelie = false
    this.wheeliePitch = 0
    this.fallen = false
    this.crashBurst = false
    this.remountLeft = 0
    this.airY = 0
    this.pushPhase = 0
    this.turnSlow = 0
    this.tabHold = 0
    this.tabBase = 0
    this.skateCoast = 0
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
    this.rampNeedTrick = false
    this.rampDidTrick = false
    this.syncTurboVisual(0)
    this.syncPushVisual(0)
    this.resetBoardPivot()
    this.resetOlliePose()
    this.setRiderVisible(true)
    this.mesh.visible = true
    this.syncMesh()
  }

  /** Během triku nelze řídit / startovat další trik. */
  get trickLocked(): boolean {
    return this.trick !== 'none'
  }

  /** Pád jen moto / skate / kolo. */
  canCrashFall(): boolean {
    return this.kind === 'moto' || this.kind === 'skate' || this.kind === 'bike'
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
    if (this.freestyleOn) this.physics.driftMode = false
    const locked = this.trickLocked
    const board = this.isBoardKind()
    const shiftHeld = (controls.push ?? 0) > 0.5
    this.wheelie = this.isMonsterFamily() && shiftHeld
    let steerIn = locked ? 0 : controls.steer
    if (this.wheelie) steerIn = 0
    const steered: VehicleControls = {
      throttle: controls.throttle,
      brake: controls.brake,
      steer: steerIn,
      push: shiftHeld ? 1 : 0,
      ebrake: this.physics.driftMode ? (controls.ebrake ?? 0) : 0,
      tab: controls.tab,
      trickLetter: controls.trickLetter,
    }
    this.physics.update(dt, steered)
    this.driftPoints = Math.floor(this.physics.driftPoints)
    this.applyMonsterTurbo(dt, controls)
    this.applyMonsterWheelie(dt, shiftHeld)
    if (board) {
      this.applySkateTurnSlow(dt, Math.abs(steerIn))
      // Triky jen skate + kolo; Shift boost jen skate; wheelie = jediný „trik“ monsteru
      if (this.kind === 'skate') {
        this.applySkateTabBoost(dt, !locked && (controls.tab ?? 0) > 0.5)
        this.applySkateShiftBoost(dt, !locked && shiftHeld)
      }
      this.applyBoardTricks(dt, controls)
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
      if (this.canCrashFall() && absSpd > maxSpd * 0.4) {
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

  private beginFall(formulaCrash: boolean): void {
    this.fallen = true
    this.crashBurst = formulaCrash
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
    this.rampNeedTrick = false
    this.rampDidTrick = false
    this.pushAmount = 0
    this.wheelie = false
    this.tabHold = 0
    this.tabBase = 0
    this.resetBoardPivot()
    this.resetOlliePose()
    this.setRiderVisible(false)
    if (formulaCrash) this.mesh.visible = false
  }

  /** Rampa na Plácku — skok pro všechny; freestyle bez triku = pád. */
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
          this.rampNeedTrick = this.freestyleOn && this.isBoardKind()
          this.rampDidTrick = false
          if (this.trick !== 'none') this.rampDidTrick = true
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
      const failed = this.rampNeedTrick && !this.rampDidTrick
      this.rampNeedTrick = false
      this.rampDidTrick = false
      if (failed) this.beginFall(false)
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

  /** Monsterstruck / kamion / tank: turbo při plynu. */
  private applyMonsterTurbo(dt: number, controls: VehicleControls): void {
    if (!this.isMonsterFamily()) {
      this.setTurboInput(0, dt, false)
      return
    }
    this.setTurboInput(controls.throttle, dt, true)
  }

  /** Shift: wheelie — bez řízení, +20 % rychlosti, náklon na zadní. */
  private applyMonsterWheelie(dt: number, holding: boolean): void {
    if (!this.isMonsterFamily()) {
      this.wheelie = false
      this.wheeliePitch = 0
      return
    }
    this.wheelie = holding
    const want = holding ? 0.55 : 0
    this.wheeliePitch += (want - this.wheeliePitch) * (1 - Math.exp(-8 * dt))
    if (holding) {
      this.pushAmount = Math.min(1, this.pushAmount + dt * 4)
      const sign = Math.sign(this.physics.speed || 1)
      const target = Math.abs(this.physics.speed) * 1.2 * sign
      this.physics.speed += (target - this.physics.speed) * (1 - Math.exp(-3.2 * dt))
      this.physics.latVel *= Math.exp(-10 * dt)
      this.physics.angularVel *= Math.exp(-12 * dt)
    } else {
      this.pushAmount = Math.max(0, this.pushAmount - dt * 3)
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

  /** Tab: plynule zrychli během 2 s (+30 %), bez turbo/jisker vizuálu. */
  private applySkateTabBoost(dt: number, holding: boolean): void {
    if (!holding) {
      this.tabHold = 0
      this.tabBase = 0
      return
    }
    if (this.tabBase < 0.5) this.tabBase = Math.max(10, Math.abs(this.physics.speed))
    this.tabHold = Math.min(2, this.tabHold + dt)
    const u = this.tabHold / 2
    const smooth = u * u * (3 - 2 * u)
    const target = this.tabBase * (1 + 0.3 * smooth) * Math.sign(this.physics.speed || 1)
    this.physics.speed += (target - this.physics.speed) * (1 - Math.exp(-3.8 * dt))
  }

  /** Shift: 120 % rychlosti + setrvačnost po puštění. */
  private applySkateShiftBoost(dt: number, holding: boolean): void {
    if (holding) {
      this.pushAmount = Math.min(1, this.pushAmount + dt * 5)
      this.pushPhase += dt * 7.5
      this.skateCoast = 1
      const sign = Math.sign(this.physics.speed || 1)
      const base = Math.max(Math.abs(this.physics.speed), this.physics.maxSpeedAbs * 0.55)
      const target = base * 1.2 * sign
      this.physics.speed += (target - this.physics.speed) * (1 - Math.exp(-3.5 * dt))
      this.physics.latVel *= Math.exp(-5 * dt)
    } else {
      this.pushAmount = Math.max(0, this.pushAmount - dt * 2.2)
      if (this.pushPhase !== 0 && this.pushAmount < 0.05) this.pushPhase = 0
      // Setrvačnost: pomalé dojezdy
      if (this.skateCoast > 0.05) {
        this.skateCoast = Math.max(0, this.skateCoast - dt * 0.35)
        this.physics.speed *= Math.exp(-0.22 * dt)
      }
    }
    this.syncPushVisual(this.pushAmount)
  }

  /**
   * Freestyle: písmeno A–Z spustí trik (1–6 s, nepřerušitelný) + animace.
   * Funguje jen u skate / kola když freestyleOn.
   */
  private applyBoardTricks(dt: number, controls: VehicleControls): void {
    if (this.kind !== 'skate' && this.kind !== 'bike') return
    if (!this.freestyleOn) return

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
    const u = clamp(this.trickT / this.trickDur, 0, 1)
    this.applyTrickAnimation(u)

    if (this.trickT >= this.trickDur) {
      if (this.trickDef) {
        this.trickPoints += this.trickDef.points
        this.lastTrickLabel = `${this.trickDef.letter} · ${this.trickDef.nameCs} +${this.trickDef.points}`
        if (this.rampAirborne) this.rampDidTrick = true
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
    if (this.rampAirborne) this.rampDidTrick = true
  }

  private applyTrickAnimation(u: number): void {
    const def = this.trickDef
    if (!def) return
    const pose = evalTrickAnim(u, def.spin, def.peak, def.difficulty)
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
          obj.position.z = 0.08 + Math.sin(u * Math.PI) * 0.1
        }
      }
      if (obj instanceof THREE.Mesh && obj.userData.ollieTorso) {
        obj.rotation.x = pose.crouch * 0.5
        obj.rotation.y = pose.torsoTwist
        obj.position.y = 0.95 - pose.crouch * 0.14 - pose.squash * 0.08
      }
      if (obj instanceof THREE.Mesh && obj.userData.ollieArm) {
        const side = obj.position.x < 0 ? 1 : -1
        obj.rotation.z = side * pose.arms
        obj.rotation.x = -pose.arms * 0.35
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
    this.mesh.traverse((obj) => {
      if (obj instanceof THREE.Group && (obj.userData.ollieBackLeg || obj.userData.ollieFrontLeg)) {
        obj.rotation.x = 0
        if (obj.userData.ollieFrontLeg) obj.position.z = 0.08
      }
      if (obj instanceof THREE.Mesh && obj.userData.ollieTorso) {
        obj.rotation.x = 0
        obj.rotation.y = 0
        obj.position.y = 0.95
      }
      if (obj instanceof THREE.Mesh && obj.userData.ollieArm) {
        obj.rotation.z = 0
        obj.rotation.x = 0
      }
    })
  }

  /** AI skate — vizuál odrážení. */
  setPushVisual(amount: number, dt: number): void {
    if (this.kind !== 'skate') {
      this.pushAmount = 0
      this.syncPushVisual(0)
      return
    }
    const target = clamp(amount, 0, 1)
    this.pushAmount += (target - this.pushAmount) * Math.min(1, 10 * dt)
    if (target > 0.4) this.pushPhase += dt * 7.5
    else this.pushPhase = 0
    this.syncPushVisual(this.pushAmount)
  }

  private syncPushVisual(amount: number): void {
    // Žlutý turbo/jiskry u skate pryč — jen animace nohy
    this.mesh.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.userData.pushSpark) {
        obj.visible = false
      }
      if (obj instanceof THREE.Group && obj.userData.pushLeg && this.trick === 'none') {
        const stroke = amount > 0.08 ? Math.sin(this.pushPhase) * 0.55 * amount : 0
        obj.rotation.x = stroke * 1.1
        obj.rotation.z = stroke * 0.35
        obj.position.y = 0.55 - Math.abs(stroke) * 0.08
        obj.position.z = 0.08 + Math.max(0, stroke) * 0.25
      }
      if (obj instanceof THREE.Mesh && obj.userData.pushShin && this.trick === 'none') {
        obj.rotation.x = amount > 0.08 ? Math.max(0, Math.sin(this.pushPhase)) * 0.7 : 0
      }
      if (obj instanceof THREE.Mesh && obj.userData.pushFoot && this.trick === 'none') {
        obj.rotation.x = amount > 0.08 ? -0.4 - Math.sin(this.pushPhase) * 0.35 : 0
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
    this.syncTurboVisual(this.turboAmount)
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
    return this.kind === 'moto' || this.kind === 'skate' || this.kind === 'bike'
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

    const bike = this.wantsBikeLean()
    let targetLean: number
    if (this.kind === 'moto') {
      const maxLean = (70 * Math.PI) / 180
      let lean = this.physics.latVel * 0.12 + this.physics.angularVel * 0.75
      const turning = Math.abs(this.physics.angularVel) > 0.12 || Math.abs(this.physics.latVel) > 1.5
      if (turning) lean *= 1.2
      targetLean = clamp(lean, -maxLean, maxLean)
    } else if (board) {
      let lean = this.physics.latVel * 0.1 + this.physics.angularVel * 0.62
      const turning = Math.abs(this.physics.angularVel) > 0.12 || Math.abs(this.physics.latVel) > 1.5
      if (turning) lean *= 1.2
      targetLean = clamp(lean, -0.55, 0.55)
    } else {
      const absSpeed = Math.abs(this.physics.speed)
      const speedFactor = clamp(absSpeed / 95, 0, 1)
      const soft = (this.physics.latVel * 0.018 + this.physics.angularVel * 0.035) * speedFactor * speedFactor
      targetLean = clamp(soft, -0.07, 0.07)
    }
    const leanK = 1 - Math.exp(-(bike ? 11 : 7) * dt)
    this.lean += (targetLean - this.lean) * leanK
    this.mesh.rotation.z = -this.lean + this.trickBody.roll
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
        mat instanceof THREE.MeshLambertMaterial ||
        mat instanceof THREE.MeshPhongMaterial ||
        mat instanceof THREE.MeshBasicMaterial
      ) {
        mat.color.setHex(color)
      }
    })
  }

  setNeon(color: number): void {
    this.neonColor = color
    const none = color < 0
    this.mesh.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return
      if (obj.userData.neonGlow) {
        obj.visible = !none
        if (none) return
        const mat = obj.material
        if (
          mat instanceof THREE.MeshLambertMaterial ||
          mat instanceof THREE.MeshPhongMaterial ||
          mat instanceof THREE.MeshBasicMaterial
        ) {
          mat.color.setHex(color)
          if ('emissive' in mat) {
            ;(mat as THREE.MeshLambertMaterial).emissive.setHex(color)
            ;(mat as THREE.MeshLambertMaterial).emissiveIntensity = 0.7
          }
        }
        return
      }
      if (this.kind === 'bike' && obj.userData.wheelPaint) {
        const mat = obj.material
        if (
          mat instanceof THREE.MeshLambertMaterial ||
          mat instanceof THREE.MeshPhongMaterial ||
          mat instanceof THREE.MeshBasicMaterial
        ) {
          const c = none ? 0x1a1a1a : color
          mat.color.setHex(c)
          if ('emissive' in mat) {
            ;(mat as THREE.MeshLambertMaterial).emissive.setHex(none ? 0x000000 : color)
            ;(mat as THREE.MeshLambertMaterial).emissiveIntensity = none ? 0 : 0.55
          }
        }
      }
    })
  }
}

function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
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
