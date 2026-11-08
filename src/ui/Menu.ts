import { DIFFICULTIES, type DifficultyId } from '../ai/Difficulty'
import { exportPaceJson, getPaceSamples, pushPaceToWorkspace } from '../ai/PaceCalibration'
import { allRecords } from '../freestyle/Records'
import { resetChampionship } from '../race/Championship'
import {
  analyticsTable,
  exportCommunityBundle,
  importCommunityBundle,
  loadCommunitySamples,
  loadLearnSettings,
  loadLearnedModel,
  saveLearnSettings,
} from '../ai/CommunityLearning'
import { bindMuteToggle, muteToggleHtml, t } from '../i18n/i18n'
import {
  crossfadeWatermark,
  pickWatermarkTrack,
  trackPreviewHtml,
  trackWatermarkHtml,
} from './TrackWatermark'
import { VehiclePreview } from './VehiclePreview'
import {
  TRACKS,
  VEHICLE_KINDS,
  type TrackDef,
  type VehicleKind,
} from '../track/TrackDefs'
import {
  DEFAULT_PLAYER_TUNING,
  TUNING_BUDGET,
  setTuningStat,
  tuningHint,
  tuningSum,
  type PlayerTuningValues,
} from '../tuning/PlayerTuning'
import {
  DEFAULT_AUDIO,
  MUSIC_TRACKS,
  type AudioSettingsValues,
  type MusicId,
} from '../audio/AudioSettings'
import {
  CALENDAR_PACKS,
  DEFAULT_ATMOSPHERE,
  applyUiAtmosphere,
  decorFromIndex,
  decorIndex,
  fogFromIndex,
  fogIndex,
  lightFromIndex,
  lightIndex,
  menuArtForTone,
  type AtmosphereSettingsValues,
  type CalendarPack,
  type MenuTone,
} from '../render/AtmosphereSettings'
import { brandLockupHtml } from './Brand'
import {
  DEFAULT_CONTROL_FEEL,
  MOBILE_DRIVE_SCHEMES,
  type CamFollow,
  type ControlFeelValues,
  type MobileDriveScheme,
} from '../input/ControlFeel'
import {
  DEFAULT_VISUAL,
  VISUAL_QUALITIES,
  type VisualQuality,
} from '../render/VisualSettings'
import {
  COMPETITIONS,
  loadCompetitionSettings,
  saveCompetitionSettings,
  type CompetitionId,
  type CompetitionSettingsValues,
} from '../render/CompetitionSettings'
import {
  DEFAULT_RACE,
  clampOpponentsToCategory,
  randomOpponents,
  soloCategoryPool,
  type RaceSettingsValues,
} from '../render/RaceSettings'
import type { NetRoom, PresenceSnapshot } from '../net/protocol'
import { roomFromUrl } from '../net/NetClient'
import { isMobileClient } from '../input/Input'
import {
  DEFAULT_BINDINGS,
  cloneBindings,
  codeLabel,
  loadKeyBindings,
  saveKeyBindings,
  type BindAction,
  type KeyBindingsMap,
} from '../input/KeyBindings'
import {
  TRICK_LETTERS,
  defaultTrickBindings,
  loadTrickBindings,
  saveTrickBindings,
  type TrickBindingsMap,
} from '../input/TrickBindings'
import { freestyleList } from '../freestyle/FreestyleTricks'
import { recordsFor } from '../freestyle/Records'
import { formatTime } from '../race/RaceManager'
import { SCOOTER_INSULT_MAX, scooterInsult } from './scooterInsults'

export const COLOR_NONE = -1
export const NEON_NONE = -1

export const PLAYER_COLOR_CHOICES = [
  0xc62828, 0x1565c0, 0x2e7d32, 0xef6c00, 0x6a1b9a, 0x00838f, 0xf9a825, 0xeceff1,
]

export const NEON_COLOR_CHOICES = [
  0xff2bd6, 0x2de2e6, 0xff6a00, 0x7b61ff, 0x39ff14, 0xffee33, 0xff3366, 0xffffff,
]

type RaceModeId = 'classic' | 'online'

export type MenuAudioApi = {
  get: () => AudioSettingsValues
  set: (partial: Partial<AudioSettingsValues>) => void
  unlock: () => void
  playClick?: () => void
}

export type MenuAtmosphereApi = {
  get: () => AtmosphereSettingsValues
  set: (partial: Partial<AtmosphereSettingsValues>) => void
}

export type MenuRaceApi = {
  get: () => RaceSettingsValues
  set: (partial: Partial<RaceSettingsValues>) => void
}

export type MenuControlFeelApi = {
  get: () => ControlFeelValues
  set: (partial: Partial<ControlFeelValues>) => void
}

export type MenuVisualApi = {
  get: () => import('../render/VisualSettings').VisualSettingsValues
  set: (partial: Partial<import('../render/VisualSettings').VisualSettingsValues>) => void
}

export type MenuStartPayload = {
  mode: 'solo' | 'host' | 'join' | 'browse'
  trackId: string
  vehicle: VehicleKind
  color: number
  neon: number
  tuning: PlayerTuningValues
  name: string
  difficulty: DifficultyId
  roomCode?: string
  publicWsUrl?: string
  laps?: number
  ready?: boolean
}

export type OnlineBrowserState = {
  connected: boolean
  connecting: boolean
  error: string
  presence: PresenceSnapshot | null
}

type Screen =
  | 'home'
  | 'raceMode'
  | 'tracks'
  | 'vehicles'
  | 'tuning'
  | 'settings'
  | 'audio'
  | 'atmosphere'
  | 'difficulty'
  | 'manual'
  | 'competitions'
  | 'aiLearn'
  | 'controls'
  | 'records'
  | 'online'

const TUNE_KEYS: (keyof PlayerTuningValues)[] = [
  'power',
  'brakes',
  'downforce',
  'grip',
  'steer',
  'lightness',
]

export class Menu {
  private readonly root: HTMLElement
  private selectedTrackId = TRACKS[0].id
  private selectedVehicle: VehicleKind = TRACKS[0].vehicle
  private selectedColor = PLAYER_COLOR_CHOICES[0]!
  private selectedNeon = NEON_COLOR_CHOICES[0]!
  private selectedDifficulty: DifficultyId = 'normal'
  private tuning: PlayerTuningValues = { ...DEFAULT_PLAYER_TUNING }
  private playerName = 'Filip'
  private publicWsUrl = ''
  private joinCode = roomFromUrl() || ''
  private screen: Screen = roomFromUrl() ? 'online' : 'home'
  private onStart: ((payload: MenuStartPayload) => void) | null = null
  private lobby: NetRoom | null = null
  private lobbyLink = ''
  private lobbyError = ''
  private isHost = false
  private onHostStart: (() => void) | null = null
  private onLeaveLobby: (() => void) | null = null
  private onReadyToggle: ((ready: boolean) => void) | null = null
  private onLobbyTrack: ((trackId: string) => void) | null = null
  private onLobbyLaps: ((laps: number) => void) | null = null
  private onBrowseOnline: (() => void) | null = null
  /** Telefon: z home zpět na entry (Esc na PC). */
  private onBackToEntry: (() => void) | null = null
  private onlineBrowser: OnlineBrowserState = {
    connected: false,
    connecting: false,
    error: '',
    presence: null,
  }
  private hostLaps = 2
  private localNetId: string | null = null
  private audioApi: MenuAudioApi | null = null
  private atmosphereApi: MenuAtmosphereApi | null = null
  private visualApi: MenuVisualApi | null = null
  private raceApi: MenuRaceApi | null = null
  private controlFeelApi: MenuControlFeelApi | null = null
  private watermarkTrackId = TRACKS[0]!.id
  private recentWatermarkIds: string[] = []
  private watermarkTimer: number | null = null
  private watermarkFadeTimer: number | null = null
  private vehiclePreview: VehiclePreview | null = null
  /** Leaderboard filtr tratě ('' = vše). */
  private lbTrackId = ''
  private recordsBack: Screen = 'home'
  /** Remap: skate vs bike triky. */
  private ctrlTrickKind: 'skate' | 'bike' = 'skate'
  /** Rozbalené podstyly kalendáře v atmosféře. */
  private calendarPackOpen = false
  /** Koloběžka: pokusy o odchod (9+ = force skate). */
  private scooterLeaveAttempts = 0
  private scooterPopup: string | null = null
  /** Po 30. narážce OK → vynutit skate. */
  private scooterForceSkate = false
  private competition: CompetitionSettingsValues = loadCompetitionSettings()
  private raceModePick: RaceModeId = 'classic'
  private uiAbort: AbortController | null = null
  private raceHoldTimer: number | null = null
  private raceHoldRaf = 0
  private raceEnterHits = 0
  private raceEnterReset: number | null = null
  visible = false

  constructor(root: HTMLElement) {
    this.root = root
  }

  setAudioApi(api: MenuAudioApi): void {
    this.audioApi = api
  }

  setAtmosphereApi(api: MenuAtmosphereApi): void {
    this.atmosphereApi = api
  }

  setVisualApi(api: MenuVisualApi): void {
    this.visualApi = api
  }

  setRaceApi(api: MenuRaceApi): void {
    this.raceApi = api
  }

  setControlFeelApi(api: MenuControlFeelApi): void {
    this.controlFeelApi = api
  }

  setOnStart(cb: (payload: MenuStartPayload) => void): void {
    this.onStart = cb
  }

  setOnHostStart(cb: () => void): void {
    this.onHostStart = cb
  }

  setOnLeaveLobby(cb: () => void): void {
    this.onLeaveLobby = cb
  }

  setOnReadyToggle(cb: (ready: boolean) => void): void {
    this.onReadyToggle = cb
  }

  setOnLobbyTrack(cb: (trackId: string) => void): void {
    this.onLobbyTrack = cb
  }

  setOnLobbyLaps(cb: (laps: number) => void): void {
    this.onLobbyLaps = cb
  }

  setOnBrowseOnline(cb: () => void): void {
    this.onBrowseOnline = cb
  }

  setOnBackToEntry(cb: () => void): void {
    this.onBackToEntry = cb
  }

  setOnlineBrowser(state: Partial<OnlineBrowserState>): void {
    this.onlineBrowser = { ...this.onlineBrowser, ...state }
    if (this.visible && this.screen === 'online' && !this.lobby) this.render()
  }

  getPlayerName(): string {
    return this.playerName
  }

  setLobby(
    room: NetRoom | null,
    link: string,
    isHost: boolean,
    error = '',
    localNetId: string | null = null,
  ): void {
    this.lobby = room
    this.lobbyLink = link
    this.isHost = isHost
    this.lobbyError = error
    if (localNetId) this.localNetId = localNetId
    if (!room) this.localNetId = null
    if (room?.laps) this.hostLaps = room.laps
    if (this.visible) this.render()
  }

  show(): void {
    this.visible = true
    this.root.classList.add('menu-visible')
    if (!roomFromUrl()) this.screen = 'home'
    const first = pickWatermarkTrack()
    this.watermarkTrackId = first.id
    this.recentWatermarkIds = [first.id]
    applyUiAtmosphere(this.atmosphereApi?.get() ?? DEFAULT_ATMOSPHERE)
    this.render()
    this.startWatermarkRotation()
  }

  /** Po odchodu z lobby / online závodu — zpět na prohlížeč místností (bez disconnect). */
  showOnline(): void {
    this.visible = true
    this.root.classList.add('menu-visible')
    this.screen = 'online'
    this.lobby = null
    this.lobbyLink = ''
    this.lobbyError = ''
    applyUiAtmosphere(this.atmosphereApi?.get() ?? DEFAULT_ATMOSPHERE)
    this.render()
    this.startWatermarkRotation()
  }

  hide(): void {
    this.visible = false
    this.stopWatermarkRotation()
    this.disposeVehiclePreview()
    this.root.classList.remove('menu-visible')
    this.root.innerHTML = ''
  }

  private disposeVehiclePreview(): void {
    this.vehiclePreview?.dispose()
    this.vehiclePreview = null
  }

  private beginUiBindings(): AbortSignal {
    this.clearRaceHold()
    this.clearRaceEnterHits()
    this.uiAbort?.abort()
    this.uiAbort = new AbortController()
    return this.uiAbort.signal
  }

  private clearRaceHold(): void {
    if (this.raceHoldTimer !== null) {
      window.clearTimeout(this.raceHoldTimer)
      this.raceHoldTimer = null
    }
    if (this.raceHoldRaf) {
      cancelAnimationFrame(this.raceHoldRaf)
      this.raceHoldRaf = 0
    }
    const fill = this.root.querySelector<HTMLElement>('[data-hold-fill]')
    if (fill) fill.style.width = '0%'
  }

  private clearRaceEnterHits(): void {
    this.raceEnterHits = 0
    if (this.raceEnterReset !== null) {
      window.clearTimeout(this.raceEnterReset)
      this.raceEnterReset = null
    }
  }

  /**
   * Viditelné Zpět (hlavně telefon — Esc tam není).
   * Na PC nechá i jemný Esc hint.
   */
  private backRow(to: Screen | 'entry' = 'home'): string {
    const entry = to === 'entry'
    const label = entry ? t('menu.backEntry') : t('menu.back')
    const attr = entry ? 'data-back-entry' : 'data-back'
    const esc = isMobileClient()
      ? ''
      : `<p class="menu-esc-hint">${entry ? t('menu.escHint') : t('menu.escBack')}</p>`
    return `<div class="menu-nav-back">
      <button type="button" class="btn-ghost menu-back-btn" ${attr}>${label}</button>
      ${esc}
    </div>`
  }

  /** Poděkování — pravý dolní roh hlavního Nastavení. */
  private settingsThanks(): string {
    return `
      <button type="button" class="thanks-link settings-thanks" data-thanks>${t('menu.thanks')}</button>
    `
  }

  private burntLetterHtml(): string {
    return `
      <div class="burnt-letter-backdrop">
        <article class="burnt-letter" role="dialog" aria-modal="true" aria-labelledby="burnt-letter-title">
          <div class="burnt-letter-ash" aria-hidden="true"></div>
          <div class="burnt-letter-scorch" aria-hidden="true"></div>
          <header class="burnt-letter-head">
            <p class="burnt-letter-from" id="burnt-letter-title">${t('menu.thanksAuthor')}</p>
            <p class="burnt-letter-to">${t('menu.thanksTo')}</p>
          </header>
          <div class="burnt-letter-scroll">
            <p class="burnt-letter-body">${t('menu.thanksIntro')}</p>
            <p class="burnt-letter-body">${t('menu.thanksStory')}</p>
            <p class="burnt-letter-body">${t('menu.thanksFeatures')}</p>
            <p class="burnt-letter-body">${t('menu.thanksAi')}</p>
            <p class="burnt-letter-body">${t('menu.thanksPlay')}</p>
            <p class="burnt-letter-sign">${t('menu.thanksSign')}</p>
          </div>
          <button type="button" class="burnt-letter-close" data-burnt-close>${t('menu.thanksClose')}</button>
        </article>
      </div>
    `
  }

  private bindThanks(): void {
    this.root.querySelectorAll<HTMLElement>('[data-thanks]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        if (this.root.querySelector('.burnt-letter-backdrop')) return
        this.root.insertAdjacentHTML('beforeend', this.burntLetterHtml())
        const backdrop = this.root.querySelector('.burnt-letter-backdrop')
        const close = () => backdrop?.remove()
        backdrop?.addEventListener('click', (ev) => {
          if (ev.target === backdrop) close()
        })
        backdrop?.querySelectorAll('[data-burnt-close]').forEach((el) => {
          el.addEventListener('click', (ev) => {
            ev.stopPropagation()
            close()
          })
        })
      })
    })
  }

  private clearScooterTrap(): void {
    this.scooterLeaveAttempts = 0
    this.scooterPopup = null
    this.scooterForceSkate = false
  }

  /** false = zůstat u koloběžky (popup). true = smí odejít (už má jiné / force skate). */
  private tryLeaveScooter(): boolean {
    if (this.selectedVehicle !== 'scooter') {
      this.clearScooterTrap()
      return true
    }
    this.scooterLeaveAttempts += 1
    if (this.scooterLeaveAttempts > SCOOTER_INSULT_MAX) {
      this.selectedVehicle = 'skate'
      this.clearScooterTrap()
      return true
    }
    this.scooterPopup = scooterInsult(this.scooterLeaveAttempts)
    this.scooterForceSkate = this.scooterLeaveAttempts >= SCOOTER_INSULT_MAX
    this.render()
    return false
  }

  handleEscape(): 'stay' | 'to-entry' {
    if (!this.visible) return 'stay'
    const letter = this.root.querySelector('.burnt-letter-backdrop')
    if (letter) {
      letter.remove()
      return 'stay'
    }
    if (this.lobby) {
      this.onLeaveLobby?.()
      return 'stay'
    }
    if (
      this.screen === 'audio' ||
      this.screen === 'atmosphere' ||
      this.screen === 'difficulty' ||
      this.screen === 'manual' ||
      this.screen === 'competitions' ||
      this.screen === 'aiLearn' ||
      this.screen === 'controls'
    ) {
      this.screen = 'settings'
      this.render()
      return 'stay'
    }
    if (this.screen === 'tuning') {
      this.screen = 'vehicles'
      this.render()
      return 'stay'
    }
    if (this.screen === 'vehicles') {
      if (this.selectedVehicle === 'scooter' && !this.tryLeaveScooter()) return 'stay'
      this.clearScooterTrap()
      this.screen = 'home'
      this.render()
      return 'stay'
    }
    if (this.screen === 'online') {
      this.screen = 'raceMode'
      this.render()
      return 'stay'
    }
    if (this.screen === 'raceMode' || this.screen === 'records') {
      this.screen = 'home'
      this.render()
      return 'stay'
    }
    if (this.screen === 'home') return 'to-entry'
    this.clearScooterTrap()
    this.screen = 'home'
    this.render()
    return 'stay'
  }

  isHome(): boolean {
    return this.screen === 'home' && !this.lobby
  }

  private wmHtml(): string {
    const def = TRACKS.find((tr) => tr.id === this.watermarkTrackId) ?? pickWatermarkTrack()
    return trackWatermarkHtml(def)
  }

  private startWatermarkRotation(): void {
    this.stopWatermarkRotation()
    const holdMs = 8000
    const fadeMs = 2000
    const schedule = () => {
      this.watermarkTimer = window.setTimeout(() => {
        const next = pickWatermarkTrack(this.recentWatermarkIds.slice(-2))
        this.watermarkTrackId = next.id
        this.recentWatermarkIds = [...this.recentWatermarkIds, next.id].slice(-2)
        const el = this.root.querySelector('.track-watermark')
        if (el) crossfadeWatermark(el, next, fadeMs)
        this.watermarkFadeTimer = window.setTimeout(schedule, fadeMs)
      }, holdMs)
    }
    schedule()
  }

  private stopWatermarkRotation(): void {
    if (this.watermarkTimer !== null) {
      window.clearTimeout(this.watermarkTimer)
      this.watermarkTimer = null
    }
    if (this.watermarkFadeTimer !== null) {
      window.clearTimeout(this.watermarkFadeTimer)
      this.watermarkFadeTimer = null
    }
  }

  private render(): void {
    this.disposeVehiclePreview()
    const signal = this.beginUiBindings()
    const wm = this.wmHtml()
    if (this.lobby) {
      this.renderLobby(wm)
      return
    }

    if (this.screen === 'home') {
      const atmHome = this.atmosphereApi?.get() ?? DEFAULT_ATMOSPHERE
      const art = menuArtForTone(atmHome.tone, atmHome.calendarPack)
      this.root.innerHTML = `
        ${wm}
        ${this.muteBar()}
        <div class="menu-shell menu-home gta-home">
          <header class="gta-home-hero">
            ${brandLockupHtml({ size: 'menu' })}
          </header>
          <div class="gta-tiles">
            <button type="button" class="gta-tile gta-tile-hero" data-go="raceMode" style="--tile:url('${art.race}')">
              <span class="gta-tile-kicker">${t('menu.raceModeEyebrow')}</span>
              <strong class="gta-tile-label">${t('menu.startRace')}</strong>
              <span class="gta-tile-sub">${t('menu.raceClassicBlurb')}</span>
            </button>
            <button type="button" class="gta-tile" data-go="tracks" style="--tile:url('${art.tracks}')">
              <strong class="gta-tile-label">${t('menu.trackSelect')}</strong>
              <span class="gta-tile-sub">${this.escape(this.trackLabel())}</span>
            </button>
            <button type="button" class="gta-tile" data-go="vehicles" style="--tile:url('${art.garage}')">
              <strong class="gta-tile-label">${t('menu.vehicleSelect')}</strong>
              <span class="gta-tile-sub">${this.vehicleLabel(this.selectedVehicle)}</span>
            </button>
            <button type="button" class="gta-tile" data-go="records" style="--tile:url('${art.board}')">
              <strong class="gta-tile-label">${t('menu.leaderboard')}</strong>
            </button>
            <button type="button" class="gta-tile" data-go="settings" style="--tile:url('${art.settings}')">
              <strong class="gta-tile-label">${t('menu.settings')}</strong>
            </button>
          </div>
          <p class="tune-rules home-status">
            ${t('menu.statusTrack')}: <strong>${this.escape(this.trackLabel())}</strong>
            · ${t('menu.statusVehicle')}: <strong>${this.vehicleLabel(this.selectedVehicle)}</strong>
            · ${t('menu.statusDiff')} <strong>${this.diffLabel()}</strong>
            · ${t('menu.statusTuning')} ${tuningSum(this.tuning)}/${TUNING_BUDGET}
          </p>
          ${this.backRow('entry')}
        </div>
      `
      this.bindMuteBar()
      this.bindBack('entry')
      this.root.querySelectorAll<HTMLButtonElement>('[data-go]').forEach((btn) => {
        btn.addEventListener('click', () => {
          if (btn.dataset.go === 'records') this.recordsBack = 'home'
          this.screen = (btn.dataset.go as Screen) || 'home'
          this.render()
        })
      })
      return
    }

    if (this.screen === 'raceMode') {
      const onPhone = isMobileClient()
      if (this.raceModePick !== 'classic' && this.raceModePick !== 'online') {
        this.raceModePick = 'classic'
      }
      const modes: { id: RaceModeId; title: string; blurb: string; online?: boolean }[] = [
        { id: 'classic', title: t('menu.raceClassic'), blurb: t('menu.raceClassicBlurb') },
        {
          id: 'online',
          title: t('menu.online'),
          blurb: t('menu.raceOnlineBlurb'),
          online: true,
        },
      ]
      const pick = modes.find((m) => m.id === this.raceModePick) ?? modes[0]!
      const confirmHint =
        pick.id === 'online' ? t('menu.raceModeConfirmOnline') : t('menu.raceModeConfirm')
      this.root.innerHTML = `
        ${wm}
        ${this.muteBar()}
        <div class="menu-shell menu-panel gta-panel">
          <div class="race-mode-layout">
            <div class="race-mode-list">
              ${modes
                .map((m) => {
                  const active = m.id === pick.id ? 'active' : ''
                  const online = m.online ? 'home-panel-online' : ''
                  return `<button type="button" class="track-card ${active} ${online}" data-race-mode="${m.id}">
                    <strong>${m.title}</strong>
                  </button>`
                })
                .join('')}
            </div>
            <div class="race-mode-detail" data-race-detail>
              <strong data-race-title>${pick.title}</strong>
              <p data-race-blurb>${pick.blurb}</p>
              <p class="tune-rules" data-race-hint>${confirmHint}</p>
              <div class="hold-track ${pick.id === 'online' ? '' : 'is-hidden'}" aria-hidden="true"><div class="hold-bar" data-hold-fill></div></div>
            </div>
          </div>
          ${
            onPhone
              ? `<p class="tune-rules menu-mobile-warn">${t('menu.mobileLimits')}</p>`
              : ''
          }
          ${this.backRow('home')}
        </div>
      `
      this.bindMuteBar()
      this.bindBack('home')
      const fill = this.root.querySelector<HTMLElement>('[data-hold-fill]')
      const holdTrack = this.root.querySelector<HTMLElement>('.hold-track')
      const titleEl = this.root.querySelector<HTMLElement>('[data-race-title]')
      const blurbEl = this.root.querySelector<HTMLElement>('[data-race-blurb]')
      const hintEl = this.root.querySelector<HTMLElement>('[data-race-hint]')
      const setPick = (id: RaceModeId) => {
        if (id !== 'classic' && id !== 'online') id = 'classic'
        this.clearRaceHold()
        this.clearRaceEnterHits()
        this.raceModePick = id
        const m = modes.find((x) => x.id === id) ?? modes[0]!
        if (titleEl) titleEl.textContent = m.title
        if (blurbEl) blurbEl.textContent = m.blurb
        if (hintEl) {
          hintEl.textContent =
            id === 'online' ? t('menu.raceModeConfirmOnline') : t('menu.raceModeConfirm')
        }
        holdTrack?.classList.toggle('is-hidden', id !== 'online')
        this.root.querySelectorAll<HTMLButtonElement>('[data-race-mode]').forEach((b) => {
          b.classList.toggle('active', b.dataset.raceMode === id)
        })
      }
      const confirm = () => {
        this.clearRaceHold()
        this.clearRaceEnterHits()
        this.confirmRaceMode()
      }
      const startHold = () => {
        if (this.raceModePick !== 'online') return
        this.clearRaceHold()
        const t0 = performance.now()
        const tick = (now: number) => {
          const p = Math.min(1, (now - t0) / 1000)
          if (fill) fill.style.width = `${p * 100}%`
          if (p < 1) this.raceHoldRaf = requestAnimationFrame(tick)
        }
        this.raceHoldRaf = requestAnimationFrame(tick)
        this.raceHoldTimer = window.setTimeout(() => confirm(), 1000)
      }
      this.root.querySelectorAll<HTMLButtonElement>('[data-race-mode]').forEach((btn) => {
        const id = (btn.dataset.raceMode || 'classic') as RaceModeId
        btn.addEventListener(
          'pointerdown',
          (e) => {
            if (e.button !== 0) return
            setPick(id)
            if (id === 'online') startHold()
          },
          { signal },
        )
        btn.addEventListener('pointerup', () => this.clearRaceHold(), { signal })
        btn.addEventListener('pointerleave', () => this.clearRaceHold(), { signal })
        btn.addEventListener('pointercancel', () => this.clearRaceHold(), { signal })
        btn.addEventListener(
          'click',
          (e) => {
            e.preventDefault()
            setPick(id)
            if (id !== 'online') confirm()
          },
          { signal },
        )
      })
      window.addEventListener(
        'keydown',
        (e) => {
          if (!this.visible || this.screen !== 'raceMode') return
          if (e.code !== 'Enter' && e.code !== 'NumpadEnter') return
          e.preventDefault()
          if (this.raceModePick === 'online') {
            this.raceEnterHits += 1
            if (this.raceEnterReset !== null) window.clearTimeout(this.raceEnterReset)
            this.raceEnterReset = window.setTimeout(() => this.clearRaceEnterHits(), 550)
            if (this.raceEnterHits >= 2) confirm()
            return
          }
          confirm()
        },
        { signal },
      )
      return
    }

    if (this.screen === 'tracks') {
      const selected = TRACKS.find((tr) => tr.id === this.selectedTrackId) ?? TRACKS[0]
      const race = this.raceApi?.get() ?? { ...DEFAULT_RACE }
      this.root.innerHTML = `
        ${wm}
        ${this.muteBar()}
        <div class="menu-shell menu-panel">
          <p class="tune-rules menu-scroll-hint">${t('menu.tracksScrollHint')}</p>
          <div class="tracks-layout">
            <div class="tracks-list">${TRACKS.map((tr) => this.trackCard(tr)).join('')}</div>
            <div class="tracks-preview-pane">
              ${trackPreviewHtml(selected, race.reverse)}
              <div class="track-preview-meta">
                <strong>${this.escape(this.trackName(selected))}</strong>
                <span>${selected.sandbox ? t('menu.sandboxMeta') : this.escape(this.trackBlurb(selected))}</span>
              </div>
              ${
                selected.sandbox
                  ? `<p class="tune-rules">${t('menu.sandboxHint')}</p>`
                  : `<p class="tune-rules">${t('menu.raceDirection')}</p>
              <div class="dir-grid">
                <button type="button" class="track-card ${!race.reverse ? 'active' : ''}" data-reverse="0">
                  <strong>${t('menu.raceDir.normal')}</strong>
                </button>
                <button type="button" class="track-card ${race.reverse ? 'active' : ''}" data-reverse="1">
                  <strong>${t('menu.raceDir.reverse')}</strong>
                </button>
              </div>`
              }
            </div>
          </div>
          ${this.backRow('home')}
        </div>
      `
      this.bindMuteBar()
      this.bindBack('home')
      this.bindTracks()
      this.root.querySelectorAll<HTMLButtonElement>('[data-reverse]').forEach((btn) => {
        btn.addEventListener('click', () => {
          this.raceApi?.set({ reverse: btn.dataset.reverse === '1' })
          this.render()
        })
      })
      return
    }

    if (this.screen === 'vehicles') {
      const kind = this.selectedVehicle
      const confirmVehicle = () => {
        if (this.selectedVehicle === 'scooter' && !this.tryLeaveScooter()) return
        this.screen = 'tuning'
        this.render()
      }
      this.root.innerHTML = `
        ${wm}
        ${this.muteBar()}
        <div class="menu-shell menu-panel">
          <p class="tune-rules menu-scroll-hint">${t('menu.vehiclesScrollHint')}</p>
          <div class="tracks-layout vehicles-layout">
            <div class="tracks-list">
              ${VEHICLE_KINDS.map((k) => {
                const active = k === kind ? 'active' : ''
                return `<button type="button" class="track-card ${active}" data-vehicle="${k}">
                  <strong>${this.vehicleLabel(k)}</strong>
                  <span>${t(`vehicle.${k}.max`)}</span>
                </button>`
              }).join('')}
            </div>
            <div class="tracks-preview-pane vehicle-stage">
              <canvas id="vehicle-preview" class="vehicle-preview-canvas"></canvas>
              <p class="tune-help">${t('menu.vehicleDrag')}</p>
              <div class="track-preview-meta">
                <strong>${this.vehicleLabel(kind)}</strong>
                <span>${t(`vehicle.${kind}.max`)}</span>
              </div>
              <p class="tune-rules">${t('menu.colorPick')}</p>
              <div class="color-grid">
                ${this.colorSwatchHtml('color', COLOR_NONE, this.selectedColor)}
                ${PLAYER_COLOR_CHOICES.map((c) => this.colorSwatchHtml('color', c, this.selectedColor)).join('')}
                <label class="color-rgb" title="${t('menu.colorRgb')}">
                  <input type="color" id="color-rgb" value="${this.selectedColor < 0 ? '#c62828' : '#' + this.selectedColor.toString(16).padStart(6, '0')}" />
                </label>
              </div>
              ${
                kind === 'scooter'
                  ? `<p class="tune-rules scooter-warn">${t('menu.scooterTrap')}</p>`
                  : ''
              }
              <p class="vehicle-lore">${t(`vehicle.${kind}.invented`)}</p>
              <p class="vehicle-lore">${t(`vehicle.${kind}.first`)}</p>
              <p class="tune-rules">${t('menu.vehicleControls')}</p>
              <p class="vehicle-lore vehicle-controls">${this.vehicleHelp(kind)}</p>
              <div class="vehicle-flow-foot">
                <button type="button" class="btn-ghost vehicle-tuning-link" data-next>${t('menu.tuning')}</button>
              </div>
            </div>
          </div>
          ${this.backRow('home')}
        </div>
        ${
          this.scooterPopup
            ? `<div class="scooter-modal" role="dialog" aria-modal="true">
          <div class="scooter-modal-card">
            <p>${this.escape(this.scooterPopup)}</p>
            <button type="button" class="menu-start" data-scooter-ok>OK</button>
          </div>
        </div>`
            : ''
        }
      `
      this.bindMuteBar()
      this.bindBack('home')
      this.root.querySelector('[data-next]')?.addEventListener('click', () => confirmVehicle())
      this.root.querySelector('[data-scooter-ok]')?.addEventListener('click', () => {
        this.scooterPopup = null
        if (this.scooterForceSkate || this.scooterLeaveAttempts >= SCOOTER_INSULT_MAX) {
          this.selectedVehicle = 'skate'
          this.clearScooterTrap()
        }
        this.render()
      })
      this.root.querySelectorAll<HTMLButtonElement>('[data-vehicle]').forEach((btn) => {
        btn.addEventListener('click', () => {
          this.selectedVehicle = (btn.dataset.vehicle as VehicleKind) || 'street'
          if (this.selectedVehicle !== 'scooter') this.clearScooterTrap()
          const race = this.raceApi?.get()
          if (race && this.selectedVehicle !== 'scooter') {
            this.raceApi?.set({
              opponents: clampOpponentsToCategory(race.opponents, this.selectedVehicle, false),
            })
          }
          this.render()
        })
      })
      const syncColorActive = () => {
        this.root.querySelectorAll<HTMLButtonElement>('[data-color]').forEach((b) => {
          b.classList.toggle('active', Number(b.dataset.color) === this.selectedColor)
        })
      }
      this.root.querySelectorAll<HTMLButtonElement>('[data-color]').forEach((btn) => {
        btn.addEventListener('click', () => {
          this.selectedColor = Number(btn.dataset.color)
          if (Number.isNaN(this.selectedColor)) this.selectedColor = PLAYER_COLOR_CHOICES[0]!
          if (this.vehiclePreview) {
            this.vehiclePreview.setColor(this.selectedColor)
            syncColorActive()
          } else {
            this.render()
          }
        })
      })
      this.root.querySelector<HTMLInputElement>('#color-rgb')?.addEventListener('input', (e) => {
        const el = e.target as HTMLInputElement
        this.selectedColor = parseInt(el.value.slice(1), 16)
        this.vehiclePreview?.setColor(this.selectedColor)
        syncColorActive()
      })
      window.addEventListener(
        'keydown',
        (e) => {
          if (!this.visible || this.screen !== 'vehicles') return
          if (this.root.querySelector('.scooter-modal')) return
          if (e.code !== 'Enter' && e.code !== 'NumpadEnter') return
          e.preventDefault()
          confirmVehicle()
        },
        { signal },
      )
      const canvas = this.root.querySelector<HTMLCanvasElement>('#vehicle-preview')
      if (canvas) {
        this.vehiclePreview = new VehiclePreview(canvas)
        this.vehiclePreview.setVehicle(kind, this.selectedColor, this.selectedNeon)
      }
      return
    }

    if (this.screen === 'tuning') {
      const kind = this.selectedVehicle
      const used = tuningSum(this.tuning)
      const confirmTuning = () => {
        this.screen = 'home'
        this.render()
      }
      this.root.innerHTML = `
        ${wm}
        ${this.muteBar()}
        <div class="menu-shell menu-panel menu-tuning vehicles-tune">
          <p class="tune-rules menu-budget-line">${this.vehicleLabel(kind)} · ${t('menu.budget')} <span class="budget-pill">${used} / ${TUNING_BUDGET} ${t('menu.points')}</span></p>
          <div class="tracks-layout vehicles-layout">
            <div class="tuning-side">
              <p class="tune-rules">${t('menu.tuneRules')}</p>
              <div class="tune-stack">
                ${TUNE_KEYS.map((key) => this.slider(key, t(`menu.${key}`), this.tuning[key])).join('')}
              </div>
              <p class="tune-hint" id="tune-hint">${tuningHint(this.tuning)}</p>
            </div>
            <div class="tracks-preview-pane vehicle-stage">
              <canvas id="vehicle-preview" class="vehicle-preview-canvas"></canvas>
              <p class="tune-help">${t('menu.vehicleDrag')}</p>
              <div class="track-preview-meta">
                <strong>${this.vehicleLabel(kind)}</strong>
                <span>${t(`vehicle.${kind}.max`)}</span>
              </div>
              <p class="tune-rules">${kind === 'bike' ? t('menu.wheelPick') : kind === 'scooter' ? t('menu.neonNone') : t('menu.neonPick')}</p>
              ${
                kind === 'scooter'
                  ? `<p class="tune-rules scooter-warn">${t('menu.scooterTrap')}</p>`
                  : `<div class="color-grid">
                ${this.colorSwatchHtml('neon', NEON_NONE, this.selectedNeon)}
                ${NEON_COLOR_CHOICES.map((c) => this.colorSwatchHtml('neon', c, this.selectedNeon)).join('')}
                <label class="color-rgb" title="${t('menu.neonRgb')}">
                  <input type="color" id="neon-rgb" value="${this.selectedNeon < 0 ? '#ff2bd6' : '#' + this.selectedNeon.toString(16).padStart(6, '0')}" />
                </label>
              </div>`
              }
            </div>
          </div>
          <div class="menu-flow-actions">
            <button type="button" class="btn-ghost" data-next>${t('menu.tuningDone')}</button>
            ${this.backRow('vehicles')}
          </div>
        </div>
      `
      this.bindMuteBar()
      this.bindBack('vehicles')
      this.bindTuning()
      this.root.querySelector('[data-next]')?.addEventListener('click', () => confirmTuning())
      const syncNeonActive = () => {
        this.root.querySelectorAll<HTMLButtonElement>('[data-neon]').forEach((b) => {
          b.classList.toggle('active', Number(b.dataset.neon) === this.selectedNeon)
        })
      }
      this.root.querySelectorAll<HTMLButtonElement>('[data-neon]').forEach((btn) => {
        btn.addEventListener('click', () => {
          this.selectedNeon = Number(btn.dataset.neon)
          if (Number.isNaN(this.selectedNeon)) this.selectedNeon = NEON_COLOR_CHOICES[0]!
          if (this.vehiclePreview) {
            this.vehiclePreview.setNeon(this.selectedNeon)
            syncNeonActive()
          } else {
            this.render()
          }
        })
      })
      this.root.querySelector<HTMLInputElement>('#neon-rgb')?.addEventListener('input', (e) => {
        const el = e.target as HTMLInputElement
        this.selectedNeon = parseInt(el.value.slice(1), 16)
        this.vehiclePreview?.setNeon(this.selectedNeon)
        syncNeonActive()
      })
      window.addEventListener(
        'keydown',
        (e) => {
          if (!this.visible || this.screen !== 'tuning') return
          if (e.code !== 'Enter' && e.code !== 'NumpadEnter') return
          const tag = (e.target as HTMLElement | null)?.tagName
          if (tag === 'INPUT' || tag === 'TEXTAREA') return
          e.preventDefault()
          confirmTuning()
        },
        { signal },
      )
      const canvas = this.root.querySelector<HTMLCanvasElement>('#vehicle-preview')
      if (canvas) {
        this.vehiclePreview = new VehiclePreview(canvas)
        this.vehiclePreview.setVehicle(kind, this.selectedColor, this.selectedNeon)
      }
      return
    }

    if (this.screen === 'settings') {
      this.root.innerHTML = `
        ${wm}
        ${this.muteBar()}
        <div class="menu-shell menu-panel menu-settings-hub">
          <div class="home-actions">
            <button type="button" class="btn-ghost home-panel" data-go="controls">${t('menu.settingsControls')}</button>
            <button type="button" class="btn-ghost home-panel" data-go="difficulty">${t('menu.difficulty')}</button>
            <button type="button" class="btn-ghost home-panel" data-go="audio">${t('menu.settingsAudio')}</button>
            <button type="button" class="btn-ghost home-panel" data-go="atmosphere">${t('menu.settingsAtmosphere')}</button>
            <button type="button" class="btn-ghost home-panel" data-go="competitions">${t('menu.settingsCompetitions')}</button>
            <button type="button" class="btn-ghost home-panel" data-go="aiLearn">${t('menu.settingsAiLearn')}</button>
          </div>
          ${this.backRow('home')}
        </div>
        ${this.settingsThanks()}
      `
      this.bindMuteBar()
      this.bindBack('home')
      this.bindThanks()
      this.root.querySelectorAll<HTMLButtonElement>('[data-go]').forEach((btn) => {
        btn.addEventListener('click', () => {
          this.screen = (btn.dataset.go as Screen) || 'settings'
          this.render()
        })
      })
      return
    }

    if (this.screen === 'competitions') {
      const cur = this.competition.id
      const pick = COMPETITIONS.find((c) => c.id === cur) ?? COMPETITIONS[0]!
      const art = menuArtForTone(
        this.atmosphereApi?.get().tone ?? DEFAULT_ATMOSPHERE.tone,
        this.atmosphereApi?.get().calendarPack ?? DEFAULT_ATMOSPHERE.calendarPack,
      )
      this.root.innerHTML = `
        ${wm}
        ${this.muteBar()}
        <div class="menu-shell menu-panel">
          <p class="tune-rules menu-scroll-hint">${t('menu.compBlurb')}</p>
          <div class="tracks-layout">
            <div class="tracks-list">
              ${COMPETITIONS.map((c) => {
                const active = c.id === cur ? 'active' : ''
                return `<button type="button" class="track-card ${active}" data-comp="${c.id}">
                  <strong>${t(`comp.${c.id}`)}</strong>
                  <span>${t(`comp.${c.id}.blurb`)}</span>
                </button>`
              }).join('')}
            </div>
            <div class="tracks-preview-pane comp-preview-pane" style="--comp-photo:url('${art.race}')">
              <div class="comp-preview-hero"></div>
              <div class="track-preview-meta">
                <strong>${t(`comp.${pick.id}`)}</strong>
                <span>${t(`comp.${pick.id}.blurb`)}</span>
              </div>
              <p class="tune-help">${t(`comp.${pick.id}.help`)}</p>
            </div>
          </div>
          ${this.backRow('settings')}
        </div>
      `
      this.bindMuteBar()
      this.bindBack('settings')
      this.root.querySelectorAll<HTMLButtonElement>('[data-comp]').forEach((btn) => {
        btn.addEventListener('click', () => {
          this.audioApi?.playClick?.()
          const id = (btn.dataset.comp || 'none') as CompetitionId
          this.competition = { id }
          saveCompetitionSettings(this.competition)
          if (id === 'championship') resetChampionship()
          this.render()
        })
      })
      return
    }

    if (this.screen === 'aiLearn') {
      const learn = loadLearnSettings()
      const samples = loadCommunitySamples()
      const model = loadLearnedModel()
      const rows = analyticsTable()
      const tableRows = rows
        .slice(0, 40)
        .map(
          (r) =>
            `<tr>
              <td>${this.escape(r.trackId)}</td>
              <td>${this.escape(r.vehicle)}</td>
              <td>${this.escape(r.difficulty)}</td>
              <td>${r.n}</td>
              <td>${r.players}</td>
              <td>${fmtMs(r.medianMs)}</td>
              <td>${fmtMs(r.learnedPaceMs)}</td>
            </tr>`,
        )
        .join('')
      this.root.innerHTML = `
        ${wm}
        ${this.muteBar()}
        <div class="menu-shell menu-panel">
          <p class="tune-rules">${t('menu.aiLearnBlurb')}</p>
          <p class="tune-help">${t('menu.aiLearnStats', { n: samples.length, c: model.cells.length })}</p>
          <div class="dir-grid" style="margin:12px 0">
            <button type="button" class="track-card ${learn.enabled ? 'active' : ''}" data-learn-enabled>
              <strong>${t('menu.aiLearnCollect')}</strong>
              <span>${learn.enabled ? t('menu.ctrlOn') : t('menu.ctrlOff')}</span>
            </button>
            <button type="button" class="track-card ${learn.applyToAi ? 'active' : ''}" data-learn-apply>
              <strong>${t('menu.aiLearnApply')}</strong>
              <span>${learn.applyToAi ? t('menu.ctrlOn') : t('menu.ctrlOff')}</span>
            </button>
          </div>
          <div class="dir-grid" style="margin-bottom:12px">
            <button type="button" class="menu-start" data-learn-export>${t('menu.aiLearnExport')}</button>
            <button type="button" class="btn-ghost" data-learn-import>${t('menu.aiLearnImport')}</button>
          </div>
          <input type="file" accept="application/json,.json" data-learn-file hidden />
          <textarea class="text-input" data-learn-box readonly rows="5" style="width:100%;font-size:11px" placeholder="${t('menu.aiLearnPh')}"></textarea>
          <p class="tune-rules" data-learn-status style="margin-top:8px"></p>
          <div style="overflow:auto;max-height:240px;margin-top:12px">
            <table class="ai-learn-table">
              <thead>
                <tr>
                  <th>${t('menu.aiLearnColTrack')}</th>
                  <th>${t('menu.aiLearnColVeh')}</th>
                  <th>${t('menu.aiLearnColDiff')}</th>
                  <th>N</th>
                  <th>${t('menu.aiLearnColPlayers')}</th>
                  <th>${t('menu.aiLearnColMedian')}</th>
                  <th>${t('menu.aiLearnColTarget')}</th>
                </tr>
              </thead>
              <tbody>${tableRows || `<tr><td colspan="7">${t('menu.aiLearnEmpty')}</td></tr>`}</tbody>
            </table>
          </div>
          <div class="atm-scene-panel" style="margin-top:18px">
            <p class="atm-scene-title">${t('menu.paceExport')}</p>
            <p class="tune-help">${t('menu.paceExportHint', { n: getPaceSamples().length, r: allRecords().length })}</p>
            <button type="button" class="menu-start" data-pace-export>${t('menu.paceExportBtn')}</button>
            <p class="tune-rules" data-pace-status style="margin-top:8px"></p>
            <textarea class="text-input" data-pace-box readonly rows="5" style="width:100%;margin-top:10px;font-size:12px;opacity:0.9" placeholder="${t('menu.paceExportPh')}"></textarea>
          </div>
          ${this.backRow('settings')}
        </div>
      `
      this.bindMuteBar()
      this.bindBack('settings')
      this.bindAiLearn()
      this.root.querySelector<HTMLButtonElement>('[data-pace-export]')?.addEventListener('click', () => {
        this.audioApi?.playClick?.()
        void this.exportPaceCalibration()
      })
      return
    }

    if (this.screen === 'controls') {
      let binds: KeyBindingsMap = loadKeyBindings()
      let tricks: TrickBindingsMap = loadTrickBindings()
      const drive: BindAction[] = ['throttle', 'brake', 'steerLeft', 'steerRight']
      const special: BindAction[] = ['push', 'tab', 'shiftUp', 'shiftDown', 'clutch', 'ebrake']
      const system: BindAction[] = ['camera', 'restart', 'menu']
      const section = (title: string, actions: BindAction[]) => {
        const rows = actions
          .map((action) => {
            const [a, b] = binds[action]
            return `<div class="bind-row" data-action="${action}">
              <span class="bind-name">${t(`bind.${action}`)}</span>
              <button type="button" class="bind-key" data-slot="0">${codeLabel(a)}</button>
              <button type="button" class="bind-key" data-slot="1">${codeLabel(b)}</button>
            </div>`
          })
          .join('')
        return `<div class="bind-section"><h3 class="bind-section-title">${title}</h3>${rows}</div>`
      }
      const trickKind = this.ctrlTrickKind
      const trickDefs = freestyleList(trickKind)
      const trickRows = TRICK_LETTERS.map((ch) => {
        const def = trickDefs.find((tr) => tr.letter === ch)
        const name = def?.nameCs ?? ch
        return `<div class="bind-row bind-row-trick" data-trick-letter="${ch}">
          <span class="bind-name">${ch} · ${this.escape(name)}</span>
          <button type="button" class="bind-key" data-trick-key>${codeLabel(tricks[ch] ?? null)}</button>
        </div>`
      }).join('')
      const feel = this.controlFeelApi?.get() ?? { ...DEFAULT_CONTROL_FEEL }
      const raceFeel = this.raceApi?.get() ?? { ...DEFAULT_RACE }
      const sensPct = Math.round(feel.steerSens * 100)
      const hudPct = Math.round(feel.hudScale * 100)
      const camFollows: CamFollow[] = ['soft', 'normal', 'tight']
      const onPhone = isMobileClient()
      const mobileSchemeHtml = `
            <div class="bind-section">
              <h3 class="bind-section-title">${t('menu.ctrlMobileTitle')}</h3>
              <p class="tune-rules menu-mobile-warn">${t('menu.mobileLimits')}</p>
              <p class="tune-rules">${t('menu.ctrlMobileBlurb')}</p>
              <div class="dir-grid mobile-scheme-grid">
                ${MOBILE_DRIVE_SCHEMES.map((s) => {
                  const active = s === feel.mobileScheme ? 'active' : ''
                  return `<button type="button" class="track-card ${active}" data-mobile-scheme="${s}">
                    <strong>${t(`menu.ctrlMobile.${s}`)}</strong>
                    <span>${t(`menu.ctrlMobile.${s}.blurb`)}</span>
                  </button>`
                }).join('')}
              </div>
            </div>`
      this.root.innerHTML = `
        ${wm}
        ${this.muteBar()}
        <div class="menu-shell menu-panel menu-controls">
          <p class="tune-rules">${onPhone ? t('menu.ctrlBlurbMobile') : t('menu.ctrlBlurb')}</p>
          ${
            onPhone
              ? ''
              : `<div class="ctrl-overview" aria-label="${t('menu.ctrlTitle')}">
            <div class="ctrl-overview-item">
              <strong>${t('menu.ctrlOverviewSteer')}</strong>
              <span>${t('menu.ctrlOverviewSteerVal')}</span>
            </div>
            <div class="ctrl-overview-item">
              <strong>${t('menu.ctrlOverviewGas')}</strong>
              <span>${t('menu.ctrlOverviewGasVal')}</span>
            </div>
            <div class="ctrl-overview-item">
              <strong>${t('menu.ctrlOverviewSpecial')}</strong>
              <span>${t('menu.ctrlOverviewSpecialVal')}</span>
            </div>
            <div class="ctrl-overview-item">
              <strong>${t('menu.ctrlOverviewMenu')}</strong>
              <span>${t('menu.ctrlOverviewMenuVal')}</span>
            </div>
          </div>`
          }
          <div class="bind-list">
            ${mobileSchemeHtml}
            <div class="bind-section">
              <h3 class="bind-section-title">${t('menu.ctrlFeelTitle')}</h3>
              <p class="tune-rules">${t('menu.ctrlFeelBlurb')}</p>
              <label class="tune-row">
                <span>${t('menu.ctrlSteerSens')} <strong class="tune-val" data-feel-sens-val>${sensPct}%</strong></span>
                <input type="range" min="55" max="145" step="5" value="${sensPct}" data-feel-sens />
              </label>
              <label class="tune-row">
                <span>${t('menu.ctrlHudScale')} <strong class="tune-val" data-feel-hud-val>${hudPct}%</strong></span>
                <input type="range" min="75" max="135" step="5" value="${hudPct}" data-feel-hud />
              </label>
              <div class="dir-grid" style="margin:10px 0">
                <button type="button" class="track-card ${feel.invertSteer ? 'active' : ''}" data-feel-invert>
                  <strong>${t('menu.ctrlInvertSteer')}</strong>
                  <span>${feel.invertSteer ? t('menu.ctrlOn') : t('menu.ctrlOff')}</span>
                </button>
                <button type="button" class="track-card ${feel.stabilityAssist ? 'active' : ''}" data-feel-stability>
                  <strong>${t('menu.ctrlStability')}</strong>
                  <span>${feel.stabilityAssist ? t('menu.ctrlOn') : t('menu.ctrlOff')}</span>
                </button>
                <button type="button" class="track-card ${feel.driftMode ? 'active' : ''}" data-feel-drift>
                  <strong>${t('menu.ctrlDrift')}</strong>
                  <span>${feel.driftMode ? t('menu.ctrlOn') : t('menu.ctrlOff')}</span>
                </button>
                <button type="button" class="track-card ${raceFeel.skipCountdown ? 'active' : ''}" data-feel-skip-cd>
                  <strong>${t('menu.ctrlSkipCountdown')}</strong>
                  <span>${raceFeel.skipCountdown ? t('menu.ctrlOn') : t('menu.ctrlOff')}</span>
                </button>
              </div>
              <p class="tune-rules">${t('menu.ctrlCamFollow')}</p>
              <div class="dir-grid">
                ${camFollows
                  .map((c) => {
                    const active = c === feel.camFollow ? 'active' : ''
                    return `<button type="button" class="track-card ${active}" data-feel-cam="${c}">
                      <strong>${t(`menu.ctrlCam.${c}`)}</strong>
                    </button>`
                  })
                  .join('')}
              </div>
            </div>
            ${
              onPhone
                ? `<div class="bind-section">
              <h3 class="bind-section-title">${t('menu.ctrlSectionTricks')}</h3>
              <p class="tune-rules menu-mobile-warn">${t('menu.ctrlTricksMobileOff')}</p>
            </div>`
                : `<div class="bind-section">
              <h3 class="bind-section-title">${t('menu.manualTitle')}</h3>
              <p class="tune-rules">${t('menu.manualBlurb')}</p>
              <div class="manual-grid">
                <button type="button" class="track-card ${raceFeel.transmission === 'auto' ? 'active' : ''}" data-tx="auto">
                  <strong>${t('menu.manual.off')}</strong>
                  <span>${t('menu.manual.offBlurb')}</span>
                  <em class="manual-hist">${t('menu.manual.offHist')}</em>
                </button>
                <button type="button" class="track-card ${raceFeel.transmission === 'manual' ? 'active' : ''}" data-tx="manual">
                  <strong>${t('menu.manual.on')}</strong>
                  <span>${t('menu.manual.onBlurb')}</span>
                  <em class="manual-hist">${t('menu.manual.onHist')}</em>
                </button>
                <button type="button" class="track-card track-card-wide ${raceFeel.transmission === 'clutch' ? 'active' : ''}" data-tx="clutch">
                  <strong>${t('menu.manual.clutch')}</strong>
                  <span>${t('menu.manual.clutchBlurb')}</span>
                  <em class="manual-hist">${t('menu.manual.clutchHist')}</em>
                </button>
              </div>
            </div>
            ${section(t('menu.ctrlSectionDrive'), drive)}
            ${section(t('menu.ctrlSectionSpecial'), special)}
            ${section(t('menu.ctrlSectionSystem'), system)}
            <div class="bind-section">
              <h3 class="bind-section-title">${t('menu.ctrlSectionTricks')}</h3>
              <p class="tune-rules">${t('menu.ctrlTricksBlurb')}</p>
              <div class="dir-grid" style="margin-bottom:10px">
                <button type="button" class="track-card ${trickKind === 'skate' ? 'active' : ''}" data-trick-kind="skate">
                  <strong>${t('vehicle.skate')}</strong>
                </button>
                <button type="button" class="track-card ${trickKind === 'bike' ? 'active' : ''}" data-trick-kind="bike">
                  <strong>${t('vehicle.bike')}</strong>
                </button>
              </div>
              <div class="trick-bind-list">${trickRows}</div>
            </div>`
            }
            <button type="button" class="btn-ghost" data-reset-binds style="margin-top:6px">${t('menu.ctrlReset')}</button>
            ${this.backRow('settings')}
          </div>
        </div>
      `
      this.bindMuteBar()
      this.bindBack('settings')
      this.bindControlFeel()
      this.root.querySelectorAll<HTMLButtonElement>('[data-tx]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const mode = btn.dataset.tx
          if (mode !== 'auto' && mode !== 'manual' && mode !== 'clutch') return
          this.raceApi?.set({ transmission: mode })
          this.render()
        })
      })
      type Listen =
        | { kind: 'action'; action: BindAction; slot: 0 | 1 }
        | { kind: 'trick'; letter: string }
        | null
      let listen: Listen = null
      const onKey = (e: KeyboardEvent) => {
        if (!listen) return
        e.preventDefault()
        e.stopPropagation()
        if (listen.kind === 'action') {
          binds[listen.action][listen.slot] = e.code
          saveKeyBindings(binds)
        } else {
          tricks[listen.letter] = e.code
          saveTrickBindings(tricks)
        }
        listen = null
        window.removeEventListener('keydown', onKey, true)
        this.render()
      }
      this.root.querySelectorAll<HTMLButtonElement>('.bind-key[data-slot]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const row = btn.closest('[data-action]') as HTMLElement
          const action = row?.dataset.action as BindAction | undefined
          const slot = Number(btn.dataset.slot) as 0 | 1
          if (!action) return
          listen = { kind: 'action', action, slot }
          btn.textContent = '…'
          window.addEventListener('keydown', onKey, true)
        })
      })
      const wireTrickKeys = () => {
        this.root.querySelectorAll<HTMLButtonElement>('[data-trick-key]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const row = btn.closest('[data-trick-letter]') as HTMLElement
            const letter = row?.dataset.trickLetter
            if (!letter) return
            listen = { kind: 'trick', letter }
            btn.textContent = '…'
            window.addEventListener('keydown', onKey, true)
          })
        })
      }
      wireTrickKeys()
      this.root.querySelectorAll<HTMLButtonElement>('[data-trick-kind]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const next = btn.dataset.trickKind === 'bike' ? 'bike' : 'skate'
          if (next === this.ctrlTrickKind) return
          this.ctrlTrickKind = next
          this.root.querySelectorAll<HTMLButtonElement>('[data-trick-kind]').forEach((b) => {
            b.classList.toggle('active', b.dataset.trickKind === next)
          })
          const list = this.root.querySelector('.trick-bind-list')
          if (list) {
            const defs = freestyleList(next)
            list.innerHTML = TRICK_LETTERS.map((ch) => {
              const def = defs.find((tr) => tr.letter === ch)
              const name = def?.nameCs ?? ch
              return `<div class="bind-row bind-row-trick" data-trick-letter="${ch}">
                <span class="bind-name">${ch} · ${this.escape(name)}</span>
                <button type="button" class="bind-key" data-trick-key>${codeLabel(tricks[ch] ?? null)}</button>
              </div>`
            }).join('')
            wireTrickKeys()
          }
        })
      })
      this.root.querySelector('[data-reset-binds]')?.addEventListener('click', () => {
        binds = cloneBindings(DEFAULT_BINDINGS)
        tricks = defaultTrickBindings()
        saveKeyBindings(binds)
        saveTrickBindings(tricks)
        this.render()
      })
      return
    }

    if (this.screen === 'records') {
      const filter = this.lbTrackId
      const list = (filter ? recordsFor(filter) : recordsFor()).slice(0, 30)
      const tabs = [
        `<button type="button" class="track-card ${!filter ? 'active' : ''}" data-lb="">${t('menu.lbAll')}</button>`,
        ...TRACKS.map((tr) => {
          const active = filter === tr.id ? 'active' : ''
          return `<button type="button" class="track-card ${active}" data-lb="${tr.id}">${this.escape(this.trackName(tr))}</button>`
        }),
      ].join('')
      const rows = list
        .map((e, i) => {
          const tr = TRACKS.find((x) => x.id === e.trackId)
          const trackLabel = tr ? this.trackName(tr) : e.trackId
          const time = e.bestTimeMs > 0 ? formatTime(e.bestTimeMs) : '—'
          const fs = e.bestFsScore > 0 ? `FS ${e.bestFsScore}` : '—'
          const tricks = e.bestTrickPts > 0 ? `· triky ${e.bestTrickPts}` : ''
          return `<li class="lb-row">
            <span class="lb-rank">${i + 1}.</span>
            <span class="lb-player">${this.escape(e.player)}</span>
            <span class="lb-meta">${this.escape(trackLabel)} · ${this.vehicleLabel(e.vehicle)}</span>
            <span class="lb-score">${fs} ${tricks}</span>
            <span class="lb-time">${time}</span>
          </li>`
        })
        .join('')
      this.root.innerHTML = `
        ${wm}
        ${this.muteBar()}
        <div class="menu-shell menu-panel">
          <p class="tune-rules">${t('menu.lbBlurb')}</p>
          <div class="lb-tabs">${tabs}</div>
          <ol class="records-list lb-list">${rows || `<li>${t('menu.recEmpty')}</li>`}</ol>
          ${this.backRow(this.recordsBack)}
        </div>
      `
      this.bindMuteBar()
      this.bindBack(this.recordsBack)
      this.root.querySelectorAll<HTMLButtonElement>('[data-lb]').forEach((btn) => {
        btn.addEventListener('click', () => {
          this.lbTrackId = btn.dataset.lb || ''
          this.render()
        })
      })
      return
    }

    if (this.screen === 'manual') {
      // Manuální řazení je teď v Ovládání
      this.screen = isMobileClient() ? 'settings' : 'controls'
      this.render()
      return
    }

    if (this.screen === 'difficulty') {
      const race = this.raceApi?.get() ?? { ...DEFAULT_RACE }
      if (typeof race.randomOpponentsEachRace !== 'boolean') {
        race.randomOpponentsEachRace = true
      }
      const pool = soloCategoryPool(this.selectedVehicle, false)
      const opp = clampOpponentsToCategory(race.opponents, this.selectedVehicle, false)
      if (
        opp[0] !== race.opponents[0] ||
        opp[1] !== race.opponents[1] ||
        opp[2] !== race.opponents[2]
      ) {
        this.raceApi?.set({ opponents: opp })
      }
      const pick = DIFFICULTIES.find((d) => d.id === this.selectedDifficulty) ?? DIFFICULTIES[2]!
      const scalePct = Math.round(pick.speedScale * 100)
      this.root.innerHTML = `
        ${wm}
        ${this.muteBar()}
        <div class="menu-shell menu-panel">
          <p class="tune-rules menu-scroll-hint">${t('menu.diffBlurb')}</p>
          <div class="tracks-layout diff-layout">
            <div class="tracks-list diff-list">
              ${DIFFICULTIES.map((d) => {
                const active = d.id === this.selectedDifficulty ? 'active' : ''
                const pct = Math.round(d.speedScale * 100)
                return `<button type="button" class="track-card diff-card ${active}" data-diff="${d.id}">
                  <strong>${t(`diff.${d.id}`)}</strong>
                  <span class="diff-card-scale">${t('menu.diffAiPace', { pct })}</span>
                </button>`
              }).join('')}
            </div>
            <div class="tracks-preview-pane diff-preview-pane">
              <div class="track-preview-meta">
                <strong>${t(`diff.${pick.id}`)}</strong>
                <span>${t(`diff.${pick.id}Help`)}</span>
              </div>
              <p class="diff-scale-badge">${t('menu.diffAiPace', { pct: scalePct })}</p>
              <p class="tune-help">${t(`diff.${pick.id}Blurb`)}</p>
            </div>
          </div>
          <div class="atm-scene-panel" style="margin-top:18px">
            <p class="atm-scene-title">${t('menu.opponents')}</p>
            <p class="tune-help">${t('menu.opponentsBlurb')}</p>
            <label class="manual-option ${race.randomOpponentsEachRace ? 'active' : ''}" style="margin:12px 0;display:flex;gap:10px;align-items:flex-start;cursor:pointer">
              <input type="checkbox" data-opp-random-each ${race.randomOpponentsEachRace ? 'checked' : ''} style="margin-top:4px" />
              <span>
                <strong>${t('menu.opponentsRandomEach')}</strong>
                <span class="tune-help" style="display:block;margin-top:4px">${t('menu.opponentsRandomEachBlurb')}</span>
              </span>
            </label>
            <div class="opp-fixed ${race.randomOpponentsEachRace ? 'opp-fixed-dim' : ''}">
            ${[0, 1, 2]
              .map((slot) => {
                const cur = opp[slot]!
                return `<div class="opp-row">
                  <span class="opp-label">${t('menu.opponent')} ${slot + 1}</span>
                  <div class="opp-picks">
                    ${pool
                      .map((k) => {
                        const active = k === cur ? 'active' : ''
                        const disabled = race.randomOpponentsEachRace ? 'disabled' : ''
                        return `<button type="button" class="track-card opp-card ${active}" data-opp-slot="${slot}" data-opp-kind="${k}" ${disabled}>
                        <strong>${this.vehicleLabel(k)}</strong>
                      </button>`
                      })
                      .join('')}
                  </div>
                </div>`
              })
              .join('')}
            <button type="button" class="menu-start" data-opp-random style="margin-top:14px" ${race.randomOpponentsEachRace ? 'disabled' : ''}>${t('menu.opponentsRandom')}</button>
            </div>
          </div>
          ${this.backRow('settings')}
        </div>
      `
      this.bindMuteBar()
      this.bindBack('settings')
      this.root.querySelectorAll<HTMLButtonElement>('[data-diff]').forEach((btn) => {
        btn.addEventListener('click', () => {
          this.audioApi?.playClick?.()
          this.selectedDifficulty = (btn.dataset.diff as DifficultyId) || 'normal'
          this.render()
        })
      })
      this.root.querySelector<HTMLInputElement>('[data-opp-random-each]')?.addEventListener(
        'change',
        (e) => {
          this.audioApi?.playClick?.()
          const on = (e.target as HTMLInputElement).checked
          this.raceApi?.set({ randomOpponentsEachRace: on })
          this.render()
        },
      )
      this.root.querySelectorAll<HTMLButtonElement>('[data-opp-slot]').forEach((btn) => {
        btn.addEventListener('click', () => {
          if (btn.disabled) return
          this.audioApi?.playClick?.()
          const slot = Number(btn.dataset.oppSlot)
          const kind = btn.dataset.oppKind as VehicleKind
          if (slot < 0 || slot > 2 || !kind || !pool.includes(kind)) return
          const next: [VehicleKind, VehicleKind, VehicleKind] = [...opp]
          next[slot] = kind
          this.raceApi?.set({ opponents: next, randomOpponentsEachRace: false })
          this.render()
        })
      })
      this.root.querySelector('[data-opp-random]')?.addEventListener('click', () => {
        const el = this.root.querySelector<HTMLButtonElement>('[data-opp-random]')
        if (el?.disabled) return
        this.audioApi?.playClick?.()
        this.raceApi?.set({
          opponents: randomOpponents(this.selectedVehicle, false),
          randomOpponentsEachRace: false,
        })
        this.render()
      })
      return
    }

    if (this.screen === 'audio') {
      const audio = this.audioApi?.get() ?? { ...DEFAULT_AUDIO }
      this.root.innerHTML = `
        ${wm}
        ${this.muteBar()}
        <div class="menu-shell menu-panel">
          <div class="tune-grid">
            ${this.audioSlider('master', t('menu.audioMaster'), audio.master)}
            ${this.audioSlider('music', t('menu.audioMusic'), audio.music)}
            ${this.audioSlider('sfx', t('menu.audioSfx'), audio.sfx)}
            ${this.audioSlider('menu', t('menu.audioMenu'), audio.menu)}
          </div>
          <p class="tune-help" style="margin-top:8px">${t('menu.audioMenuBlurb')}</p>
          <p class="tune-rules" style="margin-top:16px">${t('menu.audioTrack')}</p>
          <div class="track-grid">
            ${MUSIC_TRACKS.map((m) => {
              const active = m.id === audio.track ? 'active' : ''
              return `<button type="button" class="track-card ${active}" data-music="${m.id}">
                <strong>${t(m.labelKey)}</strong>
              </button>`
            }).join('')}
          </div>
          ${this.backRow('settings')}
        </div>
      `
      this.bindMuteBar()
      this.bindBack('settings')
      this.bindAudio()
      return
    }

    if (this.screen === 'atmosphere') {
      const atm = this.atmosphereApi?.get() ?? { ...DEFAULT_ATMOSPHERE }
      const vis = this.visualApi?.get() ?? { ...DEFAULT_VISUAL }
      const tones: MenuTone[] = [
        'klecany',
        'cesko',
        'neon',
        'ember',
        'ice',
        'moss',
        'asphalt',
        'calendar',
      ]
      const packOpen = this.calendarPackOpen && atm.tone === 'calendar'
      const lightIdx = lightIndex(atm.light)
      const fogIdx = fogIndex(atm.fog)
      const decorIdx = decorIndex(atm.decor)
      const toneCards = tones
        .map((tone) => {
          const active = tone === atm.tone ? 'active' : ''
          const art = menuArtForTone(tone, atm.calendarPack)
          if (tone !== 'calendar') {
            return `<button type="button" class="track-card track-card-photo ${active}" data-tone="${tone}" style="--card-photo:url('${art.bg}')">
              <strong>${t(`menu.atmTone.${tone}`)}</strong>
              <span>${t(`menu.atmTone.${tone}.blurb`)}</span>
            </button>`
          }
          return `<div class="tone-calendar-cell">
            <button type="button" class="track-card track-card-photo ${active}" data-tone="calendar" style="--card-photo:url('${art.bg}')">
              <strong>${t('menu.atmTone.calendar')}</strong>
              <span>${t(`menu.atmCalendar.${atm.calendarPack}.blurb`)}</span>
            </button>
            <button type="button" class="tone-gear ${packOpen ? 'active' : ''}" data-calendar-gear title="${t('menu.atmCalendarPacks')}" aria-expanded="${packOpen ? 'true' : 'false'}">⚙</button>
          </div>`
        })
        .join('')
      const calendarPacksHtml = packOpen
        ? `<div class="calendar-pack-panel" role="group" aria-label="${t('menu.atmCalendarPacks')}">
            <p class="tune-rules calendar-pack-hint">${t('menu.atmCalendarPacksBlurb')}</p>
            <div class="calendar-pack-grid">
              ${CALENDAR_PACKS.map((pack) => {
                const pActive = pack === atm.calendarPack ? 'active' : ''
                const pArt = menuArtForTone('calendar', pack)
                return `<button type="button" class="track-card track-card-photo calendar-pack-card ${pActive}" data-calendar-pack="${pack}" style="--card-photo:url('${pArt.bg}')">
                  <strong>${t(`menu.atmCalendar.${pack}`)}</strong>
                  <span>${t(`menu.atmCalendar.${pack}.blurb`)}</span>
                </button>`
              }).join('')}
            </div>
          </div>`
        : ''
      this.root.innerHTML = `
        ${wm}
        ${this.muteBar()}
        <div class="menu-shell menu-panel">
          <p class="tune-rules">${t('menu.atmTone')}</p>
          <div class="track-grid">
            ${toneCards}
          </div>
          ${calendarPacksHtml}
          <p class="tune-rules" style="margin-top:18px">${t('menu.visualQuality')}</p>
          <p class="tune-help">${t('menu.visualQualityBlurb')}</p>
          <div class="track-grid">
            ${VISUAL_QUALITIES.map((q) => {
              const active = q === vis.quality ? 'active' : ''
              return `<button type="button" class="track-card ${active}" data-visual-q="${q}">
                <strong>${t(`menu.visual.${q}`)}</strong>
                <span>${t(`menu.visual.${q}.blurb`)}</span>
              </button>`
            }).join('')}
          </div>
          <div class="atm-scene-panel">
            <p class="atm-scene-title">${t('menu.atmScene')}</p>
            <p class="tune-help">${t('menu.atmSceneBlurb')}</p>
            <div class="atm-fx-toggles">
              <button type="button" class="atm-fx-toggle ${vis.bloom ? 'active' : ''}" data-visual-bloom>
                <strong>${t('menu.visualBloom')}</strong>
                <span>${vis.bloom ? t('menu.ctrlOn') : t('menu.ctrlOff')}</span>
              </button>
              <button type="button" class="atm-fx-toggle ${vis.shadows ? 'active' : ''}" data-visual-shadows>
                <strong>${t('menu.visualShadows')}</strong>
                <span>${vis.shadows ? t('menu.ctrlOn') : t('menu.ctrlOff')}</span>
              </button>
              <button type="button" class="atm-fx-toggle ${vis.rearMirror ? 'active' : ''}" data-visual-mirror>
                <strong>${t('menu.visualMirror')}</strong>
                <span>${vis.rearMirror ? t('menu.ctrlOn') : t('menu.ctrlOff')}</span>
              </button>
            </div>
            <div class="tune-grid atm-scene-sliders">
              <label class="tune-row">
                <span class="tune-label">${t('menu.atmLight')} <span class="tune-val" data-atm-light-val>${t(`menu.atmLight.${atm.light}`)}</span></span>
                <input type="range" min="0" max="3" step="1" value="${lightIdx}" data-atm-light />
              </label>
              <label class="tune-row">
                <span class="tune-label">${t('menu.atmFog')} <span class="tune-val" data-atm-fog-val>${t(`menu.atmFog.${atm.fog}`)}</span></span>
                <input type="range" min="0" max="2" step="1" value="${fogIdx}" data-atm-fog />
              </label>
              <label class="tune-row">
                <span class="tune-label">${t('menu.atmDecor')} <span class="tune-val" data-atm-decor-val>${t(`menu.atmDecor.${atm.decor}`)}</span></span>
                <input type="range" min="0" max="2" step="1" value="${decorIdx}" data-atm-decor />
              </label>
            </div>
          </div>
          ${this.backRow('settings')}
        </div>
      `
      this.bindMuteBar()
      this.bindBack('settings')
      this.bindAtmosphere()
      this.bindVisual()
      return
    }

    if (this.screen === 'online') {
      const ob = this.onlineBrowser
      const presence = ob.presence
      const rooms = presence?.rooms ?? []
      const joinable = rooms.filter((r) => r.joinable)
      const statusLine = ob.connecting
        ? t('menu.onlineConnecting')
        : ob.connected
          ? `${t('menu.onlineLive')}: ${presence?.online ?? 0}`
          : t('menu.onlineOffline')
      const roomCards =
        joinable.length === 0
          ? `<p class="tune-rules">${t('menu.onlineNoRooms')}</p>`
          : `<div class="online-room-list">${joinable
              .map((r) => {
                const track = TRACKS.find((tr) => tr.id === r.trackId)
                const trackName = track ? this.trackName(track) : r.trackId
                return `<button type="button" class="track-card online-room-card" data-join-code="${this.escape(r.code)}">
                  <strong>${this.escape(r.hostName)} · ${this.escape(r.code)}</strong>
                  <span>${this.escape(trackName)} · ${r.laps} ${t('menu.onlineLaps').toLowerCase()} · ${r.players}/${r.maxPlayers}</span>
                </button>`
              })
              .join('')}</div>`
      const browsing =
        presence?.browsing?.length
          ? `<p class="tune-rules">${t('menu.onlineBrowsing')}: ${presence.browsing.map((n) => this.escape(n)).join(', ')}</p>`
          : ''
      const racing = rooms.filter((r) => r.phase === 'racing' || r.phase === 'countdown')
      const racingLine =
        racing.length > 0
          ? `<p class="tune-rules">${t('menu.onlinePlaying')}: ${racing
              .map((r) => `${this.escape(r.hostName)} (${r.players})`)
              .join(' · ')}</p>`
          : ''
      this.root.innerHTML = `
        ${wm}
        ${this.muteBar()}
        <div class="menu-shell menu-panel menu-online">
          <p class="menu-sub">${t('menu.onlineSub')}</p>
          <p class="menu-sub online-status">${statusLine}</p>
          <section class="menu-section">
            <h2>${t('menu.name')}</h2>
            <input class="text-input" id="player-name" maxlength="18" value="${this.escape(this.playerName)}" />
          </section>
          <section class="menu-section">
            <h2>${t('menu.onlineRooms')}</h2>
            ${roomCards}
            ${racingLine}
            ${browsing}
          </section>
          <section class="menu-section">
            <h2>${t('menu.onlineCreate')}</h2>
            <p class="tune-rules">${t('menu.track')}</p>
            <div class="dir-grid online-track-pick">
              ${TRACKS.filter((tr) => !tr.sandbox)
                .slice(0, 8)
                .map((tr) => {
                  const active = tr.id === this.selectedTrackId ? 'active' : ''
                  return `<button type="button" class="track-card ${active}" data-host-track="${tr.id}">
                    <strong>${this.escape(this.trackName(tr))}</strong>
                  </button>`
                })
                .join('')}
            </div>
            <p class="tune-rules" style="margin-top:10px">${t('menu.onlineLaps')}: <strong>${this.hostLaps}</strong></p>
            <div class="dir-grid">
              ${[1, 2, 3, 4, 5]
                .map(
                  (n) =>
                    `<button type="button" class="track-card ${n === this.hostLaps ? 'active' : ''}" data-host-laps="${n}"><strong>${n}</strong></button>`,
                )
                .join('')}
            </div>
            <button type="button" class="menu-start" id="btn-host" style="margin-top:12px">${t('menu.onlineCreate')}</button>
          </section>
          <details class="online-advanced">
            <summary>${t('menu.onlineConn')}</summary>
            ${this.onlineBlock()}
            <button type="button" class="btn-ghost" id="btn-join" style="margin-top:8px">${t('menu.join')} (${t('menu.roomCode')})</button>
          </details>
          ${this.backRow('raceMode')}
          ${this.lobbyError || ob.error ? `<p class="menu-error">${this.escape(this.lobbyError || ob.error)}</p>` : ''}
        </div>
      `
      this.bindMuteBar()
      this.bindBack('raceMode')
      this.root.querySelector('#player-name')?.addEventListener('change', () => {
        this.readFields()
        this.onBrowseOnline?.()
      })
      this.root.querySelectorAll<HTMLButtonElement>('[data-host-track]').forEach((btn) => {
        btn.addEventListener('click', () => {
          this.selectedTrackId = btn.dataset.hostTrack || this.selectedTrackId
          this.render()
        })
      })
      this.root.querySelectorAll<HTMLButtonElement>('[data-host-laps]').forEach((btn) => {
        btn.addEventListener('click', () => {
          this.hostLaps = Number(btn.dataset.hostLaps) || 2
          this.render()
        })
      })
      this.root.querySelectorAll<HTMLButtonElement>('[data-join-code]').forEach((btn) => {
        btn.addEventListener('click', () => {
          this.readFields()
          this.joinCode = btn.dataset.joinCode || ''
          this.emitStart('join')
        })
      })
      this.root.querySelector('#btn-host')?.addEventListener('click', () => {
        this.readFields()
        this.emitStart('host')
      })
      this.root.querySelector('#btn-join')?.addEventListener('click', () => {
        this.readFields()
        this.emitStart('join')
      })
    }
  }

  private emitStart(mode: 'host' | 'join'): void {
    this.onStart?.({
      mode,
      trackId: this.selectedTrackId,
      vehicle: this.selectedVehicle,
      color: this.selectedColor,
      neon: this.selectedNeon,
      tuning: { ...this.tuning },
      name: this.playerName,
      difficulty: this.selectedDifficulty,
      roomCode: mode === 'join' ? this.joinCode : undefined,
      publicWsUrl: this.publicWsUrl || undefined,
      laps: this.hostLaps,
    })
  }

  private muteBar(): string {
    const muted = this.audioApi?.get().muted ?? false
    return muteToggleHtml(muted)
  }

  private bindMuteBar(): void {
    bindMuteToggle(
      this.root,
      () => this.audioApi?.get().muted ?? false,
      (m) => {
        this.audioApi?.unlock()
        this.audioApi?.set({ muted: m })
      },
      () => this.render(),
    )
  }

  private bindBack(to: Screen | 'entry'): void {
    if (to === 'entry') {
      this.root.querySelector('[data-back-entry]')?.addEventListener('click', () => {
        this.audioApi?.playClick?.()
        this.onBackToEntry?.()
      })
      return
    }
    this.root.querySelector('[data-back]')?.addEventListener('click', () => {
      this.audioApi?.playClick?.()
      if (this.screen === 'vehicles' && to === 'home') {
        if (this.selectedVehicle === 'scooter' && !this.tryLeaveScooter()) return
        this.clearScooterTrap()
      }
      this.screen = to
      this.render()
    })
  }

  private confirmRaceMode(): void {
    const mode = this.raceModePick === 'online' ? 'online' : 'classic'
    if (mode === 'online') {
      this.screen = 'online'
      this.render()
      this.onBrowseOnline?.()
      return
    }
    // Freestyle závod zrušen — triky/body zůstávají u skate/kola v klasice
    this.raceApi?.set({ freestyle: false })
    const race = this.raceApi?.get()
    if (race) {
      this.raceApi?.set({
        opponents: clampOpponentsToCategory(race.opponents, this.selectedVehicle, false),
      })
    }
    this.startSolo()
  }

  private startSolo(): void {
    if (this.selectedVehicle === 'scooter') {
      this.screen = 'vehicles'
      this.tryLeaveScooter()
      return
    }
    this.onStart?.({
      mode: 'solo',
      trackId: this.selectedTrackId,
      vehicle: this.selectedVehicle,
      color: this.selectedColor,
      neon: this.selectedNeon,
      tuning: { ...this.tuning },
      name: this.playerName,
      difficulty: this.selectedDifficulty,
    })
  }

  private colorSwatchHtml(
    kind: 'color' | 'neon',
    value: number,
    selected: number,
  ): string {
    if (value < 0) {
      const active = selected < 0 ? 'active' : ''
      return `<button type="button" class="color-swatch color-swatch-none ${active}" data-${kind}="${value}" aria-label="none"></button>`
    }
    const hex = '#' + value.toString(16).padStart(6, '0')
    const active = value === selected ? 'active' : ''
    return `<button type="button" class="color-swatch ${active}" data-${kind}="${value}" style="--swatch:${hex}" aria-label="${hex}"></button>`
  }

  private onlineBlock(): string {
    return `
      <section class="menu-section">
        <h2>${t('menu.onlineConn')}</h2>
        <p class="tune-rules">
          ${t('menu.onlineHint')} <strong>wss://…</strong>
        </p>
        <label class="tune-row">
          <span class="tune-label">${t('menu.publicWs')}</span>
          <input class="text-input" id="public-ws" placeholder="wss://xxxx.trycloudflare.com" value="${this.escape(this.publicWsUrl)}" />
        </label>
        <label class="tune-row" style="margin-top:10px">
          <span class="tune-label">${t('menu.roomCode')}</span>
          <input class="text-input" id="join-code" maxlength="8" placeholder="${t('menu.roomCodePh')}" value="${this.escape(this.joinCode)}" />
        </label>
      </section>
    `
  }

  private renderLobby(wm: string): void {
    const room = this.lobby!
    const selfPlayer =
      (this.localNetId && room.players.find((p) => p.id === this.localNetId)) ||
      room.players.find((p) => p.name === this.playerName) ||
      null
    const amReady = !!selfPlayer?.ready
    const allReady = room.players.length > 0 && room.players.every((p) => p.ready)
    const track = TRACKS.find((tr) => tr.id === room.trackId)
    const trackLabel = track ? this.trackName(track) : room.trackId
    const players = room.players
      .map((p) => {
        const tags = [
          p.id === room.hostId ? t('menu.host') : '',
          p.ready ? t('menu.onlineReady') : t('menu.onlineNotReady'),
        ]
          .filter(Boolean)
          .join(' · ')
        return `<li class="${p.ready ? 'is-ready' : ''}"><strong>${this.escape(p.name)}</strong> <span>${tags}</span></li>`
      })
      .join('')
    this.root.innerHTML = `
      ${wm}
      ${this.muteBar()}
      <div class="menu-shell menu-panel">
        <p class="menu-sub">${t('menu.room')} ${room.code} · ${room.players.length}/${room.maxPlayers || 4} ${t('menu.playersOf')} · ${this.escape(trackLabel)} · ${room.laps} ${t('menu.onlineLaps').toLowerCase()}</p>
        <section class="menu-section">
          <h2>${t('menu.players')}</h2>
          <ol class="lobby-list">${players}</ol>
        </section>
        ${
          this.isHost
            ? `<section class="menu-section">
            <h2>${t('menu.onlineLaps')}</h2>
            <div class="dir-grid">
              ${[1, 2, 3, 4, 5]
                .map(
                  (n) =>
                    `<button type="button" class="track-card ${n === room.laps ? 'active' : ''}" data-lobby-laps="${n}"><strong>${n}</strong></button>`,
                )
                .join('')}
            </div>
            <p class="tune-rules" style="margin-top:10px">${t('menu.track')}</p>
            <div class="dir-grid online-track-pick">
              ${TRACKS.filter((tr) => !tr.sandbox)
                .slice(0, 8)
                .map((tr) => {
                  const active = tr.id === room.trackId ? 'active' : ''
                  return `<button type="button" class="track-card ${active}" data-lobby-track="${tr.id}">
                    <strong>${this.escape(this.trackName(tr))}</strong>
                  </button>`
                })
                .join('')}
            </div>
            <section class="menu-section" style="margin-top:12px">
              <h2>${t('menu.friendLink')}</h2>
              <input class="text-input" id="lobby-link" readonly value="${this.escape(this.lobbyLink)}" />
              <button type="button" class="btn-ghost" id="btn-copy" style="margin-top:10px">${t('menu.copyLink')}</button>
            </section>
          </section>`
            : `<p class="tune-rules">${t('menu.waitHost')}</p>`
        }
        <button type="button" class="menu-start ${amReady ? 'is-ready-btn' : ''}" id="btn-ready">
          ${amReady ? t('menu.onlineReady') : t('menu.onlineNotReady')} — ${t('menu.onlineReady')}
        </button>
        ${
          this.isHost
            ? `<button type="button" class="menu-start" id="btn-race" ${allReady ? '' : 'disabled'} style="margin-top:8px">${t('menu.lobbyStart')}</button>
               ${allReady ? '' : `<p class="tune-rules">${t('menu.onlineStartNeedReady')}</p>`}`
            : ''
        }
        <button type="button" class="btn-ghost" id="btn-leave" style="margin-top:12px">${t('menu.leaveLobby')}</button>
        ${this.lobbyError ? `<p class="menu-error">${this.escape(this.lobbyError)}</p>` : ''}
      </div>
    `
    this.bindMuteBar()
    this.root.querySelector('#btn-copy')?.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(this.lobbyLink)
      } catch {
        /* ignore */
      }
    })
    this.root.querySelector('#btn-ready')?.addEventListener('click', () => {
      this.onReadyToggle?.(!amReady)
    })
    this.root.querySelectorAll<HTMLButtonElement>('[data-lobby-laps]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.onLobbyLaps?.(Number(btn.dataset.lobbyLaps) || 2)
      })
    })
    this.root.querySelectorAll<HTMLButtonElement>('[data-lobby-track]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.lobbyTrack
        if (id) this.onLobbyTrack?.(id)
      })
    })
    this.root.querySelector('#btn-race')?.addEventListener('click', () => {
      if (!allReady) return
      this.onHostStart?.()
    })
    this.root.querySelector('#btn-leave')?.addEventListener('click', () => this.onLeaveLobby?.())
  }

  private bindTracks(): void {
    this.root.querySelectorAll<HTMLButtonElement>('[data-track]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.selectedTrackId = btn.dataset.track || TRACKS[0].id
        this.render()
      })
    })
  }

  private bindTuning(): void {
    this.root.querySelectorAll<HTMLInputElement>('input[data-tune]').forEach((input) => {
      input.addEventListener('input', () => {
        const key = input.dataset.tune as keyof PlayerTuningValues
        this.tuning = setTuningStat(this.tuning, key, Number(input.value))
        this.syncSliders()
        const hint = this.root.querySelector('#tune-hint')
        if (hint) hint.textContent = tuningHint(this.tuning)
        const pill = this.root.querySelector('.budget-pill')
        if (pill) pill.textContent = `${tuningSum(this.tuning)} / ${TUNING_BUDGET} ${t('menu.points')}`
      })
    })
  }

  private readFields(): void {
    const name = this.root.querySelector<HTMLInputElement>('#player-name')
    if (name) this.playerName = name.value.trim() || t('menu.defaultName')
    const ws = this.root.querySelector<HTMLInputElement>('#public-ws')
    if (ws) this.publicWsUrl = ws.value.trim()
    const code = this.root.querySelector<HTMLInputElement>('#join-code')
    if (code) this.joinCode = code.value.trim().toUpperCase()
  }

  private syncSliders(): void {
    for (const key of Object.keys(this.tuning) as (keyof PlayerTuningValues)[]) {
      const input = this.root.querySelector<HTMLInputElement>(`input[data-tune="${key}"]`)
      if (!input) continue
      input.value = String(this.tuning[key])
      const val = input.parentElement?.querySelector('.tune-val')
      if (val) val.textContent = String(this.tuning[key])
    }
  }

  private trackCard(tr: TrackDef): string {
    const active = tr.id === this.selectedTrackId ? 'active' : ''
    const blurbKey = `track.${tr.id}.blurb`
    const blurb = t(blurbKey)
    return `
      <button type="button" class="track-card ${active}" data-track="${tr.id}">
        <strong>${this.escape(this.trackName(tr))}</strong>
        <span>${blurb === blurbKey ? tr.blurb : blurb}</span>
        ${tr.sandbox ? `<span class="track-card-est">${t('menu.sandboxTag')}</span>` : ''}
        ${tr.id === 'kasarny' ? `<span class="track-card-est">${t('menu.skateTag')}</span>` : ''}
      </button>
    `
  }

  private trackName(tr: TrackDef): string {
    const key = `track.${tr.id}.name`
    const named = t(key)
    return named === key ? tr.name : named
  }

  private trackBlurb(tr: TrackDef): string {
    const key = `track.${tr.id}.blurb`
    const blurb = t(key)
    return blurb === key ? tr.blurb : blurb
  }

  private vehicleHelp(kind: VehicleKind): string {
    const key = `hud.help.${kind}`
    const text = t(key)
    return (text === key ? t('hud.help') : text).replaceAll('\n', '<br/>')
  }

  private slider(key: keyof PlayerTuningValues, label: string, value: number): string {
    return `
      <label class="tune-row">
        <span class="tune-label">${label} <span class="tune-val">${value}</span></span>
        <input type="range" min="0" max="100" value="${value}" data-tune="${key}" />
        <p class="tune-help">${t(`menu.${key}.help`)}</p>
      </label>
    `
  }

  private audioSlider(
    key: 'master' | 'music' | 'sfx' | 'menu',
    label: string,
    value: number,
  ): string {
    return `
      <label class="tune-row">
        <span class="tune-label">${label} <span class="tune-val" data-aval="${key}">${value}</span></span>
        <input type="range" min="0" max="100" value="${value}" data-audio="${key}" />
      </label>
    `
  }

  private bindAudio(): void {
    this.audioApi?.unlock()
    this.root.querySelectorAll<HTMLInputElement>('input[data-audio]').forEach((input) => {
      input.addEventListener('input', () => {
        const key = input.dataset.audio as 'master' | 'music' | 'sfx' | 'menu'
        const value = Number(input.value)
        this.audioApi?.set({ [key]: value })
        const label = this.root.querySelector(`[data-aval="${key}"]`)
        if (label) label.textContent = String(value)
        if (key === 'menu') this.audioApi?.playClick?.()
      })
    })
    this.root.querySelectorAll<HTMLButtonElement>('[data-music]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.audioApi?.playClick?.()
        const track = (btn.dataset.music as MusicId) || 'techno'
        this.audioApi?.set({ track })
        this.render()
      })
    })
  }

  private bindControlFeel(): void {
    const sens = this.root.querySelector<HTMLInputElement>('[data-feel-sens]')
    sens?.addEventListener('input', () => {
      const pct = Number(sens.value)
      if (!Number.isFinite(pct)) return
      this.controlFeelApi?.set({ steerSens: pct / 100 })
      const val = this.root.querySelector('[data-feel-sens-val]')
      if (val) val.textContent = `${Math.round(pct)}%`
    })
    const hud = this.root.querySelector<HTMLInputElement>('[data-feel-hud]')
    hud?.addEventListener('input', () => {
      const pct = Number(hud.value)
      if (!Number.isFinite(pct)) return
      this.controlFeelApi?.set({ hudScale: pct / 100 })
      const val = this.root.querySelector('[data-feel-hud-val]')
      if (val) val.textContent = `${Math.round(pct)}%`
    })
    this.root.querySelector<HTMLButtonElement>('[data-feel-invert]')?.addEventListener('click', () => {
      const cur = this.controlFeelApi?.get() ?? DEFAULT_CONTROL_FEEL
      this.controlFeelApi?.set({ invertSteer: !cur.invertSteer })
      this.render()
    })
    this.root
      .querySelector<HTMLButtonElement>('[data-feel-stability]')
      ?.addEventListener('click', () => {
        const cur = this.controlFeelApi?.get() ?? DEFAULT_CONTROL_FEEL
        this.controlFeelApi?.set({ stabilityAssist: !cur.stabilityAssist })
        this.render()
      })
    this.root.querySelector<HTMLButtonElement>('[data-feel-drift]')?.addEventListener('click', () => {
      const cur = this.controlFeelApi?.get() ?? DEFAULT_CONTROL_FEEL
      this.controlFeelApi?.set({ driftMode: !cur.driftMode })
      this.render()
    })
    this.root.querySelector<HTMLButtonElement>('[data-feel-skip-cd]')?.addEventListener('click', () => {
      const cur = this.raceApi?.get() ?? DEFAULT_RACE
      this.raceApi?.set({ skipCountdown: !cur.skipCountdown })
      this.render()
    })
    this.root.querySelectorAll<HTMLButtonElement>('[data-feel-cam]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const cam = btn.dataset.feelCam as CamFollow
        if (cam !== 'soft' && cam !== 'normal' && cam !== 'tight') return
        this.controlFeelApi?.set({ camFollow: cam })
        this.render()
      })
    })
    this.root.querySelectorAll<HTMLButtonElement>('[data-mobile-scheme]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const scheme = btn.dataset.mobileScheme as MobileDriveScheme
        if (!MOBILE_DRIVE_SCHEMES.includes(scheme)) return
        this.controlFeelApi?.set({ mobileScheme: scheme })
        this.render()
      })
    })
  }

  private bindVisual(): void {
    this.root.querySelectorAll<HTMLButtonElement>('[data-visual-q]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.audioApi?.playClick?.()
        const q = btn.dataset.visualQ as VisualQuality
        if (!VISUAL_QUALITIES.includes(q)) return
        this.visualApi?.set({ quality: q })
        this.render()
      })
    })
    this.root.querySelector<HTMLButtonElement>('[data-visual-bloom]')?.addEventListener('click', () => {
      this.audioApi?.playClick?.()
      const cur = this.visualApi?.get() ?? DEFAULT_VISUAL
      this.visualApi?.set({ bloom: !cur.bloom })
      this.render()
    })
    this.root.querySelector<HTMLButtonElement>('[data-visual-shadows]')?.addEventListener('click', () => {
      this.audioApi?.playClick?.()
      const cur = this.visualApi?.get() ?? DEFAULT_VISUAL
      this.visualApi?.set({ shadows: !cur.shadows })
      this.render()
    })
    this.root.querySelector<HTMLButtonElement>('[data-visual-mirror]')?.addEventListener('click', () => {
      this.audioApi?.playClick?.()
      const cur = this.visualApi?.get() ?? DEFAULT_VISUAL
      this.visualApi?.set({ rearMirror: !cur.rearMirror })
      this.render()
    })
  }

  private bindAtmosphere(): void {
    const lightInput = this.root.querySelector<HTMLInputElement>('[data-atm-light]')
    lightInput?.addEventListener('input', () => {
      const light = lightFromIndex(Number(lightInput.value))
      this.atmosphereApi?.set({ light })
      const label = this.root.querySelector('[data-atm-light-val]')
      if (label) label.textContent = t(`menu.atmLight.${light}`)
    })
    const fogInput = this.root.querySelector<HTMLInputElement>('[data-atm-fog]')
    fogInput?.addEventListener('input', () => {
      const fog = fogFromIndex(Number(fogInput.value))
      this.atmosphereApi?.set({ fog })
      const label = this.root.querySelector('[data-atm-fog-val]')
      if (label) label.textContent = t(`menu.atmFog.${fog}`)
    })
    const decorInput = this.root.querySelector<HTMLInputElement>('[data-atm-decor]')
    decorInput?.addEventListener('input', () => {
      const decor = decorFromIndex(Number(decorInput.value))
      this.atmosphereApi?.set({ decor })
      const label = this.root.querySelector('[data-atm-decor-val]')
      if (label) label.textContent = t(`menu.atmDecor.${decor}`)
    })
    this.root.querySelectorAll<HTMLButtonElement>('[data-tone]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.audioApi?.playClick?.()
        const tone = btn.dataset.tone as MenuTone
        const ok: MenuTone[] = [
          'klecany',
          'cesko',
          'neon',
          'ember',
          'ice',
          'moss',
          'asphalt',
          'calendar',
        ]
        if (!ok.includes(tone)) return
        if (tone !== 'calendar') this.calendarPackOpen = false
        this.atmosphereApi?.set({ tone })
        this.render()
      })
    })
    this.root.querySelector<HTMLButtonElement>('[data-calendar-gear]')?.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      this.audioApi?.playClick?.()
      this.atmosphereApi?.set({ tone: 'calendar' })
      this.calendarPackOpen = !this.calendarPackOpen
      this.render()
    })
    this.root.querySelectorAll<HTMLButtonElement>('[data-calendar-pack]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.audioApi?.playClick?.()
        const pack = btn.dataset.calendarPack as CalendarPack
        if (!CALENDAR_PACKS.includes(pack)) return
        this.atmosphereApi?.set({ tone: 'calendar', calendarPack: pack })
        this.render()
      })
    })
  }

  private bindAiLearn(): void {
    this.root.querySelector<HTMLButtonElement>('[data-learn-enabled]')?.addEventListener('click', () => {
      const cur = loadLearnSettings()
      saveLearnSettings({ ...cur, enabled: !cur.enabled })
      this.render()
    })
    this.root.querySelector<HTMLButtonElement>('[data-learn-apply]')?.addEventListener('click', () => {
      const cur = loadLearnSettings()
      saveLearnSettings({ ...cur, applyToAi: !cur.applyToAi })
      this.render()
    })
    this.root.querySelector<HTMLButtonElement>('[data-learn-export]')?.addEventListener('click', () => {
      const json = exportCommunityBundle()
      const box = this.root.querySelector<HTMLTextAreaElement>('[data-learn-box]')
      const status = this.root.querySelector<HTMLElement>('[data-learn-status]')
      if (box) {
        box.value = json
        box.focus()
        box.select()
      }
      void navigator.clipboard.writeText(json).catch(() => {})
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'community-learn.json'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      if (status) status.textContent = t('menu.aiLearnExported')
    })
    const fileInput = this.root.querySelector<HTMLInputElement>('[data-learn-file]')
    this.root.querySelector<HTMLButtonElement>('[data-learn-import]')?.addEventListener('click', () => {
      fileInput?.click()
    })
    fileInput?.addEventListener('change', () => {
      const file = fileInput.files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = () => {
        const text = String(reader.result || '')
        const res = importCommunityBundle(text)
        const status = this.root.querySelector<HTMLElement>('[data-learn-status]')
        if (status) {
          status.textContent = res.ok
            ? t('menu.aiLearnImported', { n: res.added })
            : t('menu.aiLearnImportFail')
        }
        this.render()
      }
      reader.readAsText(file)
      fileInput.value = ''
    })
  }

  /** Bez konzole: box + clipboard + soubor + Vite ingest. */
  private async exportPaceCalibration(): Promise<void> {
    const status = this.root.querySelector<HTMLElement>('[data-pace-status]')
    const box = this.root.querySelector<HTMLTextAreaElement>('[data-pace-box]')
    const samples = getPaceSamples()
    const records = allRecords()
    const payload = {
      samples,
      records: records.map((e) => ({
        trackId: e.trackId,
        vehicle: e.vehicle,
        bestTimeMs: e.bestTimeMs,
        player: e.player,
        at: e.at,
      })),
      rawPace: exportPaceJson(),
    }
    const json = JSON.stringify(payload, null, 2)
    if (box) {
      box.value = json
      box.focus()
      box.select()
    }
    if (samples.length === 0 && records.length === 0) {
      if (status) status.textContent = t('menu.paceExportEmpty')
      return
    }
    try {
      await navigator.clipboard.writeText(json)
    } catch {
      /* ignore */
    }
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'pace-cal.json'
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
    const pushed = await pushPaceToWorkspace().catch(() => false)
    // I když pace samples chybí, pošli celý payload
    if (!pushed) {
      await fetch('/__klec-pace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: json,
      }).catch(() => null)
    }
    if (status) {
      status.textContent = t('menu.paceExportReady', {
        n: samples.length,
        r: records.length,
      })
    }
  }

  private trackLabel(): string {
    const tr = TRACKS.find((t) => t.id === this.selectedTrackId)
    return tr ? this.trackName(tr) : '—'
  }

  private vehicleLabel(kind: VehicleKind): string {
    return t(`vehicle.${kind}`)
  }

  private diffLabel(): string {
    return t(`diff.${this.selectedDifficulty}`)
  }

  private escape(s: string): string {
    return s
      .replaceAll('&', '&amp;')
      .replaceAll('"', '&quot;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
  }
}

function fmtMs(ms: number): string {
  if (!(ms > 0)) return '—'
  const s = Math.round(ms / 1000)
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${r.toString().padStart(2, '0')}`
}
