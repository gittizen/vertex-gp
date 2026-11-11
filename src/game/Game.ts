import * as THREE from 'three'
import { AiDriver } from '../ai/AiDriver'
import { getDifficulty, type DifficultyDef, type DifficultyId } from '../ai/Difficulty'
import {
  ingestFinishedRace,
  installLearnDebugApi,
  syncCloudPaceModel,
} from '../ai/CommunityLearning'
import { installPaceDebugApi, recordPaceSample } from '../ai/PaceCalibration'
import { CameraController } from '../camera/CameraController'
import { RearViewMirror } from '../camera/RearViewMirror'
import { EngineAudio } from '../audio/EngineAudio'
import {
  applyUiAtmosphere,
  fogDistanceScale,
  lightIntensityScale,
  loadAtmosphereSettings,
  saveAtmosphereSettings,
  sceneForVisualQuality,
  type AtmosphereSettingsValues,
} from '../render/AtmosphereSettings'
import { Actor } from '../engine/Actor'
import { Engine } from '../engine/Engine'
import { SceneLightRig } from '../engine/components/SceneLightRig'
import {
  loadVisualSettings,
  saveVisualSettings,
  visualFlagsForQuality,
  type VisualSettingsValues,
} from '../render/VisualSettings'
import { createSkyGradientTexture, tickSkyBackdrop } from '../render/SkyBackdrop'
import {
  loadRaceSettings,
  randomOpponents,
  saveRaceSettings,
  transmissionAllowedFor,
  type RaceSettingsValues,
} from '../render/RaceSettings'
import {
  championshipAiSpeedFactor,
  championshipProgressLabel,
  championshipTotalRounds,
  championshipTrackId,
  championshipReverse,
  abandonRound,
  getCareer,
  recordRoundFinish,
  wipeChampionshipSaves,
  isChampFsQual,
  CHAMP_FS_QUAL_MS,
} from '../race/Championship'
import { roundPoints } from '../race/ChampEconomy'
import { champTuningToSolo } from '../tuning/PlayerTuning'
import type { VehicleBranch } from '../vehicle/VehicleLook'
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
import {
  requestLandscapeAfterGesture,
  setAllowPortraitRotation,
  startOrientationWatch,
  updateRotateGateCopy,
} from '../input/OrientationLock'
import { Input } from '../input/Input'
import {
  applyMobileLookCss,
  installVisualViewportSync,
  mobileCamDist,
  mobileUiFactor,
} from '../input/MobileLook'
import { NetClient, roomLink, roomFromUrl, wsFromUrl, defaultWsUrl } from '../net/NetClient'
import type { CarStateMsg, NetRoom } from '../net/protocol'
import { RaceManager } from '../race/RaceManager'
import { Track } from '../track/Track'
import {
  getTrackDef,
  resolveTrackDef,
  TRACKS,
  VEHICLE_KINDS,
  type VehicleKind,
} from '../track/TrackDefs'
import { type PlayerTuningValues, DEFAULT_PLAYER_TUNING } from '../tuning/PlayerTuning'
import { onLocaleChange, t } from '../i18n/i18n'
import { Entry } from '../ui/Entry'
import { Hud } from '../ui/Hud'
import { Menu, type MenuStartPayload } from '../ui/Menu'
import { Vehicle, type DriverInfo } from '../vehicle/Vehicle'
import {
  aiVehicleLook,
  DEFAULT_VEHICLE_LOOK,
  type VehicleLook,
} from '../vehicle/VehicleLook'
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
  /** Klec Engine — World / Actor / URP-like render (Unity/Unreal styl). */
  private readonly engine: Engine
  private readonly lightRig: SceneLightRig
  private readonly camera: THREE.PerspectiveCamera
  private readonly input = new Input()
  private track: Track
  private readonly vehicles: Vehicle[] = []
  private player: Vehicle
  private readonly ai = new Map<Vehicle, AiDriver>()
  private race: RaceManager
  private readonly cams: CameraController
  private readonly mirror = new RearViewMirror()
  private readonly hud: Hud
  private readonly menu: Menu
  private readonly entry: Entry
  private readonly net = new NetClient()
  private mode: Mode = 'entry'
  private running = false
  private lastTrackId = TRACKS[0].id
  private lastVehicle: VehicleKind = 'street'
  private lastColor = PLAYER_COLORS[0]!
  private lastLook: VehicleLook = { ...DEFAULT_VEHICLE_LOOK, body: PLAYER_COLORS[0]! }
  private lastTuning: PlayerTuningValues = { ...DEFAULT_PLAYER_TUNING }
  private lastDifficulty: DifficultyDef = getDifficulty('normal')
  private multiplayer = false
  private isHost = false
  private localSlot = 0
  private lastMpLaps = 3
  private mpRaceEnded = false
  /** Salt pro AI barvy (nový každý solo závod). */
  private aiLookSalt = (Math.random() * 1e9) | 0
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
  private visual: VisualSettingsValues = loadVisualSettings()
  private activeCompetition: CompetitionId = 'none'
  private activeChampionship: { branch: VehicleBranch; season: 1 | 2 } | null = null
  private recordsSaved = false
  /** Pauza na mapě (Esc). */
  private paused = false
  /** Po otevření pauzy Esc ještě držíš — počkat na puštění. */
  private escArm = false
  /** Rising-edge Esc (spolehlivější než jen justPressed). */
  private escWasDown = false
  /** Po Esc z countdownu neber hned další Esc jako „zpět na entry“. */
  private ignoreEscUntilRelease = false
  private fpsAcc = 0
  private fpsFrames = 0
  private fpsShown = 60

  private get scene(): THREE.Scene {
    return this.engine.world.scene
  }

  constructor(
    canvas: HTMLCanvasElement,
    hudEl: HTMLElement,
    overlayEl: HTMLElement,
    menuEl: HTMLElement,
    entryEl: HTMLElement,
    mobileEl: HTMLElement,
  ) {
    this.engine = new Engine({ canvas, visual: this.visual, worldName: 'KlecGPWorld' })
    this.camera = this.engine.render.camera
    const lights = new Actor('DirectionalLightRig')
    this.lightRig = lights.addComponent(new SceneLightRig())
    this.engine.world.spawnActor(lights)
    this.lightRig.configureShadows(this.engine.render.pipeline, this.visual)
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
    this.menu.setOnBackToEntry(() => this.showEntry())
    this.entry.setOnEnter(() => this.openMenu())
    // Zrušit závod = ven bez postupu (šamp kolo se neposune)
    this.hud.setOnMenuRequest(() => {
      if (this.multiplayer) this.leaveLobby()
      else this.openMenu()
    })
    this.hud.setOnPauseRequest(() => {
      if (this.mode !== 'race' || this.paused) return
      if (this.race.phase === 'countdown' || this.race.phase === 'finished') {
        this.openMenu()
        return
      }
      this.enterPause()
    })
    this.hud.setOnResumeRequest(() => {
      if (this.paused) this.resumeFromPause()
    })
    this.hud.setOnRestartRequest(() => this.restartSoloSameRace({ sameTrack: true }))
    this.hud.setOnChampionshipNext(() => {
      if (this.activeChampionship) {
        const career = getCareer(this.activeChampionship.branch, this.activeChampionship.season)
        if (career?.done || (career?.qualified && (!career.leagueChosen || !career.seriesChosen))) {
          this.openMenu()
          return
        }
      }
      this.restartSoloSameRace({ sameTrack: false })
    })
    this.hud.setOnImmortalToggle(() => {
      if (this.multiplayer || !this.paused) return
      const next = !this.controlFeel.immortality
      this.controlFeel = { ...this.controlFeel, immortality: next }
      saveControlFeel(this.controlFeel)
      if (this.player) this.player.immortal = next
      this.syncPauseHud()
    })
    this.hud.setOnRetireRequest(() => {
      if (this.mode !== 'race' || this.multiplayer) return
      if (this.race.phase === 'finished') return
      this.clearPause()
      // Šamp: DNF / postup kola jako poslední → brief
      if (this.activeChampionship) {
        const career = getCareer(this.activeChampionship.branch, this.activeChampionship.season)
        if (career && !career.done) abandonRound(career)
        this.openMenu()
        return
      }
      // Sandbox / Plácek: ulož skóre a ven
      if (this.track.def.sandbox) {
        this.saveSandboxRecord()
        this.openMenu()
        return
      }
      // Ostatní módy: dojeď jako poslední → finish overlay + záznamy
      this.race.retirePlayerLast()
      this.recordsSaved = false
    })
    this.input.attachMobileUi(mobileEl)
    const unlock = () => {
      this.audio.unlock()
      requestLandscapeAfterGesture()
      if (this.mode === 'menu') this.audio.setMusic(true)
    }
    this.menu.setAudioApi({
      get: () => this.audio.getSettings(),
      set: (partial) => this.audio.applySettings(partial),
      unlock: () => this.audio.unlock(),
      playClick: () => this.audio.playMenuClick(),
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
    this.menu.setVisualApi({
      get: () => ({ ...this.visual }),
      set: (partial) => {
        this.visual = { ...this.visual, ...partial }
        if (partial.quality) {
          this.visual = { ...this.visual, ...visualFlagsForQuality(partial.quality) }
          this.atmosphere = { ...this.atmosphere, ...sceneForVisualQuality(partial.quality) }
          saveAtmosphereSettings(this.atmosphere)
          applyUiAtmosphere(this.atmosphere)
          this.track.setDecorQuality(this.atmosphere.decor)
          this.applyTheme(this.track.def)
        }
        saveVisualSettings(this.visual)
        this.mirror.setEnabled(this.visual.rearMirror)
        this.hud.setMirrorFrame(this.visual.rearMirror && this.mode === 'race')
        this.applyVisual()
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
    applyMobileLookCss()
    this.applyControlFeel()
    startOrientationWatch({
      allowPortrait: this.controlFeel.allowPortraitRotation,
      onChange: () => this.onResize(),
    })
    installVisualViewportSync(() => this.onResize())
    const syncRotateCopy = () =>
      updateRotateGateCopy(t('menu.rotateTitle'), t('menu.rotateBlurb'))
    syncRotateCopy()
    onLocaleChange(syncRotateCopy)
    this.mirror.setEnabled(this.visual.rearMirror)
    this.hud.setMirrorFrame(false)
    installPaceDebugApi()
    installLearnDebugApi()
    void syncCloudPaceModel()
    this.installQaApi()
    window.addEventListener('pointerdown', unlock, { once: true })
    window.addEventListener('keydown', unlock, { once: true })
    window.addEventListener('orientationchange', () => {
      window.setTimeout(() => {
        this.onResize()
        this.input.recenterTilt()
        this.syncMobileBoostUi()
        this.syncMobileFsPad()
      }, 180)
    })

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
      v.setCastShadow(this.visual.shadows)
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
        neon: DEFAULT_VEHICLE_LOOK.neon,
        wheel: DEFAULT_VEHICLE_LOOK.wheel,
        rider: DEFAULT_VEHICLE_LOOK.rider,
        helm: DEFAULT_VEHICLE_LOOK.helm,
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
    this.hud.setMirrorFrame(false)
    this.audio.setActive(false)
    this.audio.setMusic(false)
    this.entry.show()
  }

  start(): void {
    this.running = true
    this.engine.setGameTick((dt) => this.gameTick(dt))
    this.engine.start()
  }

  private openMenu(): void {
    if (this.mode === 'race' && this.track?.def.sandbox) {
      this.saveSandboxRecord()
    }
    const fromRace = this.mode === 'race'
    const wasMp = this.multiplayer
    const champ = this.activeChampionship
    this.clearPause()
    this.input.setTabBoostHeld(false)
    this.input.setEbrakeHeld(false)
    this.escWasDown = true // dokud Esc držíš, neotevírej znovu
    this.ignoreEscUntilRelease = true
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
    if (wasMp) {
      this.activeChampionship = null
      this.menu.showOnline()
    } else if (champ) {
      const career = getCareer(champ.branch, champ.season)
      if (career?.done) this.menu.showChampionshipTrophy(career)
      else if (career) this.menu.showChampionshipBrief(champ.branch, champ.season)
      else {
        this.activeChampionship = null
        this.menu.showHome()
      }
    } else if (fromRace) {
      this.menu.showRaceSetup()
    } else {
      this.menu.show()
    }
    this.hud.update(this.player, this.race, this.cams, false)
    this.hud.setMirrorFrame(false)
    this.audio.setActive(false)
    this.audio.unlock()
    this.audio.setMusic(true)
  }

  private clearPause(): void {
    this.paused = false
    this.escArm = false
    this.hud.setPaused(false, null)
  }

  private resetEscEdge(): void {
    this.escWasDown = this.input.menuNavHeld
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
    this.hud.setPaused(true, {
      kind: this.player.kind,
      immortal: !!this.player.immortal,
      allowImmortal: !this.multiplayer,
    })
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
      immortal: this.player.immortal,
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
    this.lastLook = {
      body: payload.color,
      neon: payload.neon,
      wheel: payload.wheel ?? DEFAULT_VEHICLE_LOOK.wheel,
      rider: payload.rider ?? DEFAULT_VEHICLE_LOOK.rider,
      helm: payload.helm ?? DEFAULT_VEHICLE_LOOK.helm,
    }
    this.lastTuning = { ...payload.tuning }
    this.lastDifficulty = getDifficulty(payload.difficulty)
    this.publicWsUrl = payload.publicWsUrl || ''
    if (payload.laps) this.lastMpLaps = payload.laps

    if (payload.mode === 'solo') {
      this.activeChampionship = payload.championship ?? null
      this.beginSoloRace(
        payload.trackId,
        payload.vehicle,
        this.lastLook,
        payload.tuning,
        payload.name,
        payload.difficulty,
        { laps: payload.laps, timeLimitMs: payload.timeLimitMs },
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

  /** Po dojetí: sameTrack = opakovat stejnou trať; jinak šampionát posune dál. */
  private restartSoloSameRace(opts?: { sameTrack?: boolean }): void {
    if (this.multiplayer) return
    this.escWasDown = false
    this.hud.clearResultsOverlay()
    let vehicle = this.lastVehicle
    let tuning = this.lastTuning
    if (this.activeChampionship) {
      const career = getCareer(this.activeChampionship.branch, this.activeChampionship.season)
      if (career?.done) {
        this.openMenu()
        return
      }
      if (career) {
        vehicle = career.vehicle
        tuning = champTuningToSolo(career.tuning)
        this.lastVehicle = vehicle
        this.lastTuning = { ...tuning }
      }
    }
    this.beginSoloRace(
      this.lastTrackId,
      vehicle,
      this.lastLook,
      tuning,
      this.player.info.name,
      this.lastDifficulty.id,
      { keepTrack: opts?.sameTrack === true },
    )
  }

  private beginSoloRace(
    trackId: string,
    vehicle: VehicleKind,
    look: VehicleLook,
    tuning: PlayerTuningValues,
    name = t('player.you'),
    difficulty: DifficultyId = 'normal',
    opts?: { keepTrack?: boolean; laps?: number; timeLimitMs?: number },
  ): void {
    this.multiplayer = false
    this.mpRaceEnded = false
    this.recordsSaved = false
    this.aiLookSalt = (Math.random() * 1e9) | 0
    // Freestyle závod zrušen — triky zůstávají u skate/kola
    if (this.raceSettings.freestyle) {
      this.raceSettings.freestyle = false
      saveRaceSettings(this.raceSettings)
    }
    this.hud.setOnlineRace(false)
    this.hud.clearResultsOverlay()
    this.clearPause()
    this.lastVehicle = vehicle
    this.lastColor = look.body
    this.lastLook = { ...look }
    this.lastTuning = { ...tuning }
    this.lastDifficulty = getDifficulty(difficulty)
    this.activeCompetition = loadCompetitionSettings().id
    if (this.activeCompetition === 'trickHunt' && vehicle !== 'skate' && vehicle !== 'bike') {
      vehicle = 'skate'
      this.lastVehicle = vehicle
    }
    if (!opts?.keepTrack && this.activeChampionship) {
      const career = getCareer(this.activeChampionship.branch, this.activeChampionship.season)
      const champTrack = career ? championshipTrackId(career) : null
      if (champTrack) trackId = champTrack
      if (career) {
        this.raceSettings.reverse = championshipReverse(career)
        saveRaceSettings(this.raceSettings)
      }
    }
    this.lastTrackId = trackId
    this.menu.hide()
    this.mode = 'race'
    this.resetEscEdge()
    this.setupGridSolo(name, look)
    this.loadTrack(trackId, vehicle, tuning)
    this.applyAiDifficulty()
    this.race = new RaceManager(this.track, this.vehicles)
    this.race.finishPolicy = 'solo'
    let laps = this.track.def.loop ? this.raceSettings.laps : 1
    let timeLimitMs =
      typeof opts?.timeLimitMs === 'number' && Number.isFinite(opts.timeLimitMs)
        ? Math.max(0, Math.round(opts.timeLimitMs))
        : 0
    if (this.activeChampionship) {
      const career = getCareer(this.activeChampionship.branch, this.activeChampionship.season)
      if (career && isChampFsQual(career)) {
        timeLimitMs = CHAMP_FS_QUAL_MS
      } else if (career && !career.qualified && !(typeof opts?.laps === 'number')) {
        laps = 1
      }
    }
    if (typeof opts?.laps === 'number' && Number.isFinite(opts.laps)) {
      laps = Math.max(1, Math.min(5, Math.round(opts.laps)))
    }
    this.race.start({
      skipCountdown: this.raceSettings.skipCountdown,
      laps,
      timeLimitMs: timeLimitMs > 0 ? timeLimitMs : undefined,
    })
    this.resetAiRails()
    for (const v of this.vehicles) {
      v.mesh.visible = true
      v.finished = false
    }
    this.hud.setCompetition(this.activeCompetition)
    // Solo soutěže = bez AI. Normální závod (comp.none) = AI vždy jede.
    const soloChallenge =
      this.activeCompetition === 'timeAttack' ||
      this.activeCompetition === 'trickHunt' ||
      this.activeCompetition === 'cleanRun' ||
      this.activeCompetition === 'paceGhost' ||
      this.activeCompetition === 'sprintDash' ||
      this.activeCompetition === 'driftScore'
    for (let i = 0; i < this.vehicles.length; i++) {
      if (i === this.localSlot) continue
      if (this.track.def.sandbox || soloChallenge) {
        this.vehicles[i].mesh.visible = false
        this.vehicles[i].finished = true
      } else {
        this.vehicles[i].mesh.visible = true
        this.vehicles[i].finished = false
      }
    }
    // Hráč musí zůstat nedokončený — jinak solo race hned skončí.
    this.player.finished = false
    this.player.finishTime = 0
    this.input.setMobileHud(true)
    this.syncMobileBoostUi()
    this.syncMobileFsPad()
    this.hud.setMirrorFrame(this.visual.rearMirror)
    this.audio.unlock()
    this.audio.setMusic(true)
    this.audio.setActive(true)
  }

  private beginMultiplayerRace(
    trackId: string,
    order: string[],
    room: NetRoom,
    laps = room.laps || 3,
  ): void {
    this.multiplayer = true
    this.mpRaceEnded = false
    this.activeCompetition = 'none'
    this.hud.setCompetition('none')
    this.hud.setOnlineRace(true)
    this.menu.hide()
    this.mode = 'race'
    this.resetEscEdge()
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
    this.syncMobileBoostUi()
    this.syncMobileFsPad()
    this.hud.setMirrorFrame(this.visual.rearMirror)
    this.audio.unlock()
    this.audio.setMusic(true)
    this.audio.setActive(true)
  }

  /** Po dojetí: kalibrace + community učení (AI se upraví až pro další závod). */
  private recordPaceCalibration(finishTimeMs: number): void {
    // Multiplayer: závod běží, data pro AI učení se nesbírají
    if (this.multiplayer) return
    if (this.track.def.sandbox) return
    if (this.lastVehicle === 'scooter') return
    const len = Math.max(1, this.track.length)
    const bestLap = this.player.bestLapMs
    const isStage = this.race.isStage
    const paceMs = isStage
      ? finishTimeMs
      : Number.isFinite(bestLap) && bestLap > 0 && bestLap < Infinity
        ? bestLap
        : finishTimeMs / Math.max(1, this.race.totalLaps)
    if (!(paceMs > 500)) return
    recordPaceSample({
      trackId: this.lastTrackId,
      vehicle: this.lastVehicle,
      difficulty: this.lastDifficulty.id,
      paceMs,
      finishTimeMs,
      bestLapMs: Number.isFinite(bestLap) && bestLap < Infinity ? bestLap : 0,
      totalLaps: this.race.totalLaps,
      trackLength: len,
      avgSpeed: len / (paceMs / 1000),
      isStage,
      isSandbox: false,
      at: Date.now(),
    })
    ingestFinishedRace({
      player: this.player.info.name,
      trackId: this.lastTrackId,
      vehicle: this.lastVehicle,
      difficulty: this.lastDifficulty.id,
      finishTimeMs,
      paceMs,
      bestLapMs: Number.isFinite(bestLap) && bestLap < Infinity ? bestLap : 0,
      totalLaps: this.race.totalLaps,
      trackLength: len,
      place: this.race.playerPlace(),
      isStage,
      tuning: this.lastTuning,
      designPaceMs: this.track.def.targetPaceMs,
    })
  }

  private aiLook(slot: number): VehicleLook {
    return aiVehicleLook(slot, this.aiLookSalt)
  }

  private applyControlFeel(): void {
    this.input.steerSens = this.controlFeel.steerSens
    this.input.invertSteer = this.controlFeel.invertSteer
    this.input.setMobileScheme(this.controlFeel.mobileScheme)
    this.cams.followRate = camFollowRate(this.controlFeel.camFollow)
    this.cams.distScale = mobileCamDist()
    applyHudScale(this.controlFeel.hudScale, mobileUiFactor())
    setAllowPortraitRotation(this.controlFeel.allowPortraitRotation)
    this.syncMobileBoostUi()
    this.syncMobileFsPad()
    for (const v of this.vehicles) {
      v.physics.stabilityAssist = this.controlFeel.stabilityAssist
    }
    // Nesmrtelnost jen solo; online vždy vypnuto
    if (this.player) {
      this.player.immortal = !this.multiplayer && !!this.controlFeel.immortality
      this.player.applySkateStance(this.controlFeel.skateStance)
    }
  }

  private syncMobileBoostUi(): void {
    const v = this.player ?? this.vehicles[this.localSlot]
    this.input.setMobileBoostAllowed(!!v?.hasShiftSpecial())
  }

  private syncMobileFsPad(): void {
    const v = this.player ?? this.vehicles[this.localSlot]
    const board = v?.kind === 'skate' || v?.kind === 'bike'
    const portrait = window.matchMedia('(orientation: portrait)').matches
    this.input.setMobileFsPad(!!board && portrait, v?.kind === 'bike' ? 'bike' : 'skate')
  }

  private applyAiDifficulty(): void {
    let diff = this.lastDifficulty
    if (this.activeChampionship) {
      const career = getCareer(this.activeChampionship.branch, this.activeChampionship.season)
      if (career && !career.done) {
        const ramp = championshipAiSpeedFactor(
          career.round,
          career.season,
          championshipTotalRounds(career.league, career.trackPool),
        )
        diff = {
          ...this.lastDifficulty,
          speedScale: Math.max(0.2, this.lastDifficulty.speedScale * ramp),
        }
      }
    }
    for (let i = 0; i < this.vehicles.length; i++) {
      const brain = this.ai.get(this.vehicles[i])
      brain?.setDifficulty(diff)
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

  private setupGridSolo(name: string, look: VehicleLook): void {
    this.netSlots.clear()
    this.remoteState.clear()
    this.localSlot = 0
    this.vehicles[0].info.name = name
    this.vehicles[0].info.isPlayer = true
    this.vehicles[0].info.isBot = false
    this.vehicles[0].applyLook(look)
    for (let i = 1; i < 4; i++) {
      this.vehicles[i].info.isPlayer = false
      this.vehicles[i].info.isBot = true
      this.vehicles[i].info.name = AI_NAMES[i - 1].name
      this.vehicles[i].info.team = AI_NAMES[i - 1].team
      this.vehicles[i].applyLook(this.aiLook(i))
      this.vehicles[i].immortal = false
    }
    this.player = this.vehicles[0]
    // Nesmrtelnost jen solo
    this.player.immortal = !!this.controlFeel.immortality
  }

  private setupGridMultiplayer(order: string[], room: NetRoom): void {
    this.netSlots.clear()
    this.remoteState.clear()
    const byId = new Map(room.players.map((p) => [p.id, p]))

    for (let i = 0; i < 4; i++) {
      this.vehicles[i].immortal = false
      const netId = order[i]
      if (netId) {
        const p = byId.get(netId)!
        this.netSlots.set(netId, i)
        this.vehicles[i].info.name = p.name
        if (netId === this.net.playerId) {
          this.localSlot = i
          this.vehicles[i].applyLook(this.lastLook)
        } else {
          this.vehicles[i].applyLook({
            ...this.aiLook(i),
            body: p.color || PLAYER_COLORS[i]!,
          })
        }
        this.vehicles[i].info.isPlayer = netId === this.net.playerId
        this.vehicles[i].info.isBot = false
      } else if (this.menu.wantsLobbyFillAi()) {
        const ai = AI_NAMES[i % AI_NAMES.length]
        this.vehicles[i].info.name = ai.name
        this.vehicles[i].info.team = ai.team
        this.vehicles[i].applyLook(this.aiLook(i))
        this.vehicles[i].info.isPlayer = false
        this.vehicles[i].info.isBot = true
        this.vehicles[i].mesh.visible = true
      } else {
        this.vehicles[i].info.isPlayer = false
        this.vehicles[i].info.isBot = true
        this.vehicles[i].info.name = ''
        this.vehicles[i].mesh.visible = false
        this.vehicles[i].finished = true
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
    // Šampionát: pevný roster z career (nemění se s hráčovým autem).
    // Solo: default každý závod noví soupeři; jinak pevní z nastavení. Multi: lobby.
    const champCareer = this.activeChampionship
      ? getCareer(this.activeChampionship.branch, this.activeChampionship.season)
      : null
    let opponents: [VehicleKind, VehicleKind, VehicleKind]
    if (champCareer && !champCareer.done) {
      opponents = champCareer.rivals
    } else if (this.multiplayer || !this.raceSettings.randomOpponentsEachRace) {
      opponents = this.raceSettings.opponents
    } else {
      opponents = randomOpponents(vehicle, false)
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
        const board = vehicle === 'skate' || vehicle === 'bike'
        v.physics.driftMode = this.controlFeel.driftMode && !board
        v.applyLook(this.lastLook)
      } else {
        const tun = aiProfileForKind(kind, i)
        v.physics.applyTuning({
          ...tun,
          speedCapMult: (tun.speedCapMult ?? 1) * trackSpeed,
        })
        v.physics.transmission = 'auto'
        const board = kind === 'skate' || kind === 'bike'
        v.physics.driftMode = this.controlFeel.driftMode && !board
        v.applyLook(this.aiLook(i))
      }
    }
    this.player = this.vehicles[this.localSlot]
    this.applyControlFeel()
    this.syncMobileBoostUi()
    this.syncMobileFsPad()
  }

  private applyTheme(def: (typeof TRACKS)[number]): void {
    const { fog } = def.theme
    // UE-stylový gradient (equirect) — levnější než sky dome mesh
    const prevBg = this.scene.background
    const skyTex = createSkyGradientTexture(def)
    this.scene.background = skyTex
    if (prevBg instanceof THREE.Texture && !prevBg.userData.sharedSky) prevBg.dispose()
    // Reflexe laku = stejné nebe (ne studio RoomEnvironment)
    this.engine.render.pipeline.attachSkyEnvironment(
      this.scene,
      skyTex instanceof THREE.Texture ? skyTex : null,
    )
    const scale = fogDistanceScale(this.atmosphere.fog)
    // Exp2 = přirozená atmosférická perspektiva (reálný vzduch), ne „bílá stěna“
    if (def.id === 'mexiku') {
      // Lehká atmosféra — bez fog = peklostroj vypadal „plastově“ proti nebi
      this.scene.fog = new THREE.FogExp2(fog, 0.00085 / scale)
    } else if (def.world === 'city') {
      // Slabší mlha = čitelnější silnice vs terén vs domy
      this.scene.fog = new THREE.FogExp2(fog, 0.00115 / scale)
    } else if (def.world === 'rally') {
      this.scene.fog = new THREE.FogExp2(fog, 0.0014 / scale)
    } else if (def.world === 'climb') {
      this.scene.fog = new THREE.FogExp2(fog, 0.0017 / scale)
    } else if (def.world === 'plaza') {
      this.scene.fog = new THREE.FogExp2(fog, 0.0015 / scale)
    } else if (def.id === 'klecany') {
      this.scene.fog = new THREE.FogExp2(fog, 0.0016 / scale)
    } else {
      this.scene.fog = new THREE.FogExp2(fog, 0.0019 / scale)
    }

    const hemi = this.scene.getObjectByName('hemi') as THREE.HemisphereLight | undefined
    const sun = this.scene.getObjectByName('sun') as THREE.DirectionalLight | undefined
    const ambient = this.scene.getObjectByName('ambient') as THREE.AmbientLight | undefined
    const rim = this.scene.getObjectByName('rim') as THREE.DirectionalLight | undefined

    // Přirozené denní světlo (sun + skylight + bounce), ne arcade tint
    let ambientBase = 0.28
    let hemiBase = 0.62
    let sunBase = 1.35
    let rimBase = 0.22
    if (def.world === 'city') {
      // Noční kontrast: světlá silnice (emissive), tmavý terén, teplé lampy
      ambient?.color.setHex(0x243048)
      hemi?.color.setHex(0x3a5070)
      hemi?.groundColor.setHex(0x05060a)
      sun?.color.setHex(0xb0b8d0)
      rim?.color.setHex(0xffa060)
      ambientBase = 0.34
      hemiBase = 0.48
      sunBase = 0.48
      rimBase = 0.42
      this.lightRig.setSunOffset(90, 140, 60)
    } else if (def.world === 'rally' || def.id === 'turini') {
      // Novostavby: denní světlo bez „přepáleného“ laků na peklostroji
      ambient?.color.setHex(0xc4b8a4)
      hemi?.color.setHex(0xd8cbb4)
      hemi?.groundColor.setHex(0x4a3c2e)
      sun?.color.setHex(0xffe2c4)
      rim?.color.setHex(0x9aa4b0)
      ambientBase = 0.32
      hemiBase = 0.58
      sunBase = 1.18
      rimBase = 0.2
      this.lightRig.setSunOffset(95, 135, -40)
    } else if (def.id === 'mexiku') {
      // Mexiko: neutrální den + mírný fill — dřív climb tint dělal divný lak
      ambient?.color.setHex(0xc8c0b4)
      hemi?.color.setHex(0xe0d8c8)
      hemi?.groundColor.setHex(0x3a4838)
      sun?.color.setHex(0xfff0dc)
      rim?.color.setHex(0xa8b8c8)
      ambientBase = 0.3
      hemiBase = 0.55
      sunBase = 1.22
      rimBase = 0.18
      this.lightRig.setSunOffset(70, 145, 45)
    } else if (def.world === 'climb') {
      ambient?.color.setHex(0xb8c8d8)
      hemi?.color.setHex(0xd0e0f0)
      hemi?.groundColor.setHex(0x3a4834)
      sun?.color.setHex(0xfff4e8)
      rim?.color.setHex(0x90a8c8)
      ambientBase = 0.3
      hemiBase = 0.62
      sunBase = 1.28
      rimBase = 0.18
      this.lightRig.setSunOffset(80, 140, 50)
    } else if (def.world === 'plaza') {
      ambient?.color.setHex(0xc0d0dc)
      hemi?.color.setHex(0xd0e4f0)
      hemi?.groundColor.setHex(0x3a4a38)
      sun?.color.setHex(0xfff2e0)
      rim?.color.setHex(0x98b8d0)
      ambientBase = 0.3
      hemiBase = 0.7
      sunBase = 1.25
      rimBase = 0.18
      this.lightRig.setSunOffset(60, 130, 55)
    } else {
      // town — pozdní odpoledne; rim teplejší (studený rim mačkal terén do navy)
      ambient?.color.setHex(0xc8b8a8)
      hemi?.color.setHex(0xe8d8c4)
      hemi?.groundColor.setHex(0x4a3a28)
      sun?.color.setHex(0xffd0a0)
      rim?.color.setHex(0xc4a888)
      ambientBase = 0.3
      hemiBase = 0.58
      sunBase = 1.18
      rimBase = 0.2
      this.lightRig.setSunOffset(-70, 70, 100)
    }

    const lightMul = lightIntensityScale(this.atmosphere.light)
    if (ambient) ambient.intensity = ambientBase * lightMul
    if (hemi) hemi.intensity = hemiBase * lightMul
    if (sun) {
      sun.intensity = sunBase * lightMul
      this.engine.render.pipeline.configureSunShadow(sun, this.visual)
    }
    if (rim) rim.intensity = rimBase * lightMul

    // City: perf pipeline (bez ACES/bloom) = čitelnost + FPS; cinematic nechá full look
    if (def.world === 'city' && this.visual.quality !== 'cinematic') {
      this.engine.render.applyVisual(
        { quality: 'perf', bloom: false, shadows: false, rearMirror: false },
        this.lightRig.getSun(),
      )
    } else {
      this.engine.render.applyVisual(this.visual, this.lightRig.getSun())
    }
    this.onResize()
  }

  private applyVisual(): void {
    this.engine.render.applyVisual(this.visual, this.lightRig.getSun())
    for (const v of this.vehicles) v.setCastShadow(this.visual.shadows)
    this.onResize()
  }

  private onResize(): void {
    applyMobileLookCss()
    const vv = window.visualViewport
    const w = Math.max(1, Math.round(vv?.width ?? window.innerWidth))
    const h = Math.max(1, Math.round(vv?.height ?? window.innerHeight))
    const q = this.visual.quality
    const city = this.lastTrackId === 'city'
    const scale = city
      ? q === 'cinematic'
        ? 0.9
        : 0.78
      : q === 'perf'
        ? w * h > 1280 * 720
          ? 0.75
          : 0.9
        : q === 'balanced'
          ? 0.92
          : 1
    this.engine.render.resize(w, h, scale)
    this.cams.distScale = mobileCamDist()
    applyHudScale(this.controlFeel.hudScale, mobileUiFactor())
  }

  private lastDrawCalls = 0
  private lastTriangles = 0

  private draw(): void {
    const info = this.engine.render.renderer.info
    info.reset()
    this.engine.render.draw(this.engine.world)
    if (this.mode === 'race' && this.mirror.isEnabled()) {
      this.mirror.render(this.engine.render.renderer, this.scene)
    }
    this.lastDrawCalls = info.render.calls
    this.lastTriangles = info.render.triangles
  }

  private tickPerf(dt: number): void {
    this.fpsAcc += dt
    this.fpsFrames++
    if (this.fpsAcc < 0.5) return
    this.fpsShown = Math.round(this.fpsFrames / this.fpsAcc)
    this.fpsAcc = 0
    this.fpsFrames = 0
    this.hud.setPerf(this.fpsShown, this.lastDrawCalls)
    const w = window as unknown as {
      __klecPerf?: { fps: number; draws: number; tris: number; track: string }
    }
    w.__klecPerf = {
      fps: this.fpsShown,
      draws: this.lastDrawCalls,
      tris: this.lastTriangles,
      track: this.lastTrackId,
    }
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

  /** GameMode tick — volá Klec Engine (jako Unreal Tick / Unity Update). */
  private gameTick(dt: number): void {
    if (!this.running) return

    if (this.mode === 'entry' || this.mode === 'menu') {
      this.escWasDown = this.input.escapeHeld
      if (this.ignoreEscUntilRelease) {
        if (!this.input.escapeHeld) this.ignoreEscUntilRelease = false
      } else if (this.mode === 'menu' && this.input.pressed('Escape')) {
        const nav = this.menu.handleEscape()
        if (nav === 'to-entry') this.showEntry()
      }
      const t = this.engine.world.timeSeconds * 0.15
      this.camera.position.set(Math.sin(t) * 140, 55, Math.cos(t) * 140)
      this.draw()
      this.tickPerf(dt)
      this.input.endFrame()
      return
    }

    if (this.input.actionPressed('camera')) {
      this.cams.cycleMode()
    }

    if (
      !this.multiplayer &&
      (this.input.actionPressed('restart') || this.input.pressed('KeyR'))
    ) {
      // Musí endFrame — jinak KeyR zůstane v justPressed a restart jede každý frame (= freeze)
      this.input.endFrame()
      this.restartSoloSameRace({ sameTrack: true })
      return
    }

    // Esc/Backspace rising-edge: countdown/dojetí → menu; závod → pauza (nápověda)
    const navDown = this.input.menuNavHeld
    const navEdge = navDown && !this.escWasDown
    this.escWasDown = navDown
    if (!this.paused && navEdge) {
      if (this.race.phase === 'countdown' || this.race.phase === 'finished') {
        this.openMenu()
      } else {
        this.enterPause()
      }
      this.input.endFrame()
      return
    }
    if (this.paused) {
      if (this.escArm) {
        // Čekat na puštění Esc/Backspace po otevření nápovědy — 1 další stisk = menu
        if (!this.input.menuNavHeld) this.escArm = false
      } else if (navEdge) {
        this.openMenu()
        this.input.endFrame()
        return
      } else if (this.input.anyPressedExcept('Escape', 'Backspace')) {
        this.resumeFromPause()
      }

      this.cams.update(dt, this.player)
      this.mirror.update(this.player)
      this.lightRig.follow(this.player.physics.x, this.player.physics.z)
      this.audio.update(this.vehicles, this.player, false)
      this.hud.update(this.player, this.race, this.cams, true)
      this.draw()
      this.tickPerf(dt)
      this.input.endFrame()
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
        // Freestyle (skate/kolo): triky; bez Space drift brzdy
        const mobileClassic = this.input.mobile
        const boardFs = v.kind === 'skate' || v.kind === 'bike'
        // Mobil: FS přes 4 pady (portrait); PC klávesy A–Z
        v.freestyleOn = boardFs
        // Space e-brake jen u normálních peklostrojů (ne skate/kolo)
        v.physics.driftMode = this.controlFeel.driftMode && !boardFs && !mobileClassic
        const wantEbrake =
          v.physics.driftMode && this.input.actionHeld('ebrake') ? 1 : 0
        const controls =
          this.race.phase === 'racing'
            ? {
                throttle: this.input.throttle,
                brake: this.input.brake,
                steer: this.input.steer,
                push: this.input.push,
                tab: this.input.tab,
                ebrake: wantEbrake,
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

    // Impact juice — shake + scrape (player only)
    const impact = this.player.consumeImpact()
    if (impact > 0.05) {
      this.cams.addShake(impact)
      this.audio.playImpact(impact)
    }

    tickSkyBackdrop(this.track.skyBackdrop, dt)

    if (this.race.phase === 'finished' && !this.recordsSaved) {
      this.recordsSaved = true
      try {
        const place = this.race.playerPlace()
        const trickPts = this.player.trickPoints
        const driftPts = this.player.driftPoints
        const isFs = this.player.isBoardKind()
        const fsScore =
          this.activeCompetition === 'driftScore'
            ? driftPts
            : isFs
              ? placePoints(place) + trickPts
              : 0
        const finishTimeMs = this.player.finishTime || this.race.raceTimeMs
        submitRaceRecord({
          player: this.player.info.name,
          trackId: this.lastTrackId,
          vehicle: this.lastVehicle,
          timeMs: finishTimeMs,
          fsScore,
          trickPts:
            this.activeCompetition === 'driftScore' ? driftPts : isFs ? trickPts : 0,
          immortal: this.player.immortal,
        })
        this.recordPaceCalibration(finishTimeMs)
        if (this.activeChampionship) {
          const career = getCareer(
            this.activeChampionship.branch,
            this.activeChampionship.season,
          )
          if (career && !career.done) {
            const wasQual = !career.qualified
            const wasFsQual = isChampFsQual(career)
            const updated = recordRoundFinish(career, {
              place,
              trickPts: this.player.trickPoints,
            })
            this.hud.setChampionshipResult({
              points: updated.points,
              progress: championshipProgressLabel(updated),
              done: updated.done,
              lastPts: wasQual
                ? 0
                : roundPoints(updated.branch, place, this.player.trickPoints),
              qual: wasQual,
              fsQual: wasFsQual,
              place,
            })
          }
        } else {
          this.hud.setChampionshipResult(null)
        }
      } catch (err) {
        console.warn('Post-finish save failed', err)
      }
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
    this.mirror.update(this.player)
    this.lightRig.follow(this.player.physics.x, this.player.physics.z)
    this.audio.update(this.vehicles, this.player, this.race.phase === 'racing')
    this.hud.update(this.player, this.race, this.cams, true)
    this.draw()
    this.tickPerf(dt)
    this.input.endFrame()
  }

  /** QA / deep test bez UI — window.__klecQa */
  private installQaApi(): void {
    if (typeof window === 'undefined') return
    window.__klecQa = {
      wipeChamp: () => {
        wipeChampionshipSaves()
        try {
          localStorage.setItem('klecgp.champWipe.v3', '1')
        } catch {
          /* ignore */
        }
        this.activeChampionship = null
        this.openMenu()
        return true
      },
      list: () => ({
        tracks: TRACKS.map((tr) => tr.id),
        vehicles: [...VEHICLE_KINDS],
      }),
      state: () => {
        const canvas = this.engine.render.renderer.domElement
        return {
          mode: this.mode,
          phase: this.race.phase,
          trackId: this.lastTrackId,
          vehicle: this.lastVehicle,
          reverse: this.raceSettings.reverse,
          freestyle: this.raceSettings.freestyle,
          freestyleOn: this.player.freestyleOn,
          mobileInput: this.input.mobile,
          tabHeld: this.input.tab > 0,
          paused: this.paused,
          finished: this.player.finished,
          place: this.race.playerPlace(),
          speed: this.player.displaySpeedKmh,
          trackT: this.player.trackT,
          trickPts: this.player.trickPoints,
          driftPts: this.player.driftPoints,
          pushAmount: this.player.pushAmount,
          tabBoost: this.player.tabBoostAmount,
          driftMode: this.player.physics.driftMode,
          driftLive: this.player.physics.driftActive,
          ebrakeHeld: this.input.actionHeld('ebrake'),
          latVel: Math.round(this.player.physics.latVel * 100) / 100,
          steer: this.input.steer,
          canvasOk: canvas.width > 0 && canvas.height > 0,
          sceneChildren: this.scene.children.length,
          escHeld: this.input.escapeHeld,
          escWasDown: this.escWasDown,
        }
      },
      openMenu: () => this.openMenu(),
      start: (trackId, vehicle = 'street', reverse = false) => {
        this.raceSettings.reverse = !!reverse
        this.raceSettings.freestyle = false
        saveRaceSettings(this.raceSettings)
        this.beginSoloRace(
          trackId,
          vehicle,
          this.lastLook,
          this.lastTuning,
          this.player.info.name,
          this.lastDifficulty.id,
          { keepTrack: true },
        )
      },
      skipCountdown: () => {
        if (this.mode !== 'race') return
        this.race.skipToRacing()
      },
      forceFinish: () => {
        if (this.mode !== 'race') return
        this.race.forceFinish()
      },
      restart: () => this.restartSoloSameRace({ sameTrack: true }),
      escToMenu: () => {
        this.escWasDown = false
        this.openMenu()
      },
      warp: (t: number) => {
        const tt = Math.max(0, Math.min(0.999, t))
        const s = this.track.sample(tt)
        this.player.reset(s.position.x, s.position.z, Math.atan2(s.tangent.x, s.tangent.z), this.race.raceTimeMs)
        this.player.groundY = s.position.y
        this.player.trackT = tt
        this.player.finished = false
      },
      setSpeed: (kmh: number) => {
        this.player.physics.speed = Math.max(0, kmh) / 3.6
      },
      /** Simuluje freestyle trik (skate/bike) přes keydown */
      trick: (letter = 'A') => {
        const L = String(letter).toUpperCase().slice(0, 1)
        const code = `Key${L}`
        window.dispatchEvent(new KeyboardEvent('keydown', { code, key: L, bubbles: true }))
        window.setTimeout(() => {
          window.dispatchEvent(new KeyboardEvent('keyup', { code, key: L, bubbles: true }))
        }, 40)
      },
      /** Spusť trik napřímo na hráči (spolehlivé v QA) */
      forceTrick: (letter = 'A') => this.player.forceTrick(letter),
      /** Drž/pusť Tab·Alt boost (cyklista šlapání / skate boost) */
      holdTab: (on = true) => {
        this.input.setTabBoostHeld(!!on, 'AltLeft')
      },
      /** Drž/pusť Space e-brake (drift) */
      holdEbrake: (on = true) => {
        this.input.setEbrakeHeld(!!on)
      },
      /** QA — držet klávesy (např. řízení + plyn při driftu) */
      holdKeys: (codes: string[], on = true) => {
        this.input.setKeysHeld(codes, !!on)
      },
    }
  }
}

function labelVehicle(kind: VehicleKind): string {
  const key = `vehicle.${kind}`
  const named = t(key)
  return named === key ? kind : named
}

declare global {
  interface Window {
    __klecQa?: {
      wipeChamp: () => boolean
      list: () => { tracks: string[]; vehicles: VehicleKind[] }
      state: () => Record<string, unknown>
      openMenu: () => void
      start: (trackId: string, vehicle?: VehicleKind, reverse?: boolean) => void
      skipCountdown: () => void
      forceFinish: () => void
      restart: () => void
      escToMenu: () => void
      warp: (t: number) => void
      setSpeed: (kmh: number) => void
      trick: (letter?: string) => void
      forceTrick: (letter?: string) => boolean
      holdTab: (on?: boolean) => void
      holdEbrake: (on?: boolean) => void
      holdKeys: (codes: string[], on?: boolean) => void
    }
  }
}
