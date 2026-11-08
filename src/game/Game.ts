import * as THREE from 'three'
import { AiDriver } from '../ai/AiDriver'
import { getDifficulty, type DifficultyDef, type DifficultyId } from '../ai/Difficulty'
import { CameraController } from '../camera/CameraController'
import { EngineAudio } from '../audio/EngineAudio'
import {
  applyUiAtmosphere,
  fogDistanceScale,
  lightIntensityScale,
  loadAtmosphereSettings,
  saveAtmosphereSettings,
  type AtmosphereSettingsValues,
} from '../render/AtmosphereSettings'
import {
  clampOpponentsToCategory,
  loadRaceSettings,
  saveRaceSettings,
  transmissionAllowedFor,
  type RaceSettingsValues,
} from '../render/RaceSettings'
import {
  loadCompetitionSettings,
  type CompetitionId,
} from '../render/CompetitionSettings'
import {
  camFollowRate,
  applyHudScale,
  loadControlFeel,
  saveControlFeel,
  type ControlFeelValues,
} from '../input/ControlFeel'
import { Input } from '../input/Input'
import { NetClient, roomLink, roomFromUrl, wsFromUrl, defaultWsUrl } from '../net/NetClient'
import type { CarStateMsg, NetRoom } from '../net/protocol'
import { RaceManager } from '../race/RaceManager'
import { Track } from '../track/Track'
import { getTrackDef, resolveTrackDef, TRACKS, type VehicleKind } from '../track/TrackDefs'
import { type PlayerTuningValues, DEFAULT_PLAYER_TUNING } from '../tuning/PlayerTuning'
import { t } from '../i18n/i18n'
import { Entry } from '../ui/Entry'
import { Hud } from '../ui/Hud'
import { Menu, type MenuStartPayload } from '../ui/Menu'
import { Vehicle, type DriverInfo } from '../vehicle/Vehicle'
import { aiProfileForKind, aiSpeedMultForVehicle, profileForKind } from '../vehicle/VehicleProfiles'
import { placePoints } from '../freestyle/FreestyleTricks'
import { submitRaceRecord } from '../freestyle/Records'

const AI_NAMES = [
  { name: 'Nikola Beran', team: 'Klec', color: 0xc62828 },
  { name: 'Petra Holá', team: 'Nord', color: 0x1565c0 },
  { name: 'Marek Diviš', team: 'Stratos', color: 0x2e7d32 },
]

const PLAYER_COLORS = [0xc62828, 0x1565c0, 0x2e7d32, 0xef6c00]

type Mode = 'entry' | 'menu' | 'race'

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
  private readonly entry: Entry
  private readonly net = new NetClient()
  private mode: Mode = 'entry'
  private lastTime = 0
  private running = false
  private lastTrackId = TRACKS[0].id
  private lastVehicle: VehicleKind = TRACKS[0].vehicle
  private lastColor = PLAYER_COLORS[0]!
  private lastNeon = 0xff2bd6
  private lastTuning: PlayerTuningValues = { ...DEFAULT_PLAYER_TUNING }
  private lastDifficulty: DifficultyDef = getDifficulty('normal')
  private multiplayer = false
  private isHost = false
  private localSlot = 0
  private lastMpLaps = 2
  private mpRaceEnded = false
  /** net playerId → vehicle index */
  private netSlots = new Map<string, number>()
  private remoteState = new Map<string, CarStateMsg>()
  private stateAcc = 0
  private unsubNet: (() => void) | null = null
  private publicWsUrl = ''
  private readonly audio = new EngineAudio()
  private atmosphere: AtmosphereSettingsValues = loadAtmosphereSettings()
  private raceSettings: RaceSettingsValues = loadRaceSettings()
  private controlFeel: ControlFeelValues = loadControlFeel()
  private activeCompetition: CompetitionId = 'none'
  private recordsSaved = false
  /** Pauza na mapě (Esc). */
  private paused = false
  /** Po otevření pauzy Esc ještě držíš — počkat na puštění. */
  private escArm = false

  constructor(
    canvas: HTMLCanvasElement,
    hudEl: HTMLElement,
    overlayEl: HTMLElement,
    menuEl: HTMLElement,
    entryEl: HTMLElement,
    mobileEl: HTMLElement,
  ) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance',
    })
    // 2.5D performance profile
    this.renderer.setPixelRatio(1)
    this.renderer.setSize(window.innerWidth, window.innerHeight, false)
    this.renderer.setClearColor(0x0e1218, 1)
    this.renderer.shadowMap.enabled = false
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.NoToneMapping
    this.renderer.info.autoReset = true

    this.camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.5, 2400)
    this.cams = new CameraController(this.camera)
    this.hud = new Hud(hudEl, overlayEl)
    this.menu = new Menu(menuEl)
    this.entry = new Entry(entryEl)
    this.menu.setOnStart((payload) => void this.handleMenuStart(payload))
    this.menu.setOnHostStart(() => this.hostStartRace())
    this.menu.setOnLeaveLobby(() => this.leaveLobby())
    this.menu.setOnReadyToggle((ready) => this.net.send({ type: 'ready', ready }))
    this.menu.setOnLobbyTrack((trackId) => {
      this.lastTrackId = trackId
      this.net.send({ type: 'setTrack', trackId })
    })
    this.menu.setOnLobbyLaps((laps) => {
      this.lastMpLaps = laps
      this.net.send({ type: 'setLaps', laps })
    })
    this.menu.setOnBrowseOnline(() => void this.ensureHubBrowse())
    this.entry.setOnEnter(() => this.openMenu())
    this.hud.setOnMenuRequest(() => {
      if (this.multiplayer) this.leaveLobby()
      else this.openMenu()
    })
    this.hud.setOnRestartRequest(() => {
      if (this.multiplayer) return
      this.beginSoloRace(
        this.lastTrackId,
        this.lastVehicle,
        this.lastColor,
        this.lastNeon,
        this.lastTuning,
        this.player.info.name,
        this.lastDifficulty.id,
      )
    })
    this.input.attachMobileUi(mobileEl)
    const unlock = () => {
      this.audio.unlock()
      if (this.mode === 'menu') this.audio.setMusic(true)
    }
    this.menu.setAudioApi({
      get: () => this.audio.getSettings(),
      set: (partial) => this.audio.applySettings(partial),
      unlock: () => this.audio.unlock(),
    })
    this.menu.setAtmosphereApi({
      get: () => ({ ...this.atmosphere }),
      set: (partial) => {
        this.atmosphere = { ...this.atmosphere, ...partial }
        saveAtmosphereSettings(this.atmosphere)
        applyUiAtmosphere(this.atmosphere)
        this.track.setDecorQuality(this.atmosphere.decor)
        this.applyTheme(this.track.def)
      },
    })
    applyUiAtmosphere(this.atmosphere)
    this.menu.setRaceApi({
      get: () => ({ ...this.raceSettings }),
      set: (partial) => {
        this.raceSettings = { ...this.raceSettings, ...partial }
        saveRaceSettings(this.raceSettings)
      },
    })
    this.menu.setControlFeelApi({
      get: () => ({ ...this.controlFeel }),
      set: (partial) => {
        this.controlFeel = { ...this.controlFeel, ...partial }
        saveControlFeel(this.controlFeel)
        this.applyControlFeel()
      },
    })
    this.applyControlFeel()
    window.addEventListener('pointerdown', unlock, { once: true })
    window.addEventListener('keydown', unlock, { once: true })

    this.setupLights()
    this.track = new Track(this.scene, resolveTrackDef(getTrackDef(TRACKS[0].id), this.raceSettings.reverse))
    this.track.setDecorQuality(this.atmosphere.decor)
    this.applyTheme(this.track.def)

    for (let i = 0; i < 4; i++) {
      const info: DriverInfo =
        i === 0
          ? {
              id: 'p1',
              name: t('player.you'),
              team: 'Klec',
              color: PLAYER_COLORS[0],
              isPlayer: true,
              isBot: false,
            }
          : {
              id: `ai${i}`,
              name: AI_NAMES[i - 1].name,
              team: AI_NAMES[i - 1].team,
              color: AI_NAMES[i - 1].color,
              isPlayer: false,
              isBot: true,
            }
      const tuning =
        i === 0
          ? profileForKind('street', DEFAULT_PLAYER_TUNING)
          : aiProfileForKind('street', i)
      const v = new Vehicle(info, tuning, 'street')
      this.scene.add(v.mesh)
      this.vehicles.push(v)
      this.ai.set(v, new AiDriver(i, this.lastDifficulty))
    }
    this.player = this.vehicles[0]
    this.race = new RaceManager(this.track, this.vehicles)

    for (const v of this.vehicles) v.mesh.visible = false

    window.addEventListener('resize', () => this.onResize())
    this.onResize()

    // Auto-join z odkazu přeskočí entry
    const room = roomFromUrl()
    if (room) {
      this.openMenu()
      const ws = wsFromUrl() || undefined
      void this.handleMenuStart({
        mode: 'join',
        trackId: TRACKS[0].id,
        vehicle: TRACKS[0].vehicle,
        color: PLAYER_COLORS[0]!,
        neon: 0xff2bd6,
        tuning: { ...DEFAULT_PLAYER_TUNING },
        name: t('menu.defaultName'),
        difficulty: 'normal',
        roomCode: room,
        publicWsUrl: ws || undefined,
      })
    } else {
      this.showEntry()
    }
  }

  private showEntry(): void {
    this.mode = 'entry'
    this.menu.hide()
    this.input.setMobileHud(false)
    this.hud.update(this.player, this.race, this.cams, false)
    this.audio.setActive(false)
    this.audio.setMusic(false)
    this.entry.show()
  }

  start(): void {
    this.running = true
    this.lastTime = performance.now()
    requestAnimationFrame((t) => this.frame(t))
  }

  private openMenu(): void {
    if (this.mode === 'race' && this.track?.def.sandbox) {
      this.saveSandboxRecord()
    }
    this.clearPause()
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
    this.entry.hide()
    this.input.setMobileHud(false)
    this.menu.show()
    this.hud.update(this.player, this.race, this.cams, false)
    this.audio.setActive(false)
    this.audio.unlock()
    this.audio.setMusic(true)
  }

  private clearPause(): void {
    this.paused = false
    this.escArm = false
    this.hud.setPaused(false, null)
  }

  private enterPause(): void {
    this.paused = true
    this.escArm = true
    this.syncPauseHud()
  }

  private resumeFromPause(): void {
    this.clearPause()
  }

  private syncPauseHud(): void {
    this.hud.setPaused(true, { kind: this.player.kind })
  }

  /** Plácek: uložit max freestyle skóre při odchodu (bez cíle závodu). */
  private saveSandboxRecord(): void {
    const trickPts = this.player.trickPoints
    submitRaceRecord({
      player: this.player.info.name,
      trackId: this.lastTrackId,
      vehicle: this.lastVehicle,
      timeMs: 0,
      fsScore: trickPts,
      trickPts,
    })
  }

  private leaveLobby(): void {
    const wasRacing = this.mode === 'race'
    if (this.net.connected) this.net.send({ type: 'leave' })
    this.multiplayer = false
    this.mpRaceEnded = false
    this.hud.setOnlineRace(false)
    this.clearPause()
    this.menu.setLobby(null, '', false)
    if (wasRacing) {
      for (const v of this.vehicles) {
        v.mesh.visible = false
        v.physics.speed = 0
      }
      this.mode = 'menu'
      this.input.setMobileHud(false)
      this.audio.setActive(false)
      this.audio.unlock()
      this.audio.setMusic(true)
      this.hud.update(this.player, this.race, this.cams, false)
    }
    this.menu.showOnline()
    void this.ensureHubBrowse()
  }

  private async ensureHubBrowse(): Promise<void> {
    const wsUrl = this.publicWsUrl || wsFromUrl() || defaultWsUrl()
    this.menu.setOnlineBrowser({ connecting: true, error: '' })
    try {
      if (!this.net.connected || this.net.lastUrl !== wsUrl) {
        await this.net.connect(wsUrl)
        this.unsubNet?.()
        this.unsubNet = this.net.onMessage((msg) => this.onNetMessage(msg))
      }
      this.net.send({ type: 'hello', name: this.menu.getPlayerName() || t('menu.defaultName') })
      this.menu.setOnlineBrowser({ connected: true, connecting: false, error: '' })
    } catch (e) {
      this.menu.setOnlineBrowser({
        connected: false,
        connecting: false,
        error: e instanceof Error ? e.message : t('menu.onlineOffline'),
      })
    }
  }

  private async handleMenuStart(payload: MenuStartPayload): Promise<void> {
    this.lastTrackId = payload.trackId
    this.lastVehicle = payload.vehicle
    this.lastColor = payload.color
    this.lastNeon = payload.neon
    this.lastTuning = { ...payload.tuning }
    this.lastDifficulty = getDifficulty(payload.difficulty)
    this.publicWsUrl = payload.publicWsUrl || ''
    if (payload.laps) this.lastMpLaps = payload.laps

    if (payload.mode === 'solo') {
      this.beginSoloRace(
        payload.trackId,
        payload.vehicle,
        payload.color,
        payload.neon,
        payload.tuning,
        payload.name,
        payload.difficulty,
      )
      return
    }

    if (payload.mode === 'browse') {
      await this.ensureHubBrowse()
      return
    }

    const wsUrl = payload.publicWsUrl || wsFromUrl() || defaultWsUrl()
    try {
      this.menu.setLobby(null, '', false, t('menu.onlineConnecting'))
      this.menu.setOnlineBrowser({ connecting: true, error: '' })
      if (!this.net.connected || this.net.lastUrl !== wsUrl) {
        await this.net.connect(wsUrl)
      }
      this.menu.setOnlineBrowser({ connected: true, connecting: false, error: '' })
    } catch (e) {
      const err = e instanceof Error ? e.message : t('menu.onlineOffline')
      this.menu.setLobby(null, '', false, err)
      this.menu.setOnlineBrowser({ connected: false, connecting: false, error: err })
      return
    }

    this.unsubNet?.()
    this.unsubNet = this.net.onMessage((msg) => this.onNetMessage(msg))
    if (payload.mode === 'host') {
      this.isHost = true
      this.net.send({
        type: 'create',
        name: payload.name,
        color: this.lastColor || PLAYER_COLORS[0]!,
        trackId: payload.trackId,
        laps: this.lastMpLaps,
      })
    } else {
      this.isHost = false
      if (!payload.roomCode) {
        this.menu.setLobby(null, '', false, t('menu.roomCodePh'))
        return
      }
      this.net.send({
        type: 'join',
        code: payload.roomCode,
        name: payload.name,
        color: this.lastColor || PLAYER_COLORS[1]!,
      })
    }
  }

  private onNetMessage(msg: import('../net/protocol').ServerMessage): void {
    if (msg.type === 'presence') {
      this.menu.setOnlineBrowser({
        connected: true,
        connecting: false,
        presence: msg.presence,
        error: '',
      })
      return
    }
    if (msg.type === 'error') {
      this.menu.setLobby(null, '', this.isHost, msg.message, this.net.playerId)
      this.menu.setOnlineBrowser({ error: msg.message })
      return
    }
    if (msg.type === 'left') {
      this.menu.setLobby(null, '', false)
      this.net.send({ type: 'hello', name: this.menu.getPlayerName() || t('menu.defaultName') })
      return
    }
    if (msg.type === 'welcome' || msg.type === 'room') {
      const room = msg.room
      this.isHost = room.hostId === this.net.playerId
      this.lastTrackId = room.trackId
      this.lastMpLaps = room.laps
      const link = roomLink(room.code, this.publicWsUrl || this.net.lastUrl)
      this.menu.setLobby(room, link, this.isHost, '', this.net.playerId)
      return
    }
    if (msg.type === 'start') {
      this.lastMpLaps = msg.laps
      this.beginMultiplayerRace(msg.trackId, msg.order, msg.room, msg.laps)
      return
    }
    if (msg.type === 'state') {
      this.remoteState.set(msg.playerId, msg)
      return
    }
    if (msg.type === 'phase' && msg.phase === 'finished') {
      this.mpRaceEnded = true
    }
  }

  private hostStartRace(): void {
    if (!this.isHost) return
    this.net.send({ type: 'start', trackId: this.lastTrackId, laps: this.lastMpLaps })
  }

  private beginSoloRace(
    trackId: string,
    vehicle: VehicleKind,
    color: number,
    neon: number,
    tuning: PlayerTuningValues,
    name = t('player.you'),
    difficulty: DifficultyId = 'normal',
  ): void {
    this.multiplayer = false
    this.mpRaceEnded = false
    this.hud.setOnlineRace(false)
    this.clearPause()
    this.lastVehicle = vehicle
    this.lastColor = color
    this.lastNeon = neon
    this.lastDifficulty = getDifficulty(difficulty)
    this.activeCompetition = loadCompetitionSettings().id
    if (this.activeCompetition === 'trickHunt' && vehicle !== 'skate' && vehicle !== 'bike') {
      vehicle = 'skate'
      this.lastVehicle = vehicle
    }
    this.menu.hide()
    this.mode = 'race'
    this.setupGridSolo(name, color, neon)
    this.loadTrack(trackId, vehicle, tuning)
    this.applyAiDifficulty()
    this.race = new RaceManager(this.track, this.vehicles)
    this.race.finishPolicy = 'solo'
    this.race.start({ skipCountdown: this.raceSettings.skipCountdown })
    this.resetAiRails()
    for (const v of this.vehicles) v.mesh.visible = true
    this.hud.setCompetition(this.activeCompetition)
    // Sandbox / freestyle / solo soutěže — bez AI soupeřů
    const soloChallenge =
      this.activeCompetition === 'timeAttack' ||
      this.activeCompetition === 'trickHunt' ||
      this.activeCompetition === 'cleanRun' ||
      this.activeCompetition === 'paceGhost' ||
      this.activeCompetition === 'sprintDash' ||
      this.activeCompetition === 'driftScore'
    if (this.track.def.sandbox || this.raceSettings.freestyle || soloChallenge) {
      for (let i = 0; i < this.vehicles.length; i++) {
        if (i === this.localSlot) continue
        this.vehicles[i].mesh.visible = false
        this.vehicles[i].finished = true
      }
    }
    this.input.setMobileHud(true)
    this.audio.unlock()
    this.audio.setMusic(true)
    this.audio.setActive(true)
  }

  private beginMultiplayerRace(
    trackId: string,
    order: string[],
    room: NetRoom,
    laps = room.laps || 2,
  ): void {
    this.multiplayer = true
    this.mpRaceEnded = false
    this.activeCompetition = 'none'
    this.hud.setCompetition('none')
    this.hud.setOnlineRace(true)
    this.menu.hide()
    this.mode = 'race'
    this.lastTrackId = trackId
    this.lastMpLaps = laps
    this.setupGridMultiplayer(order, room)
    this.loadTrack(trackId, this.lastVehicle, this.lastTuning)
    this.applyAiDifficulty()
    this.race = new RaceManager(this.track, this.vehicles)
    this.race.finishPolicy = 'multi'
    this.race.start({
      skipCountdown: this.raceSettings.skipCountdown,
      laps: this.track.def.loop ? laps : 1,
    })
    this.resetAiRails()
    for (const v of this.vehicles) v.mesh.visible = true
    this.input.setMobileHud(true)
    this.audio.unlock()
    this.audio.setMusic(true)
    this.audio.setActive(true)
  }

  private applyControlFeel(): void {
    this.input.steerSens = this.controlFeel.steerSens
    this.input.invertSteer = this.controlFeel.invertSteer
    this.input.setMobileScheme(this.controlFeel.mobileScheme)
    this.cams.followRate = camFollowRate(this.controlFeel.camFollow)
    applyHudScale(this.controlFeel.hudScale)
    for (const v of this.vehicles) {
      v.physics.stabilityAssist = this.controlFeel.stabilityAssist
    }
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

  private setupGridSolo(name: string, color: number, neon: number): void {
    this.netSlots.clear()
    this.remoteState.clear()
    this.localSlot = 0
    this.vehicles[0].info.name = name
    this.vehicles[0].info.isPlayer = true
    this.vehicles[0].info.isBot = false
    this.vehicles[0].setColor(color)
    this.vehicles[0].setNeon(neon)
    for (let i = 1; i < 4; i++) {
      this.vehicles[i].info.isPlayer = false
      this.vehicles[i].info.isBot = true
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
        this.vehicles[i].info.isBot = false
        if (netId === this.net.playerId) this.localSlot = i
      } else {
        const ai = AI_NAMES[i % AI_NAMES.length]
        this.vehicles[i].info.name = ai.name
        this.vehicles[i].info.team = ai.team
        this.vehicles[i].setColor(ai.color)
        this.vehicles[i].info.isPlayer = false
        this.vehicles[i].info.isBot = true
      }
    }
    this.player = this.vehicles[this.localSlot]
  }

  private loadTrack(trackId: string, vehicle: VehicleKind, playerTuning: PlayerTuningValues): void {
    this.input.reloadBindings()
    this.recordsSaved = false
    const base = getTrackDef(trackId)
    const def = resolveTrackDef(base, this.raceSettings.reverse)
    this.track.dispose()
    this.track = new Track(this.scene, def)
    this.track.aiSpeedMult = aiSpeedMultForVehicle(base.aiSpeedMult, base.vehicle, vehicle)
    this.track.setDecorQuality(this.atmosphere.decor)
    this.applyTheme(def)
    const nameKey = `track.${base.id}.name`
    const trackName = t(nameKey) === nameKey ? def.name : t(nameKey)
    this.hud.setTrackName(
      `${trackName}${this.raceSettings.reverse ? ' ←' : ''} · ${labelVehicle(vehicle)}`,
    )

    const tx =
      !this.input.mobile && transmissionAllowedFor(vehicle)
        ? this.raceSettings.transmission
        : 'auto'
    // Solo: AI stejná kategorie (freestyle vs ostatní). Multiplayer: cokoliv vs cokoliv.
    const opponents = this.multiplayer
      ? this.raceSettings.opponents
      : clampOpponentsToCategory(
          this.raceSettings.opponents,
          vehicle,
          this.raceSettings.freestyle,
        )
    if (!this.multiplayer) {
      this.raceSettings.opponents = opponents
      saveRaceSettings(this.raceSettings)
    }
    const trackSpeed = base.playerSpeedMult ?? 1
    for (let i = 0; i < this.vehicles.length; i++) {
      const v = this.vehicles[i]
      const kind =
        i === this.localSlot
          ? vehicle
          : opponents[i - 1] ?? vehicle
      v.setKind(kind, this.scene)
      if (i === this.localSlot) {
        const tun = profileForKind(vehicle, playerTuning)
        v.physics.applyTuning({
          ...tun,
          speedCapMult: (tun.speedCapMult ?? 1) * trackSpeed,
        })
        v.physics.transmission = tx
        v.physics.driftMode = false
        v.setNeon(this.lastNeon)
      } else {
        const tun = aiProfileForKind(kind, i)
        v.physics.applyTuning({
          ...tun,
          speedCapMult: (tun.speedCapMult ?? 1) * trackSpeed,
        })
        v.physics.transmission = 'auto'
        v.physics.driftMode = false
        v.setNeon(0x2de2e6)
      }
      v.setColor(v.info.color)
    }
    this.player = this.vehicles[this.localSlot]
    this.applyControlFeel()
  }

  private applyTheme(def: (typeof TRACKS)[number]): void {
    const { sky, fog } = def.theme
    this.scene.background = new THREE.Color(sky)
    const scale = fogDistanceScale(this.atmosphere.fog)
    // Lineární fog je levnější než Exp2
    if (def.world === 'city') {
      this.scene.fog = new THREE.Fog(fog, 35 * scale, 220 * scale)
    } else if (def.id === 'mexiku') {
      // otevřená etapa — mlha by celou scénu vybělila
      this.scene.fog = null
    } else if (def.world === 'rally' || def.world === 'climb') {
      this.scene.fog = new THREE.Fog(fog, 90 * scale, 420 * scale)
    } else if (def.world === 'plaza') {
      this.scene.fog = new THREE.Fog(fog, 80 * scale, 380 * scale)
    } else {
      this.scene.fog = new THREE.Fog(fog, 55 * scale, 340 * scale)
    }

    const hemi = this.scene.getObjectByName('hemi') as THREE.HemisphereLight | undefined
    const sun = this.scene.getObjectByName('sun') as THREE.DirectionalLight | undefined
    if (def.world === 'city') {
      hemi?.color.setHex(0x4a3080)
      hemi?.groundColor.setHex(0x1a1028)
      if (hemi) hemi.intensity = 0.6
      sun?.color.setHex(0xff66cc)
      if (sun) {
        sun.intensity = 0.5
        sun.position.set(80, 80, 40)
      }
    } else if (def.world === 'rally' || def.world === 'climb') {
      hemi?.color.setHex(0xc8dff0)
      hemi?.groundColor.setHex(0x5a6a40)
      if (hemi) hemi.intensity = 0.9
      sun?.color.setHex(0xfff5e8)
      if (sun) {
        sun.intensity = 1
        sun.position.set(80, 120, 40)
      }
    } else if (def.world === 'plaza') {
      hemi?.color.setHex(0xb8e0f0)
      hemi?.groundColor.setHex(0x4a6a40)
      if (hemi) hemi.intensity = 0.95
      sun?.color.setHex(0xfff4d8)
      if (sun) {
        sun.intensity = 1.05
        sun.position.set(60, 130, 50)
      }
    } else {
      hemi?.color.setHex(0xffb080)
      hemi?.groundColor.setHex(0x3a2818)
      if (hemi) hemi.intensity = 0.55
      sun?.color.setHex(0xff6a32)
      if (sun) {
        sun.intensity = 0.95
        sun.position.set(-70, 22, 130)
      }
    }

    // Atmosférické osvětlení (dim / normal / bright)
    const lightMul = lightIntensityScale(this.atmosphere.light)
    const ambient = this.scene.getObjectByName('ambient') as THREE.AmbientLight | undefined
    if (ambient) ambient.intensity = 0.4 * lightMul
    if (hemi) hemi.intensity *= lightMul
    if (sun) sun.intensity *= lightMul
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

    if (this.mode === 'entry' || this.mode === 'menu') {
      if (this.mode === 'menu' && this.input.pressed('Escape')) {
        const nav = this.menu.handleEscape()
        if (nav === 'to-entry') this.showEntry()
      }
      const t = now * 0.00015
      this.camera.position.set(Math.sin(t) * 140, 55, Math.cos(t) * 140)
      this.camera.lookAt(0, 0, 0)
      this.renderer.render(this.scene, this.camera)
      this.input.endFrame()
      requestAnimationFrame((n) => this.frame(n))
      return
    }

    if (this.input.pressed('KeyR') && !this.multiplayer && !this.paused) {
      this.beginSoloRace(
        this.lastTrackId,
        this.lastVehicle,
        this.lastColor,
        this.lastNeon,
        this.lastTuning,
        this.player.info.name,
        this.lastDifficulty.id,
      )
      requestAnimationFrame((n) => this.frame(n))
      return
    }

    // Po výsledcích Esc rovnou do menu; jinak pauza (2. Esc = menu · jiná klávesa = hra)
    if (!this.paused && this.input.pressed('Escape')) {
      if (this.race.phase === 'finished') {
        this.openMenu()
      } else {
        this.enterPause()
      }
      this.input.endFrame()
      requestAnimationFrame((n) => this.frame(n))
      return
    }
    if (this.paused) {
      if (this.escArm) {
        if (!this.input.escapeHeld) this.escArm = false
      } else if (this.input.pressed('Escape') || this.input.actionPressed('menu')) {
        this.openMenu()
        this.input.endFrame()
        requestAnimationFrame((n) => this.frame(n))
        return
      } else if (this.input.anyPressedExcept('Escape')) {
        this.resumeFromPause()
      }

      this.cams.update(dt, this.player)
      this.audio.update(this.vehicles, this.player, false)
      this.hud.update(this.player, this.race, this.cams, true)
      this.renderer.render(this.scene, this.camera)
      this.input.endFrame()
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
        if (this.race.phase === 'racing' && v.physics.manualShift) {
          const clutchIn =
            v.physics.transmission !== 'clutch' || this.input.actionHeld('clutch')
          if (this.input.actionPressed('shiftUp')) v.physics.shiftUp(clutchIn)
          if (this.input.actionPressed('shiftDown')) v.physics.shiftDown(clutchIn)
        }
        const sandboxFs = !!this.track.def.sandbox
        const trickHunt = this.activeCompetition === 'trickHunt'
        const freestyleMode = sandboxFs || this.raceSettings.freestyle || trickHunt
        // Telefon / tablet: jen klasická jízda — žádné freestyle triky
        const mobileClassic = this.input.mobile
        v.freestyleOn =
          !mobileClassic && freestyleMode && (v.kind === 'skate' || v.kind === 'bike')
        // Drift e-brake jen na drift mapě a mimo freestyle (klasické řízení)
        v.physics.driftMode = !!this.track.def.drift && !freestyleMode && !mobileClassic
        const controls =
          this.race.phase === 'racing'
            ? {
                throttle: this.input.throttle,
                brake: this.input.brake,
                steer: this.input.steer,
                push: this.input.push,
                tab: this.input.tab,
                ebrake: this.input.actionHeld('ebrake') ? 1 : 0,
                trickLetter: v.freestyleOn ? this.input.trickLetter : null,
              }
            : {
                throttle: 0,
                brake: 0,
                steer: 0,
                push: 0,
                tab: 0,
                ebrake: 0,
                trickLetter: null,
              }
        if (this.race.phase === 'countdown') {
          v.physics.speed = 0
          v.syncMesh()
        } else {
          v.update(dt, controls, this.track)
        }
      } else if (this.isAiSlot(i)) {
        if (this.track.def.sandbox) {
          v.mesh.visible = false
          v.physics.speed = 0
          continue
        }
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
      // Pozice už drží Vehicle.update (constrain + plynulý odraz)
      this.race.update(dt)
    }

    if (this.race.phase === 'finished' && !this.recordsSaved) {
      this.recordsSaved = true
      const place = this.race.playerPlace()
      const trickPts = this.player.trickPoints
      const driftPts = this.player.driftPoints
      const fsScore =
        this.activeCompetition === 'driftScore'
          ? driftPts
          : placePoints(place) + trickPts
      submitRaceRecord({
        player: this.player.info.name,
        trackId: this.lastTrackId,
        vehicle: this.lastVehicle,
        timeMs: this.player.finishTime || this.race.raceTimeMs,
        fsScore,
        trickPts: this.activeCompetition === 'driftScore' ? driftPts : trickPts,
      })
    }
    if (this.race.phase !== 'finished') this.recordsSaved = false

    this.stateAcc += dt
    if (this.stateAcc >= 0.05) {
      this.stateAcc = 0
      this.pushNetState()
    }

    if (this.multiplayer && this.isHost && this.race.phase === 'finished') {
      this.net.send({ type: 'phase', phase: 'finished' })
    }

    if (this.multiplayer && this.race.phase === 'finished' && !this.mpRaceEnded) {
      this.mpRaceEnded = true
      // Po dojetí: krátká pauza, pak ven z místnosti do singleplayer menu
      window.setTimeout(() => {
        if (this.mode !== 'race' || !this.multiplayer) return
        this.leaveLobby()
      }, 4500)
    }

    this.cams.update(dt, this.player)
    this.audio.update(this.vehicles, this.player, this.race.phase === 'racing')
    this.hud.update(this.player, this.race, this.cams, true)
    this.renderer.render(this.scene, this.camera)
    this.input.endFrame()

    requestAnimationFrame((n) => this.frame(n))
  }
}

function labelVehicle(kind: VehicleKind): string {
  const key = `vehicle.${kind}`
  const named = t(key)
  return named === key ? kind : named
}
