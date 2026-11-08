import { DIFFICULTIES, type DifficultyId } from '../ai/Difficulty'
import { bindMuteToggle, muteToggleHtml, t } from '../i18n/i18n'
import {
  applyWatermarkTo,
  pickWatermarkTrack,
  trackPreviewHtml,
  trackWatermarkHtml,
} from './TrackWatermark'
import { VehiclePreview } from './VehiclePreview'
import {
  FREESTYLE_VEHICLE_KINDS,
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
  menuArtForTone,
  type AtmosphereSettingsValues,
  type CalendarPack,
  type DecorLevel,
  type FogLevel,
  type LightLevel,
  type MenuTone,
} from '../render/AtmosphereSettings'
import { brandLockupHtml } from './Brand'
import {
  DEFAULT_CONTROL_FEEL,
  type CamFollow,
  type ControlFeelValues,
} from '../input/ControlFeel'
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

type RaceModeId = 'classic' | 'freestyle' | 'online'

export type MenuAudioApi = {
  get: () => AudioSettingsValues
  set: (partial: Partial<AudioSettingsValues>) => void
  unlock: () => void
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
  private raceApi: MenuRaceApi | null = null
  private controlFeelApi: MenuControlFeelApi | null = null
  private watermarkTrackId = TRACKS[0]!.id
  private recentWatermarkIds: string[] = []
  private watermarkTimer: number | null = null
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

  private settingsEscHint(): string {
    return `<p class="menu-esc-hint">${t('menu.escBack')}</p>`
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
          <p class="burnt-letter-body">${t('menu.thanksBody')}</p>
          <p class="burnt-letter-lorem">${t('menu.thanksLorem')}</p>
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
    if (this.screen === 'vehicles' && this.selectedVehicle === 'scooter') {
      if (!this.tryLeaveScooter()) return 'stay'
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
    this.watermarkTimer = window.setInterval(() => {
      const next = pickWatermarkTrack(this.recentWatermarkIds.slice(-2))
      this.watermarkTrackId = next.id
      this.recentWatermarkIds = [...this.recentWatermarkIds, next.id].slice(-2)
      const el = this.root.querySelector('.track-watermark')
      if (!el) return
      el.classList.add('is-swap')
      window.setTimeout(() => {
        applyWatermarkTo(el, next)
        el.classList.remove('is-swap')
      }, fadeMs / 2)
    }, holdMs)
  }

  private stopWatermarkRotation(): void {
    if (this.watermarkTimer !== null) {
      window.clearInterval(this.watermarkTimer)
      this.watermarkTimer = null
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
            <button type="button" class="gta-tile gta-tile-plain" data-go="records">
              <strong class="gta-tile-label">${t('menu.leaderboard')}</strong>
            </button>
            <button type="button" class="gta-tile gta-tile-plain" data-go="settings">
              <strong class="gta-tile-label">${t('menu.settings')}</strong>
            </button>
          </div>
          <p class="tune-rules home-status">
            ${t('menu.statusTrack')}: <strong>${this.escape(this.trackLabel())}</strong>
            · ${t('menu.statusVehicle')}: <strong>${this.vehicleLabel(this.selectedVehicle)}</strong>
            · ${t('menu.statusDiff')} <strong>${this.diffLabel()}</strong>
            · ${t('menu.statusTuning')} ${tuningSum(this.tuning)}/${TUNING_BUDGET}
          </p>
          <p class="menu-esc-hint">${t('menu.escHint')}</p>
        </div>
      `
      this.bindMuteBar()
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
      const modes: { id: RaceModeId; title: string; blurb: string; online?: boolean }[] = [
        { id: 'classic', title: t('menu.raceClassic'), blurb: t('menu.raceClassicBlurb') },
        { id: 'freestyle', title: t('menu.raceFreestyle'), blurb: t('menu.raceFreestyleBlurb') },
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
          <header class="menu-header">
            <p class="menu-eyebrow">${t('menu.raceModeEyebrow')}</p>
            <h1>${t('menu.raceModeTitle')}</h1>
          </header>
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
          <button type="button" class="btn-ghost" data-back style="margin-top:14px">${t('menu.back')}</button>
        </div>
      `
      this.bindMuteBar()
      const fill = this.root.querySelector<HTMLElement>('[data-hold-fill]')
      const holdTrack = this.root.querySelector<HTMLElement>('.hold-track')
      const titleEl = this.root.querySelector<HTMLElement>('[data-race-title]')
      const blurbEl = this.root.querySelector<HTMLElement>('[data-race-blurb]')
      const hintEl = this.root.querySelector<HTMLElement>('[data-race-hint]')
      const setPick = (id: RaceModeId) => {
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
      this.bindBack('home')
      return
    }

    if (this.screen === 'tracks') {
      const selected = TRACKS.find((tr) => tr.id === this.selectedTrackId) ?? TRACKS[0]
      const race = this.raceApi?.get() ?? { ...DEFAULT_RACE }
      this.root.innerHTML = `
        ${wm}
        ${this.muteBar()}
        <div class="menu-shell menu-panel">
          <header class="menu-header">
            <p class="menu-eyebrow">${t('menu.tracksEyebrow')}</p>
            <h1>${t('menu.tracksTitle')}</h1>
          </header>
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
          <button type="button" class="btn-ghost" data-back style="margin-top:14px">${t('menu.back')}</button>
        </div>
      `
      this.bindMuteBar()
      this.bindTracks()
      this.root.querySelectorAll<HTMLButtonElement>('[data-reverse]').forEach((btn) => {
        btn.addEventListener('click', () => {
          this.raceApi?.set({ reverse: btn.dataset.reverse === '1' })
          this.render()
        })
      })
      this.bindBack('home')
      return
    }

    if (this.screen === 'vehicles') {
      const kind = this.selectedVehicle
      this.root.innerHTML = `
        ${wm}
        ${this.muteBar()}
        <div class="menu-shell menu-panel">
          <header class="menu-header">
            <p class="menu-eyebrow">${t('menu.vehiclesEyebrow')}</p>
            <h1>${t('menu.vehiclesTitle')}</h1>
          </header>
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
              <p class="vehicle-lore">${t(`vehicle.${kind}.invented`)}</p>
              <p class="vehicle-lore">${t(`vehicle.${kind}.first`)}</p>
              <p class="tune-rules">${t('menu.vehicleControls')}</p>
              <p class="vehicle-lore vehicle-controls">${this.vehicleHelp(kind)}</p>
            </div>
          </div>
          <button type="button" class="menu-start" data-go-tuning style="margin-top:14px">${t('menu.tuning')}</button>
          <button type="button" class="btn-ghost" data-back style="margin-top:8px">${t('menu.back')}</button>
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
      this.root.querySelector('[data-scooter-ok]')?.addEventListener('click', () => {
        this.scooterPopup = null
        if (this.scooterForceSkate || this.scooterLeaveAttempts >= SCOOTER_INSULT_MAX) {
          this.selectedVehicle = 'skate'
          this.clearScooterTrap()
        }
        this.render()
      })
      this.root.querySelector('[data-go-tuning]')?.addEventListener('click', () => {
        if (this.selectedVehicle === 'scooter' && !this.tryLeaveScooter()) return
        this.screen = 'tuning'
        this.render()
      })
      this.root.querySelectorAll<HTMLButtonElement>('[data-vehicle]').forEach((btn) => {
        btn.addEventListener('click', () => {
          this.selectedVehicle = (btn.dataset.vehicle as VehicleKind) || 'street'
          if (this.selectedVehicle !== 'scooter') this.clearScooterTrap()
          const race = this.raceApi?.get()
          if (race && this.selectedVehicle !== 'scooter') {
            this.raceApi?.set({
              opponents: clampOpponentsToCategory(
                race.opponents,
                this.selectedVehicle,
                race.freestyle,
              ),
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
      const syncNeonActive = () => {
        this.root.querySelectorAll<HTMLButtonElement>('[data-neon]').forEach((b) => {
          b.classList.toggle('active', Number(b.dataset.neon) === this.selectedNeon)
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
      this.root.querySelector<HTMLInputElement>('#color-rgb')?.addEventListener('input', (e) => {
        const el = e.target as HTMLInputElement
        this.selectedColor = parseInt(el.value.slice(1), 16)
        this.vehiclePreview?.setColor(this.selectedColor)
        syncColorActive()
      })
      this.root.querySelector<HTMLInputElement>('#neon-rgb')?.addEventListener('input', (e) => {
        const el = e.target as HTMLInputElement
        this.selectedNeon = parseInt(el.value.slice(1), 16)
        this.vehiclePreview?.setNeon(this.selectedNeon)
        syncNeonActive()
      })
      this.root.querySelector('[data-back]')?.addEventListener('click', () => {
        if (!this.tryLeaveScooter()) return
        this.screen = 'home'
        this.render()
      })
      const canvas = this.root.querySelector<HTMLCanvasElement>('#vehicle-preview')
      if (canvas) {
        this.vehiclePreview = new VehiclePreview(canvas)
        this.vehiclePreview.setVehicle(kind, this.selectedColor, this.selectedNeon)
      }
      return
    }

    if (this.screen === 'tuning') {
      const used = tuningSum(this.tuning)
      this.root.innerHTML = `
        ${wm}
        ${this.muteBar()}
        <div class="menu-shell menu-panel menu-tuning">
          <header class="menu-header">
            <p class="menu-eyebrow">${t('menu.tuningEyebrow')}</p>
            <h1>${t('menu.tuningTitle')}</h1>
            <p class="menu-sub">${t('menu.budget')} <span class="budget-pill">${used} / ${TUNING_BUDGET} ${t('menu.points')}</span></p>
          </header>
          <div class="tuning-center">
            <p class="tune-rules">${t('menu.tuneRules')}</p>
            <div class="tune-stack">
              ${TUNE_KEYS.map((key) => this.slider(key, t(`menu.${key}`), this.tuning[key])).join('')}
            </div>
            <p class="tune-hint" id="tune-hint">${tuningHint(this.tuning)}</p>
            <button type="button" class="btn-ghost" data-back style="margin-top:14px">${t('menu.back')}</button>
          </div>
        </div>
      `
      this.bindMuteBar()
      this.bindTuning()
      this.bindBack('vehicles')
      return
    }

    if (this.screen === 'settings') {
      this.root.innerHTML = `
        ${wm}
        ${this.muteBar()}
        <div class="menu-shell menu-panel">
          <header class="menu-header">
            <p class="menu-eyebrow">${t('menu.settingsEyebrow')}</p>
            <h1>${t('menu.settingsTitle')}</h1>
          </header>
          <div class="home-actions">
            <button type="button" class="btn-ghost home-panel" data-go="audio">${t('menu.settingsAudio')}</button>
            <button type="button" class="btn-ghost home-panel" data-go="atmosphere">${t('menu.settingsAtmosphere')}</button>
            <button type="button" class="btn-ghost home-panel" data-go="difficulty">${t('menu.difficulty')}</button>
            <button type="button" class="btn-ghost home-panel" data-go="competitions">${t('menu.settingsCompetitions')}</button>
            <button type="button" class="btn-ghost home-panel" data-go="controls">${t('menu.settingsControls')}</button>
            ${
              isMobileClient()
                ? ''
                : `<button type="button" class="btn-ghost home-panel" data-go="manual">${t('menu.settingsManual')}</button>`
            }
          </div>
          ${this.settingsEscHint()}
        </div>
        ${this.settingsThanks()}
      `
      this.bindMuteBar()
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
      this.root.innerHTML = `
        ${wm}
        ${this.muteBar()}
        <div class="menu-shell menu-panel">
          <header class="menu-header">
            <p class="menu-eyebrow">${t('menu.compEyebrow')}</p>
            <h1>${t('menu.compTitle')}</h1>
          </header>
          <p class="tune-rules">${t('menu.compBlurb')}</p>
          <div class="track-grid">
            ${COMPETITIONS.map((c) => {
              const active = c.id === cur ? 'active' : ''
              return `<button type="button" class="track-card ${active}" data-comp="${c.id}">
                <strong>${t(`comp.${c.id}`)}</strong>
                <span>${t(`comp.${c.id}.blurb`)}</span>
              </button>`
            }).join('')}
          </div>
          ${this.settingsEscHint()}
        </div>
      `
      this.bindMuteBar()
      this.root.querySelectorAll<HTMLButtonElement>('[data-comp]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = (btn.dataset.comp || 'none') as CompetitionId
          this.competition = { id }
          saveCompetitionSettings(this.competition)
          this.render()
        })
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
      this.root.innerHTML = `
        ${wm}
        ${this.muteBar()}
        <div class="menu-shell menu-panel menu-controls">
          <header class="menu-header">
            <p class="menu-eyebrow">${t('menu.ctrlEyebrow')}</p>
            <h1>${t('menu.ctrlTitle')}</h1>
          </header>
          <p class="tune-rules">${t('menu.ctrlBlurb')}</p>
          <div class="ctrl-overview" aria-label="${t('menu.ctrlTitle')}">
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
          </div>
          <div class="bind-list">
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
            </div>
            <button type="button" class="btn-ghost" data-reset-binds style="margin-top:6px">${t('menu.ctrlReset')}</button>
            ${this.settingsEscHint()}
          </div>
        </div>
      `
      this.bindMuteBar()
      this.bindControlFeel()
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
          <header class="menu-header">
            <p class="menu-eyebrow">${t('menu.recEyebrow')}</p>
            <h1>${t('menu.leaderboard')}</h1>
          </header>
          <p class="tune-rules">${t('menu.lbBlurb')}</p>
          <div class="lb-tabs">${tabs}</div>
          <ol class="records-list lb-list">${rows || `<li>${t('menu.recEmpty')}</li>`}</ol>
          <button type="button" class="btn-ghost" data-back style="margin-top:14px">${t('menu.back')}</button>
        </div>
      `
      this.bindMuteBar()
      this.root.querySelectorAll<HTMLButtonElement>('[data-lb]').forEach((btn) => {
        btn.addEventListener('click', () => {
          this.lbTrackId = btn.dataset.lb || ''
          this.render()
        })
      })
      this.bindBack(this.recordsBack)
      return
    }

    if (this.screen === 'manual') {
      if (isMobileClient()) {
        this.screen = 'settings'
        this.render()
        return
      }
      const race = this.raceApi?.get() ?? { ...DEFAULT_RACE }
      const tx = race.transmission
      this.root.innerHTML = `
        ${wm}
        ${this.muteBar()}
        <div class="menu-shell menu-panel">
          <header class="menu-header">
            <p class="menu-eyebrow">${t('menu.manualEyebrow')}</p>
            <h1>${t('menu.manualTitle')}</h1>
          </header>
          <p class="tune-rules">${t('menu.manualBlurb')}</p>
          <div class="manual-grid">
            <button type="button" class="track-card ${tx === 'auto' ? 'active' : ''}" data-tx="auto">
              <strong>${t('menu.manual.off')}</strong>
              <span>${t('menu.manual.offBlurb')}</span>
              <em class="manual-hist">${t('menu.manual.offHist')}</em>
            </button>
            <button type="button" class="track-card ${tx === 'manual' ? 'active' : ''}" data-tx="manual">
              <strong>${t('menu.manual.on')}</strong>
              <span>${t('menu.manual.onBlurb')}</span>
              <em class="manual-hist">${t('menu.manual.onHist')}</em>
            </button>
            <button type="button" class="track-card track-card-wide ${tx === 'clutch' ? 'active' : ''}" data-tx="clutch">
              <strong>${t('menu.manual.clutch')}</strong>
              <span>${t('menu.manual.clutchBlurb')}</span>
              <em class="manual-hist">${t('menu.manual.clutchHist')}</em>
            </button>
          </div>
          ${this.settingsEscHint()}
        </div>
      `
      this.bindMuteBar()
      this.root.querySelectorAll<HTMLButtonElement>('[data-tx]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const mode = btn.dataset.tx
          if (mode !== 'auto' && mode !== 'manual' && mode !== 'clutch') return
          this.raceApi?.set({ transmission: mode })
          this.render()
        })
      })
      return
    }

    if (this.screen === 'difficulty') {
      const race = this.raceApi?.get() ?? { ...DEFAULT_RACE }
      const pool = soloCategoryPool(this.selectedVehicle, race.freestyle)
      const opp = clampOpponentsToCategory(race.opponents, this.selectedVehicle, race.freestyle)
      if (
        opp[0] !== race.opponents[0] ||
        opp[1] !== race.opponents[1] ||
        opp[2] !== race.opponents[2]
      ) {
        this.raceApi?.set({ opponents: opp })
      }
      this.root.innerHTML = `
        ${wm}
        ${this.muteBar()}
        <div class="menu-shell menu-panel">
          <header class="menu-header">
            <p class="menu-eyebrow">${t('menu.diffEyebrow')}</p>
            <h1>${t('menu.diffTitle')}</h1>
          </header>
          <div class="track-grid">
            ${DIFFICULTIES.map((d) => {
              const active = d.id === this.selectedDifficulty ? 'active' : ''
              const blurbKey = `diff.${d.id}Blurb`
              const blurb = t(blurbKey)
              return `<button type="button" class="track-card ${active}" data-diff="${d.id}">
                <strong>${t(`diff.${d.id}`)}</strong>
                <span>${blurb === blurbKey ? d.blurb : blurb}</span>
              </button>`
            }).join('')}
          </div>
          <p class="tune-rules" style="margin-top:16px">${t('menu.opponents')}</p>
          <p class="tune-help">${t('menu.opponentsBlurb')}</p>
          ${[0, 1, 2]
            .map((slot) => {
              const cur = opp[slot]!
              return `<div class="opp-row">
                <span class="opp-label">${t('menu.opponent')} ${slot + 1}</span>
                <div class="opp-picks">
                  ${pool
                    .map((k) => {
                      const active = k === cur ? 'active' : ''
                      return `<button type="button" class="track-card opp-card ${active}" data-opp-slot="${slot}" data-opp-kind="${k}">
                      <strong>${this.vehicleLabel(k)}</strong>
                    </button>`
                    })
                    .join('')}
                </div>
              </div>`
            })
            .join('')}
          <button type="button" class="menu-start" data-opp-random style="margin-top:14px">${t('menu.opponentsRandom')}</button>
          ${this.settingsEscHint()}
        </div>
      `
      this.bindMuteBar()
      this.root.querySelectorAll<HTMLButtonElement>('[data-diff]').forEach((btn) => {
        btn.addEventListener('click', () => {
          this.selectedDifficulty = (btn.dataset.diff as DifficultyId) || 'normal'
          this.render()
        })
      })
      this.root.querySelectorAll<HTMLButtonElement>('[data-opp-slot]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const slot = Number(btn.dataset.oppSlot)
          const kind = btn.dataset.oppKind as VehicleKind
          if (slot < 0 || slot > 2 || !kind || !pool.includes(kind)) return
          const next: [VehicleKind, VehicleKind, VehicleKind] = [...opp]
          next[slot] = kind
          this.raceApi?.set({ opponents: next })
          this.render()
        })
      })
      this.root.querySelector('[data-opp-random]')?.addEventListener('click', () => {
        this.raceApi?.set({
          opponents: randomOpponents(this.selectedVehicle, race.freestyle),
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
          <header class="menu-header">
            <p class="menu-eyebrow">${t('menu.audioEyebrow')}</p>
            <h1>${t('menu.audioTitle')}</h1>
          </header>
          <div class="tune-grid">
            ${this.audioSlider('master', t('menu.audioMaster'), audio.master)}
            ${this.audioSlider('music', t('menu.audioMusic'), audio.music)}
            ${this.audioSlider('sfx', t('menu.audioSfx'), audio.sfx)}
          </div>
          <p class="tune-rules" style="margin-top:16px">${t('menu.audioTrack')}</p>
          <div class="track-grid">
            ${MUSIC_TRACKS.map((m) => {
              const active = m.id === audio.track ? 'active' : ''
              return `<button type="button" class="track-card ${active}" data-music="${m.id}">
                <strong>${t(m.labelKey)}</strong>
              </button>`
            }).join('')}
          </div>
          ${this.settingsEscHint()}
        </div>
      `
      this.bindMuteBar()
      this.bindAudio()
      return
    }

    if (this.screen === 'atmosphere') {
      const atm = this.atmosphereApi?.get() ?? { ...DEFAULT_ATMOSPHERE }
      const fogLevels: FogLevel[] = ['low', 'normal', 'high']
      const decorLevels: DecorLevel[] = ['off', 'simple', 'rich']
      const lightLevels: LightLevel[] = ['dim', 'normal', 'bright', 'night']
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
          <header class="menu-header">
            <p class="menu-eyebrow">${t('menu.atmEyebrow')}</p>
            <h1>${t('menu.atmTitle')}</h1>
          </header>
          <p class="tune-rules">${t('menu.atmTone')}</p>
          <div class="track-grid">
            ${toneCards}
          </div>
          ${calendarPacksHtml}
          <p class="tune-rules" style="margin-top:16px">${t('menu.atmLight')}</p>
          <div class="track-grid">
            ${lightLevels
              .map((l) => {
                const active = l === atm.light ? 'active' : ''
                return `<button type="button" class="track-card ${active}" data-light="${l}">
                  <strong>${t(`menu.atmLight.${l}`)}</strong>
                </button>`
              })
              .join('')}
          </div>
          <p class="tune-rules" style="margin-top:16px">${t('menu.atmFog')}</p>
          <div class="track-grid">
            ${fogLevels
              .map((f) => {
                const active = f === atm.fog ? 'active' : ''
                return `<button type="button" class="track-card ${active}" data-fog="${f}">
                  <strong>${t(`menu.atmFog.${f}`)}</strong>
                </button>`
              })
              .join('')}
          </div>
          <p class="tune-rules" style="margin-top:16px">${t('menu.atmDecor')}</p>
          <div class="track-grid">
            ${decorLevels
              .map((d) => {
                const active = d === atm.decor ? 'active' : ''
                return `<button type="button" class="track-card ${active}" data-decor="${d}">
                  <strong>${t(`menu.atmDecor.${d}`)}</strong>
                </button>`
              })
              .join('')}
          </div>
          ${this.settingsEscHint()}
        </div>
      `
      this.bindMuteBar()
      this.bindAtmosphere()
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
          <header class="menu-header">
            <p class="menu-eyebrow">${t('menu.onlineEyebrow')}</p>
            <h1 class="online-title">${t('menu.onlineTitle')}</h1>
            <p class="menu-sub">${t('menu.onlineSub')}</p>
            <p class="menu-sub online-status">${statusLine}</p>
          </header>
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
          <button type="button" class="btn-ghost" data-back style="margin-top:12px">${t('menu.back')}</button>
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

  private bindBack(to: Screen): void {
    this.root.querySelector('[data-back]')?.addEventListener('click', () => {
      this.screen = to
      this.render()
    })
  }

  private confirmRaceMode(): void {
    const mode = this.raceModePick
    if (mode === 'online') {
      this.screen = 'online'
      this.render()
      this.onBrowseOnline?.()
      return
    }
    if (mode === 'freestyle') {
      this.raceApi?.set({ freestyle: true })
      if (!FREESTYLE_VEHICLE_KINDS.includes(this.selectedVehicle)) {
        this.selectedVehicle = 'skate'
      }
      const race = this.raceApi?.get()
      if (race) {
        this.raceApi?.set({
          opponents: clampOpponentsToCategory(race.opponents, this.selectedVehicle, true),
        })
      }
    } else {
      this.raceApi?.set({ freestyle: false })
      const race = this.raceApi?.get()
      if (race) {
        this.raceApi?.set({
          opponents: clampOpponentsToCategory(race.opponents, this.selectedVehicle, false),
        })
      }
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
        <header class="menu-header">
          <p class="menu-eyebrow">${t('menu.lobbyEyebrow')}</p>
          <h1>${t('menu.room')} ${room.code}</h1>
          <p class="menu-sub">${room.players.length}/${room.maxPlayers || 4} ${t('menu.playersOf')} · ${this.escape(trackLabel)} · ${room.laps} ${t('menu.onlineLaps').toLowerCase()}</p>
        </header>
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
        ${tr.drift ? `<span class="track-card-est">${t('menu.driftTag')}</span>` : ''}
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

  private audioSlider(key: 'master' | 'music' | 'sfx', label: string, value: number): string {
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
        const key = input.dataset.audio as 'master' | 'music' | 'sfx'
        const value = Number(input.value)
        this.audioApi?.set({ [key]: value })
        const label = this.root.querySelector(`[data-aval="${key}"]`)
        if (label) label.textContent = String(value)
      })
    })
    this.root.querySelectorAll<HTMLButtonElement>('[data-music]').forEach((btn) => {
      btn.addEventListener('click', () => {
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
  }

  private bindAtmosphere(): void {
    this.root.querySelectorAll<HTMLButtonElement>('[data-fog]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const fog = btn.dataset.fog as FogLevel
        if (fog !== 'low' && fog !== 'normal' && fog !== 'high') return
        this.atmosphereApi?.set({ fog })
        this.render()
      })
    })
    this.root.querySelectorAll<HTMLButtonElement>('[data-decor]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const decor = btn.dataset.decor as DecorLevel
        if (decor !== 'off' && decor !== 'simple' && decor !== 'rich') return
        this.atmosphereApi?.set({ decor })
        this.render()
      })
    })
    this.root.querySelectorAll<HTMLButtonElement>('[data-light]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const light = btn.dataset.light as LightLevel
        const ok: LightLevel[] = ['dim', 'normal', 'bright', 'night']
        if (!ok.includes(light)) return
        this.atmosphereApi?.set({ light })
        this.render()
      })
    })
    this.root.querySelectorAll<HTMLButtonElement>('[data-tone]').forEach((btn) => {
      btn.addEventListener('click', () => {
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
      this.atmosphereApi?.set({ tone: 'calendar' })
      this.calendarPackOpen = !this.calendarPackOpen
      this.render()
    })
    this.root.querySelectorAll<HTMLButtonElement>('[data-calendar-pack]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const pack = btn.dataset.calendarPack as CalendarPack
        if (!CALENDAR_PACKS.includes(pack)) return
        this.atmosphereApi?.set({ tone: 'calendar', calendarPack: pack })
        this.render()
      })
    })
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
