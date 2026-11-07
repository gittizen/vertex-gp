import * as THREE from 'three'
import { AiDriver } from '../ai/AiDriver'
import { getDifficulty, type DifficultyDef, type DifficultyId } from '../ai/Difficulty'
import { CameraController } from '../camera/CameraController'
import { Input } from '../input/Input'
import { NetClient, roomLink, roomFromUrl, wsFromUrl, defaultWsUrl } from '../net/NetClient'
import type { CarStateMsg, NetRoom } from '../net/protocol'
import { RaceManager } from '../race/RaceManager'
import { Track } from '../track/Track'
import { getTrackDef, TRACKS } from '../track/TrackDefs'
import { type PlayerTuningValues, DEFAULT_PLAYER_TUNING } from '../tuning/PlayerTuning'
import type { VehicleKind } from '../track/TrackDefs'
import { Hud } from '../ui/Hud'
import { Menu, type MenuStartPayload } from '../ui/Menu'
import { Vehicle, type DriverInfo } from '../vehicle/Vehicle'
import { aiProfileForKind, profileForKind } from '../vehicle/VehicleProfiles'

const AI_NAMES = [
  { name: 'Alex Rossi', team: 'Vertex', color: 0xc62828 },
  { name: 'Mina Park', team: 'Nord', color: 0x1565c0 },
  { name: 'Leo Hartmann', team: 'Stratos', color: 0x2e7d32 },
  { name: 'Sara Quinn', team: 'Apex', color: 0xef6c00 },
]

const PLAYER_COLORS = [0xc62828, 0x1565c0, 0x2e7d32, 0xef6c00]

type Mode = 'menu' | 'race'

export class Game {
  private readonly renderer: THREE.WebGLRenderer
  private readonly scene = new THREE.Scene()
  private readonly camera: THREE.PerspectiveCamera
  private readonly input = new Input()
  private track: Track
  private readonly vehicles: Vehicle[] = []
  private player: Vehicle
  private readonly ai = new Map<Vehicle, AiDriver>()
  private race: RaceManager
  private readonly cams: CameraController
  private readonly hud: Hud
  private readonly menu: Menu
  private readonly net = new NetClient()
  private mode: Mode = 'menu'
  private lastTime = 0
  private running = false
  private lastTrackId = TRACKS[0].id
  private lastTuning: PlayerTuningValues = { ...DEFAULT_PLAYER_TUNING }
  private lastDifficulty: DifficultyDef = getDifficulty('normal')
  private multiplayer = false
  private isHost = false
  private localSlot = 0
  /** net playerId → vehicle index */
  private netSlots = new Map<string, number>()
  private remoteState = new Map<string, CarStateMsg>()
  private stateAcc = 0
  private unsubNet: (() => void) | null = null
  private publicWsUrl = ''

  constructor(
    canvas: HTMLCanvasElement,
    hudEl: HTMLElement,
    overlayEl: HTMLElement,
    menuEl: HTMLElement,
  ) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance',
    })
    // 2.5D performance profile
    this.renderer.setPixelRatio(1)
    this.renderer.setSize(window.innerWidth, window.innerHeight, false)
    this.renderer.shadowMap.enabled = false
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.NoToneMapping
    this.renderer.info.autoReset = true

    this.camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 1, 520)
    this.cams = new CameraController(this.camera)
    this.hud = new Hud(hudEl, overlayEl)
    this.menu = new Menu(menuEl)
    this.menu.setOnStart((payload) => void this.handleMenuStart(payload))
    this.menu.setOnHostStart(() => this.hostStartRace())
    this.menu.setOnLeaveLobby(() => this.leaveLobby())
    this.hud.setOnMenuRequest(() => this.openMenu())
    this.hud.setOnRestartRequest(() => {
      if (this.multiplayer) return
      this.beginSoloRace(this.lastTrackId, this.lastTuning, this.player.info.name, this.lastDifficulty.id)
    })

    this.setupLights()
    this.track = new Track(this.scene, getTrackDef(TRACKS[0].id))
    this.track.setDecorQuality(false)
    this.applyTheme(this.track.def)

    for (let i = 0; i < 4; i++) {
      const info: DriverInfo =
        i === 0
          ? { id: 'p1', name: 'Ty', team: 'Vertex', color: PLAYER_COLORS[0], isPlayer: true }
          : {
              id: `ai${i}`,
              name: AI_NAMES[i - 1].name,
              team: AI_NAMES[i - 1].team,
              color: AI_NAMES[i - 1].color,
              isPlayer: false,
            }
      const tuning =
        i === 0
          ? profileForKind('formula', DEFAULT_PLAYER_TUNING)
          : aiProfileForKind('formula', i)
      const v = new Vehicle(info, tuning, 'formula')
      this.scene.add(v.mesh)
      this.vehicles.push(v)
      this.ai.set(v, new AiDriver(i, this.lastDifficulty))
    }
    this.player = this.vehicles[0]
    this.race = new RaceManager(this.track, this.vehicles)

    for (const v of this.vehicles) v.mesh.visible = false

    window.addEventListener('resize', () => this.onResize())
    this.onResize()
    this.openMenu()

    // Auto-join from shared internet link
    const room = roomFromUrl()
    if (room) {
      const ws = wsFromUrl() || undefined
      void this.handleMenuStart({
        mode: 'join',
        trackId: TRACKS[0].id,
        tuning: { ...DEFAULT_PLAYER_TUNING },
        name: 'Hráč',
        difficulty: 'normal',
        roomCode: room,
        publicWsUrl: ws || undefined,
      })
    }
  }

  start(): void {
    this.running = true
    this.lastTime = performance.now()
    requestAnimationFrame((t) => this.frame(t))
  }

  private openMenu(): void {
    this.mode = 'menu'
    this.multiplayer = false
    this.net.disconnect()
    this.unsubNet?.()
    this.unsubNet = null
    this.menu.setLobby(null, '', false)
    for (const v of this.vehicles) {
      v.mesh.visible = false
      v.physics.speed = 0
    }
    this.menu.show()
    this.hud.update(this.player, this.race, this.cams, false)
  }

  private leaveLobby(): void {
    this.openMenu()
  }

  private async handleMenuStart(payload: MenuStartPayload): Promise<void> {
    this.lastTrackId = payload.trackId
    this.lastTuning = { ...payload.tuning }
    this.lastDifficulty = getDifficulty(payload.difficulty)
    this.publicWsUrl = payload.publicWsUrl || ''

    if (payload.mode === 'solo') {
      this.beginSoloRace(payload.trackId, payload.tuning, payload.name, payload.difficulty)
      return
    }

    const wsUrl = payload.publicWsUrl || wsFromUrl() || defaultWsUrl()
    try {
      this.menu.setLobby(null, '', false, 'Připojuji k serveru…')
      await this.net.connect(wsUrl)
    } catch (e) {
      this.menu.setLobby(
        null,
        '',
        false,
        e instanceof Error ? e.message : 'Připojení selhalo',
      )
      return
    }

    this.unsubNet?.()
    this.unsubNet = this.net.onMessage((msg) => this.onNetMessage(msg))

    if (payload.mode === 'host') {
      this.isHost = true
      this.net.send({
        type: 'create',
        name: payload.name,
        color: PLAYER_COLORS[0],
        trackId: payload.trackId,
      })
    } else {
      this.isHost = false
      if (!payload.roomCode) {
        this.menu.setLobby(null, '', false, 'Zadej kód místnosti')
        return
      }
      this.net.send({
        type: 'join',
        code: payload.roomCode,
        name: payload.name,
        color: PLAYER_COLORS[1],
      })
    }
  }

  private onNetMessage(msg: import('../net/protocol').ServerMessage): void {
    if (msg.type === 'error') {
      this.menu.setLobby(null, '', this.isHost, msg.message)
      return
    }
    if (msg.type === 'welcome' || msg.type === 'room') {
      const room = msg.room
      const link = roomLink(room.code, this.publicWsUrl || this.net.lastUrl)
      this.menu.setLobby(room, link, room.hostId === this.net.playerId)
      return
    }
    if (msg.type === 'start') {
      this.beginMultiplayerRace(msg.trackId, msg.order, msg.room)
      return
    }
    if (msg.type === 'state') {
      this.remoteState.set(msg.playerId, msg)
      return
    }
    if (msg.type === 'phase' && msg.phase === 'finished') {
      // host finished broadcast — local RaceManager handles finish too
    }
  }

  private hostStartRace(): void {
    if (!this.isHost) return
    this.net.send({ type: 'start', trackId: this.lastTrackId })
  }

  private beginSoloRace(
    trackId: string,
    tuning: PlayerTuningValues,
    name = 'Ty',
    difficulty: DifficultyId = 'normal',
  ): void {
    this.multiplayer = false
    this.lastDifficulty = getDifficulty(difficulty)
    this.menu.hide()
    this.mode = 'race'
    this.setupGridSolo(name)
    this.loadTrack(trackId, tuning)
    this.applyAiDifficulty()
    this.race = new RaceManager(this.track, this.vehicles)
    this.race.start()
    this.resetAiRails()
    for (const v of this.vehicles) v.mesh.visible = true
  }

  private beginMultiplayerRace(trackId: string, order: string[], room: NetRoom): void {
    this.multiplayer = true
    this.menu.hide()
    this.mode = 'race'
    this.lastTrackId = trackId
    this.setupGridMultiplayer(order, room)
    this.loadTrack(trackId, this.lastTuning)
    this.applyAiDifficulty()
    this.race = new RaceManager(this.track, this.vehicles)
    this.race.start()
    this.resetAiRails()
    for (const v of this.vehicles) v.mesh.visible = true
  }

  private applyAiDifficulty(): void {
    for (let i = 0; i < this.vehicles.length; i++) {
      const brain = this.ai.get(this.vehicles[i])
      brain?.setDifficulty(this.lastDifficulty)
    }
  }

  private resetAiRails(): void {
    for (let i = 0; i < this.vehicles.length; i++) {
      const v = this.vehicles[i]
      const brain = this.ai.get(v)
      if (!brain) continue
      const pose = this.track.getStartPose(i)
      const t = this.track.progressAt(pose.x, pose.z)
      brain.reset(this.track, t, v)
    }
  }

  private setupGridSolo(name: string): void {
    this.netSlots.clear()
    this.remoteState.clear()
    this.localSlot = 0
    this.vehicles[0].info.name = name
    this.vehicles[0].info.isPlayer = true
    this.vehicles[0].setColor(PLAYER_COLORS[0])
    for (let i = 1; i < 4; i++) {
      this.vehicles[i].info.isPlayer = false
      this.vehicles[i].info.name = AI_NAMES[i - 1].name
      this.vehicles[i].info.team = AI_NAMES[i - 1].team
      this.vehicles[i].setColor(AI_NAMES[i - 1].color)
    }
    this.player = this.vehicles[0]
  }

  private setupGridMultiplayer(order: string[], room: NetRoom): void {
    this.netSlots.clear()
    this.remoteState.clear()
    const byId = new Map(room.players.map((p) => [p.id, p]))

    for (let i = 0; i < 4; i++) {
      const netId = order[i]
      if (netId) {
        const p = byId.get(netId)!
        this.netSlots.set(netId, i)
        this.vehicles[i].info.name = p.name
        this.vehicles[i].setColor(p.color || PLAYER_COLORS[i])
        this.vehicles[i].info.isPlayer = netId === this.net.playerId
        if (netId === this.net.playerId) this.localSlot = i
      } else {
        const ai = AI_NAMES[i % AI_NAMES.length]
        this.vehicles[i].info.name = ai.name
        this.vehicles[i].info.team = ai.team
        this.vehicles[i].setColor(ai.color)
        this.vehicles[i].info.isPlayer = false
      }
    }
    this.player = this.vehicles[this.localSlot]
  }

  private loadTrack(trackId: string, playerTuning: PlayerTuningValues): void {
    const def = getTrackDef(trackId)
    this.track.dispose()
    this.track = new Track(this.scene, def)
    // Extra dekor vypnutý — stabilnější FPS (stačí pro 2–4 hráče)
    this.track.setDecorQuality(false)
    this.applyTheme(def)
    this.hud.setTrackName(`${def.name} · ${labelVehicle(def.vehicle)}`)

    for (let i = 0; i < this.vehicles.length; i++) {
      const v = this.vehicles[i]
      v.setKind(def.vehicle, this.scene)
      if (i === this.localSlot) {
        v.physics.applyTuning(profileForKind(def.vehicle, playerTuning))
      } else {
        v.physics.applyTuning(aiProfileForKind(def.vehicle, i))
      }
      v.setColor(v.info.color)
    }
    this.player = this.vehicles[this.localSlot]
  }

  private applyTheme(def: (typeof TRACKS)[number]): void {
    const { sky, fog } = def.theme
    this.scene.background = new THREE.Color(sky)
    // Lineární fog je levnější než Exp2
    if (def.world === 'city') {
      this.scene.fog = new THREE.Fog(fog, 35, 220)
    } else if (def.world === 'ice') {
      this.scene.fog = new THREE.Fog(fog, 100, 420)
    } else {
      this.scene.fog = new THREE.Fog(fog, 140, 480)
    }

    const hemi = this.scene.getObjectByName('hemi') as THREE.HemisphereLight | undefined
    const sun = this.scene.getObjectByName('sun') as THREE.DirectionalLight | undefined
    if (def.world === 'city') {
      hemi?.color.setHex(0x4a3080)
      hemi?.groundColor.setHex(0x1a1028)
      if (hemi) hemi.intensity = 0.6
      sun?.color.setHex(0xff66cc)
      if (sun) sun.intensity = 0.5
    } else if (def.world === 'ice') {
      hemi?.color.setHex(0xc8dff0)
      hemi?.groundColor.setHex(0xb0c4d0)
      if (hemi) hemi.intensity = 0.9
      sun?.color.setHex(0xfff5e8)
      if (sun) sun.intensity = 1
    } else {
      hemi?.color.setHex(0xb8d8f0)
      hemi?.groundColor.setHex(0x4a8a4a)
      if (hemi) hemi.intensity = 0.8
      sun?.color.setHex(0xfff0d8)
      if (sun) sun.intensity = 1.1
    }
  }

  private setupLights(): void {
    const ambient = new THREE.AmbientLight(0xffffff, 0.4)
    ambient.name = 'ambient'
    this.scene.add(ambient)

    const hemi = new THREE.HemisphereLight(0xb8d8f0, 0x4a8a4a, 0.8)
    hemi.name = 'hemi'
    this.scene.add(hemi)

    const sun = new THREE.DirectionalLight(0xfff0d8, 1.1)
    sun.name = 'sun'
    sun.position.set(80, 120, 40)
    this.scene.add(sun)
  }

  private onResize(): void {
    const w = window.innerWidth
    const h = window.innerHeight
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    // Cap vnitřní rozlišení — 60 FPS na slabších PC
    const scale = w * h > 1600 * 900 ? 0.85 : 1
    this.renderer.setSize(Math.floor(w * scale), Math.floor(h * scale), false)
    this.renderer.domElement.style.width = `${w}px`
    this.renderer.domElement.style.height = `${h}px`
  }

  private pushNetState(): void {
    if (!this.multiplayer || !this.net.connected) return
    const v = this.player
    this.net.send({
      type: 'state',
      x: v.physics.x,
      z: v.physics.z,
      heading: v.physics.heading,
      speed: v.physics.speed,
      lap: v.lap,
      raceDistance: v.raceDistance,
      finished: v.finished,
      finishTime: v.finishTime,
    })
  }

  private applyRemoteStates(): void {
    for (const [netId, state] of this.remoteState) {
      const slot = this.netSlots.get(netId)
      if (slot === undefined || slot === this.localSlot) continue
      const v = this.vehicles[slot]
      v.physics.x = state.x
      v.physics.z = state.z
      v.physics.heading = state.heading
      v.physics.speed = state.speed
      v.lap = state.lap
      v.raceDistance = state.raceDistance
      v.finished = state.finished
      v.finishTime = state.finishTime
      v.syncMesh()
    }
  }

  private isAiSlot(index: number): boolean {
    if (!this.multiplayer) return index !== this.localSlot
    for (const [, slot] of this.netSlots) {
      if (slot === index) return false
    }
    return true
  }

  private frame(now: number): void {
    if (!this.running) return
    const dt = Math.min(0.05, (now - this.lastTime) / 1000)
    this.lastTime = now

    if (this.mode === 'menu') {
      const t = now * 0.00015
      this.camera.position.set(Math.sin(t) * 140, 55, Math.cos(t) * 140)
      this.camera.lookAt(0, 0, 0)
      this.renderer.render(this.scene, this.camera)
      this.input.endFrame()
      requestAnimationFrame((n) => this.frame(n))
      return
    }

    if (this.input.pressed('KeyR') && !this.multiplayer) {
      this.beginSoloRace(
        this.lastTrackId,
        this.lastTuning,
        this.player.info.name,
        this.lastDifficulty.id,
      )
      requestAnimationFrame((n) => this.frame(n))
      return
    }
    if (this.input.pressed('Escape')) {
      this.openMenu()
      requestAnimationFrame((n) => this.frame(n))
      return
    }

    this.applyRemoteStates()

    // Countdown tick dřív; progress kol až po pohybu
    if (this.race.phase === 'countdown') {
      this.race.update(dt)
    }

    for (let i = 0; i < this.vehicles.length; i++) {
      const v = this.vehicles[i]
      const isLocal = i === this.localSlot
      const isRemoteHuman = this.multiplayer && !isLocal && !this.isAiSlot(i)

      if (isRemoteHuman) continue

      if (isLocal) {
        const controls =
          this.race.phase === 'racing'
            ? {
                throttle: this.input.throttle,
                brake: this.input.brake,
                steer: this.input.steer,
              }
            : { throttle: 0, brake: 0, steer: 0 }
        if (this.race.phase === 'countdown') {
          v.physics.speed = 0
          v.syncMesh()
        } else {
          v.update(dt, controls, this.track)
        }
      } else if (this.isAiSlot(i)) {
        const brain = this.ai.get(v)
        if (this.race.phase === 'countdown') {
          v.physics.speed = 0
          v.syncMesh()
        } else if (this.race.phase === 'racing' && brain) {
          brain.drive(dt, v, this.track, this.player.physics.speed)
        } else {
          v.physics.speed *= Math.exp(-2 * dt)
          v.syncMesh()
        }
      }
    }

    if (this.race.phase === 'racing') {
      for (let i = 0; i < this.vehicles.length; i++) {
        const v = this.vehicles[i]
        if (this.multiplayer && i !== this.localSlot && !this.isAiSlot(i)) continue
        const hit = this.track.constrain(v.physics.x, v.physics.z, v.trackT)
        v.physics.x = hit.x
        v.physics.z = hit.z
        v.trackT = hit.t
        if (hit.hit && v.info.isPlayer) {
          v.physics.speed *= 0.85
          v.physics.latVel *= 0.4
        }
        v.syncMesh()
      }
      this.race.update(dt)
    }

    this.stateAcc += dt
    if (this.stateAcc >= 0.05) {
      this.stateAcc = 0
      this.pushNetState()
    }

    if (this.multiplayer && this.isHost && this.race.phase === 'finished') {
      this.net.send({ type: 'phase', phase: 'finished' })
    }

    this.cams.update(dt, this.player)
    this.hud.update(this.player, this.race, this.cams, true)
    this.renderer.render(this.scene, this.camera)
    this.input.endFrame()

    requestAnimationFrame((n) => this.frame(n))
  }
}

function labelVehicle(kind: VehicleKind): string {
  if (kind === 'street') return 'Tuning'
  if (kind === 'rally') return 'Rallye'
  return 'Formule'
}
