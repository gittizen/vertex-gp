import { DIFFICULTIES, type DifficultyId } from '../ai/Difficulty'
import { exportPaceJson, getPaceSamples, pushPaceToWorkspace } from '../ai/PaceCalibration'
import {
  ensureChampStartCash,
  getCareer,
  saveCareer,
  startNewSeason,
  championshipRoundMeta,
  championshipProgressLabel,
  championshipRaceLaps,
  championshipTotalRounds,
  championshipTrackId,
  championshipReverse,
  listUnlockOrder,
  starterVehicles,
  buyVehicle,
  canBuy,
  applyTuningUpgrade,
  completeSeasonAndPrepareNext,
  seasonPodiumRank,
  ensureChampRivalMidSpike,
  isChampQualifying,
  isChampFsQual,
  needsChampPostQualSetup,
  championshipQualTrackId,
  markChampSetupComplete,
  assignChampLeague,
  assignChampPlayerName,
  getActiveCareerForBranch,
  wipeBranchCareers,
  CHAMP_RIVAL_NAMES,
  CHAMP_LEAGUES,
  LEAGUE_LAPS,
  CHAMP_FS_QUAL_MS,
  type ChampCareer,
  type ChampLeague,
  type ChampTrackPool,
  type SeasonCompleteInfo,
} from '../race/Championship'
import {
  CHAMP_START_CASH,
  placeCash,
  roundPoints,
  tuningUpgradeCost,
  vehicleBuyPrice,
} from '../race/ChampEconomy'
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
  type TrackDef,
  type VehicleKind,
} from '../track/TrackDefs'
import {
  CHAMP_TUNING_MAX,
  DEFAULT_PLAYER_TUNING,
  TUNING_MAX,
  champTuningToSolo,
  setTuningStat,
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
  champBriefArt,
  champCenaArt,
  champClassArt,
  champStarterVehicleArt,
  champPitArt,
  champSeasonArt,
  champStandingsArt,
  difficultyArt,
  preloadMenuArts,
} from './ChampArt'
import {
  DEFAULT_CONTROL_FEEL,
  MOBILE_DRIVE_SCHEMES,
  SKATE_STANCES,
  type CamFollow,
  type ControlFeelValues,
  type MobileDriveScheme,
  type SkateStance,
} from '../input/ControlFeel'
import {
  DEFAULT_VISUAL,
  VISUAL_QUALITIES,
  type VisualQuality,
} from '../render/VisualSettings'
import { lastSuggestedQuality, suggestVisualQuality } from '../render/DeviceQuality'
import {
  DEFAULT_RACE,
  RACE_LAP_MAX,
  RACE_LAP_MIN,
  clampOpponentsToCategory,
  clampRaceLaps,
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
import { allRecords, recordsFor, shareLocalRecordsWithWorld } from '../freestyle/Records'
import { fetchCloudRecords, type CloudRecordRow } from '../freestyle/CloudRecords'
import { formatTime } from '../race/RaceManager'
import { SCOOTER_INSULT_MAX, scooterInsult } from './scooterInsults'
import { isScooterTrapKind } from '../vehicle/FsKinds'
import { loadOrCreatePlayerName, savePlayerName } from './PlayerName'

import {
  COLOR_NONE,
  DEFAULT_VEHICLE_LOOK,
  kindsInBranch,
  PAINT_COLOR_CHOICES,
  vehicleBranch,
  vehicleHasHelm,
  vehicleHasRider,
  type VehicleBranch,
  type VehicleLook,
} from '../vehicle/VehicleLook'
import { catalogCanDieFromSpeed, sortKindsBySpeedDesc } from '../vehicle/VehicleProfiles'
import { statsBarsHtml } from '../vehicle/VehicleStats'

const PLAYER_COLOR_CHOICES = PAINT_COLOR_CHOICES
const NEON_COLOR_CHOICES = PAINT_COLOR_CHOICES

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
  wheel: number
  rider: number
  helm: number
  tuning: PlayerTuningValues
  name: string
  difficulty: DifficultyId
  roomCode?: string
  publicWsUrl?: string
  laps?: number
  /** Časový limit (ms) — FS kvalifikace na Plácku. */
  timeLimitMs?: number
  ready?: boolean
  championship?: { branch: VehicleBranch; season: number; league: ChampLeague }
}

export type OnlineBrowserState = {
  connected: boolean
  connecting: boolean
  error: string
  presence: PresenceSnapshot | null
}

type Screen =
  | 'home'
  | 'raceSetup'
  | 'raceMode'
  | 'tracks'
  | 'vehicles'
  | 'tuning'
  | 'settings'
  | 'audio'
  | 'atmosphere'
  | 'difficulty'
  | 'aiLearn'
  | 'controls'
  | 'records'
  | 'online'
  | 'champHub'
  | 'champName'
  | 'champCena'
  | 'champDiff'
  | 'champBrief'
  | 'champPit'
  | 'champSeries'
  | 'champStandings'
  | 'champSeason'
  | 'champLeague'
  | 'champPostQual'
  | 'champStarter'
  | 'champTrophy'

type SettingsDraftKind =
  | 'controls'
  | 'difficulty'
  | 'audio'
  | 'atmosphere'
  | 'aiLearn'

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
  private selectedVehicle: VehicleKind = 'street'
  private selectedColor = DEFAULT_VEHICLE_LOOK.body
  private selectedNeon = DEFAULT_VEHICLE_LOOK.neon
  private selectedWheel = DEFAULT_VEHICLE_LOOK.wheel
  private selectedRider = DEFAULT_VEHICLE_LOOK.rider
  private selectedHelm = DEFAULT_VEHICLE_LOOK.helm
  private selectedBranch: VehicleBranch = 'auto'
  private selectedDifficulty: DifficultyId = 'normal'
  private recordsMode: 'race' | 'freestyle' = 'race'
  private recordsScope: 'local' | 'world' = 'local'
  private worldRecords: CloudRecordRow[] = []
  private worldRecordsLoading = false
  /** Online lobby: doplnit AI do 4 (client preference). */
  private lobbyFillAi = true
  /** Online lobby: čekání před auto-startem (ms), default 5 min. */
  private lobbyWaitMs = 5 * 60 * 1000
  private lobbyWaitStartedAt = 0
  private lobbyWaitTimer: number | null = null
  private tuning: PlayerTuningValues = { ...DEFAULT_PLAYER_TUNING }
  private playerName = loadOrCreatePlayerName()
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
  private hostLaps = 3
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
  /** Zpět z podstránek nastavení (chip z Domova → home, hub → settings). */
  private settingsSubBack: Screen = 'settings'
  /** Remap: skate / brusle / bike triky. */
  private ctrlTrickKind: 'skate' | 'skates' | 'bike' = 'skate'
  /** Rozbalené podstyly kalendáře v atmosféře. */
  private calendarPackOpen = false
  /** Koloběžka: pokusy o odchod (9+ = force skate). */
  private scooterLeaveAttempts = 0
  private scooterPopup: string | null = null
  /** Po 30. narážce OK → vynutit skate. */
  private scooterForceSkate = false
  /** Esc v popup: 1 = čeká, 2 = zpět (zavřít). */
  private scooterModalEsc = 0
  private raceModePick: RaceModeId = 'classic'
  /** Draft při vstupu do Trať / Peklostroj / Tuning — Esc/Zpět vrátí. */
  private draftTracks: { trackId: string; reverse: boolean; laps: number } | null = null
  private draftVehicle: {
    vehicle: VehicleKind
    color: number
    neon: number
    wheel: number
    rider: number
    helm: number
    branch: VehicleBranch
  } | null = null
  private draftTuning: {
    tuning: PlayerTuningValues
    neon: number
    wheel: number
    rider: number
    helm: number
  } | null = null
  private champBranch: VehicleBranch = 'auto'
  private champLeague: ChampLeague = 'baby'
  private champSeason = 1
  private champCareer: ChampCareer | null = null
  private champSeasonCompleteInfo: SeasonCompleteInfo | null = null
  private champTrophyCareerKey = ''
  /** Náhled vozidla v pit stopu (i zamčené z ceníku). */
  private champPitPreview: VehicleKind | null = null
  /** Pit košík: draft tuningu + případný nákup vozu (až po Potvrdit). */
  private pitCartTune: PlayerTuningValues | null = null
  private pitCartBuy: VehicleKind | null = null
  /** Preferovaný pool (F / F+R) při startu nové sezóny. */
  private champPoolPref: ChampTrackPool = 'half'
  /** Draft série (obtížnost) — OK uloží, Esc/Zpět vrátí. */
  private champSeriesDraft: { difficulty: DifficultyId } | null = null
  /** Výběr dlaždice před OK (jako výběr auta). */
  private champPickLeague: ChampLeague | null = null
  private champPickDiff: DifficultyId | null = null
  private champNameDraft = ''
  /** Náhled kola v kalendáři sezóny (index). */
  private champCalPreviewRound = 0
  private pitAccordionOpen: 'shop' | 'garage' | 'tune' | null = 'shop'
  private settingsDraft: {
    kind: SettingsDraftKind
    audio?: AudioSettingsValues
    atmosphere?: AtmosphereSettingsValues
    visual?: import('../render/VisualSettings').VisualSettingsValues
    calendarPackOpen?: boolean
    difficulty?: DifficultyId
    race?: RaceSettingsValues
    learn?: ReturnType<typeof loadLearnSettings>
    bindings?: KeyBindingsMap
    tricks?: TrickBindingsMap
    controlFeel?: ControlFeelValues
    ctrlTrickKind?: 'skate' | 'skates' | 'bike'
  } | null = null
  private uiAbort: AbortController | null = null
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
    return this.playerName || loadOrCreatePlayerName()
  }

  setLobby(
    room: NetRoom | null,
    link: string,
    isHost: boolean,
    error = '',
    localNetId: string | null = null,
  ): void {
    const wasCode = this.lobby?.code
    const keepScroll = Boolean(this.visible && this.lobby && room && room.code === wasCode)
    const scrollPos = keepScroll ? this.savePanelScroll() : null
    this.lobby = room
    this.lobbyLink = link
    this.isHost = isHost
    this.lobbyError = error
    if (localNetId) this.localNetId = localNetId
    if (!room) {
      this.localNetId = null
      this.clearLobbyWaitTimer()
    } else if (room.code !== wasCode) {
      this.lobbyWaitStartedAt = 0
      this.clearLobbyWaitTimer()
    }
    if (room?.laps) this.hostLaps = room.laps
    if (this.visible) {
      this.render()
      if (scrollPos) this.restorePanelScroll(scrollPos)
    }
  }

  wantsLobbyFillAi(): boolean {
    return this.lobbyFillAi
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

  showHome(): void {
    this.visible = true
    this.root.classList.add('menu-visible')
    this.screen = 'home'
    applyUiAtmosphere(this.atmosphereApi?.get() ?? DEFAULT_ATMOSPHERE)
    const atm = this.atmosphereApi?.get() ?? DEFAULT_ATMOSPHERE
    const homeArt = menuArtForTone(atm.tone, atm.calendarPack)
    const brief = champBriefArt()
    preloadMenuArts([
      homeArt.race,
      homeArt.settings,
      champStandingsArt(),
      brief.featured,
      brief.jet,
      brief.series,
    ])
    this.render()
    this.startWatermarkRotation()
  }

  showRaceSetup(): void {
    this.visible = true
    this.root.classList.add('menu-visible')
    this.screen = 'raceSetup'
    applyUiAtmosphere(this.atmosphereApi?.get() ?? DEFAULT_ATMOSPHERE)
    this.render()
    this.startWatermarkRotation()
  }

  showChampionshipBrief(branch: VehicleBranch, league: ChampLeague, season: number): void {
    this.visible = true
    this.root.classList.add('menu-visible')
    this.champBranch = branch
    this.champLeague = league
    this.champSeason = season
    this.champCareer = getCareer(branch, league, season) ?? getActiveCareerForBranch(branch)
    const career = this.champCareer
    // Po kvalifikaci: brána (dál / zrušit) → jméno → Cena → obtížnost → brief.
    if (career && career.qualified && !career.setupComplete && !career.nameChosen) {
      this.screen = 'champPostQual'
    } else if (career && career.qualified && !career.nameChosen) {
      this.screen = 'champName'
    } else if (career && career.qualified && !career.leagueChosen) {
      this.screen = 'champCena'
    } else if (career && career.qualified && !career.seriesChosen) {
      this.screen = 'champDiff'
    } else {
      if (career && needsChampPostQualSetup(career)) markChampSetupComplete(career)
      this.screen = 'champBrief'
    }
    applyUiAtmosphere(this.atmosphereApi?.get() ?? DEFAULT_ATMOSPHERE)
    this.render()
    this.startWatermarkRotation()
  }

  showChampionshipTrophy(career: ChampCareer): void {
    this.visible = true
    this.root.classList.add('menu-visible')
    this.champCareer = career
    this.champBranch = career.branch
    this.champLeague = career.league
    this.champSeason = career.season
    const trophyKey = `${career.branch}:${career.league}:s${career.season}:done`
    if (this.champTrophyCareerKey !== trophyKey) {
      this.champTrophyCareerKey = trophyKey
      this.champSeasonCompleteInfo = completeSeasonAndPrepareNext(career)
    }
    this.screen = 'champTrophy'
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
    this.uiAbort?.abort()
    this.uiAbort = new AbortController()
    const signal = this.uiAbort.signal
    // Po synchr. renderu HTML — šipky / Enter / Backspace
    queueMicrotask(() => {
      if (!signal.aborted && this.visible) this.bindKeyboardNav(signal)
    })
    return signal
  }

  /** Interaktivní prvky menu (viditelné). */
  private menuFocusables(): HTMLElement[] {
    const nodes = this.root.querySelectorAll<HTMLElement>(
      'button:not([disabled]), summary, a[href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled])',
    )
    return [...nodes].filter((el) => {
      if (el.closest('[hidden], .is-hidden, [aria-hidden="true"]')) return false
      const r = el.getBoundingClientRect()
      return r.width > 2 && r.height > 2
    })
  }

  private focusFieldKind(el: Element | null): 'text' | 'range' | 'other' | 'none' {
    if (!(el instanceof HTMLElement) || !this.root.contains(el)) return 'none'
    const tag = el.tagName
    if (tag === 'TEXTAREA' || el.isContentEditable) return 'text'
    if (tag === 'SELECT') return 'text'
    if (tag === 'INPUT') {
      const type = (el as HTMLInputElement).type || 'text'
      if (type === 'range' || type === 'color' || type === 'checkbox' || type === 'radio') return 'range'
      return 'text'
    }
    return 'other'
  }

  /** Prvky seřazené vizuálně: nahoře→dole, vlevo→vpravo. */
  private menuFocusablesVisual(): HTMLElement[] {
    const items = this.menuFocusables()
    return items.sort((a, b) => {
      const ra = a.getBoundingClientRect()
      const rb = b.getBoundingClientRect()
      const row = ra.top - rb.top
      if (Math.abs(row) > 12) return row
      return ra.left - rb.left
    })
  }

  /** Stejný pás: blízké středy, nebo střed kratšího prvku leží ve vysokém (Jet). */
  private sameVisualRow(a: DOMRect, b: DOMRect): boolean {
    const ay = a.top + a.height / 2
    const by = b.top + b.height / 2
    if (Math.abs(ay - by) <= Math.max(28, Math.min(a.height, b.height) * 0.55)) return true
    if (a.height >= b.height * 1.4) return by > a.top + 6 && by < a.bottom - 6
    if (b.height >= a.height * 1.4) return ay > b.top + 6 && ay < b.bottom - 6
    const overlap = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
    return overlap > Math.min(a.height, b.height) * 0.35
  }

  private sameVisualCol(a: DOMRect, b: DOMRect): boolean {
    const ax = a.left + a.width / 2
    const bx = b.left + b.width / 2
    if (Math.abs(ax - bx) <= Math.max(36, Math.min(a.width, b.width) * 0.45)) return true
    if (a.width >= b.width * 1.4) return bx > a.left + 6 && bx < a.right - 6
    if (b.width >= a.width * 1.4) return ax > b.left + 6 && ax < b.right - 6
    const overlap = Math.min(a.right, b.right) - Math.max(a.left, b.left)
    return overlap > Math.min(a.width, b.width) * 0.35
  }

  /** Nejbližší ve směru; na pásu se točí ve smyčce (žebříček ←→ Jet). */
  private pickArrowFocus(items: HTMLElement[], idx: number, code: string): HTMLElement {
    const cur = items[idx]!
    const cr = cur.getBoundingClientRect()
    const cx = cr.left + cr.width / 2
    const cy = cr.top + cr.height / 2
    const horiz = code === 'ArrowLeft' || code === 'ArrowRight'

    const positioned = items.map((el) => {
      const r = el.getBoundingClientRect()
      return { el, r, x: r.left + r.width / 2, y: r.top + r.height / 2 }
    })

    if (horiz) {
      const row = positioned
        .filter((p) => p.el === cur || this.sameVisualRow(cr, p.r))
        .sort((a, b) => a.x - b.x || a.y - b.y)
      const directed = row.filter((p) => {
        if (p.el === cur) return false
        return code === 'ArrowRight' ? p.x > cx + 6 : p.x < cx - 6
      })
      if (directed.length) {
        directed.sort(
          (a, b) =>
            Math.abs(a.x - cx) + Math.abs(a.y - cy) * 0.25 - (Math.abs(b.x - cx) + Math.abs(b.y - cy) * 0.25),
        )
        return directed[0]!.el
      }
      if (row.length > 1) {
        // Smyčka: doleva z nejlevějšího → nejpravější (a naopak)
        return code === 'ArrowRight' ? row[0]!.el : row[row.length - 1]!.el
      }
    } else {
      const col = positioned
        .filter((p) => p.el === cur || this.sameVisualCol(cr, p.r))
        .sort((a, b) => a.y - b.y || a.x - b.x)
      const directed = col.filter((p) => {
        if (p.el === cur) return false
        return code === 'ArrowDown' ? p.y > cy + 6 : p.y < cy - 6
      })
      if (directed.length) {
        directed.sort(
          (a, b) =>
            Math.abs(a.y - cy) + Math.abs(a.x - cx) * 0.25 - (Math.abs(b.y - cy) + Math.abs(b.x - cx) * 0.25),
        )
        return directed[0]!.el
      }
      if (col.length > 1) {
        return code === 'ArrowDown' ? col[0]!.el : col[col.length - 1]!.el
      }
    }

    const visual = this.menuFocusablesVisual()
    const vIdx = visual.indexOf(cur)
    const i = vIdx >= 0 ? vIdx : 0
    if (code === 'ArrowRight' || code === 'ArrowDown') return visual[(i + 1) % visual.length]!
    return visual[(i - 1 + visual.length) % visual.length]!
  }

  private bindKeyboardNav(signal: AbortSignal): void {
    if (isMobileClient()) return

    queueMicrotask(() => {
      if (signal.aborted || !this.visible) return
      const items = this.menuFocusablesVisual()
      const active = document.activeElement
      if (active instanceof HTMLElement && items.includes(active)) return
      // Start: nahoře vlevo (vizuálně), jinak Jet / active karta
      const prefer =
        items.find((el) => el.hasAttribute('data-play')) ||
        items.find((el) => el.classList.contains('gta-tile-hero')) ||
        items.find((el) => el.classList.contains('active') && el.matches('button, .track-card')) ||
        items[0]
      prefer?.focus({ preventScroll: true })
    })

    window.addEventListener(
      'keydown',
      (e) => {
        if (!this.visible || signal.aborted) return
        if (e.altKey || e.ctrlKey || e.metaKey) return

        const kind = this.focusFieldKind(document.activeElement)

        if (e.code === 'Backspace' || e.code === 'Delete') {
          if (kind === 'text') return
          e.preventDefault()
          this.audioApi?.playClick?.()
          const nav = this.handleEscape()
          if (nav === 'to-entry') this.onBackToEntry?.()
          return
        }

        if (kind === 'text') return
        if (kind === 'range' && (e.code === 'ArrowLeft' || e.code === 'ArrowRight')) return

        if (e.code === 'Enter' || e.code === 'NumpadEnter') {
          if (this.scooterPopup) {
            e.preventDefault()
            this.audioApi?.playClick?.()
            this.confirmScooterModal()
            return
          }
          const el = document.activeElement
          if (!(el instanceof HTMLElement) || !this.root.contains(el)) return
          if (el.tagName === 'BUTTON' || el.tagName === 'SUMMARY' || el.tagName === 'A') {
            e.preventDefault()
            el.click()
          }
          return
        }

        if (
          e.code !== 'ArrowUp' &&
          e.code !== 'ArrowDown' &&
          e.code !== 'ArrowLeft' &&
          e.code !== 'ArrowRight'
        ) {
          return
        }

        const items = this.menuFocusablesVisual()
        if (!items.length) return
        e.preventDefault()
        const current = document.activeElement
        let idx = current instanceof HTMLElement ? items.indexOf(current) : -1
        if (idx < 0) {
          items[0]?.focus({ preventScroll: false })
          return
        }
        const next = this.pickArrowFocus(items, idx, e.code)
        next.focus({ preventScroll: false })
        next.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      },
      { signal },
    )
  }

  /** SVG ikony šipek pro nápovědu kláves (PC). */
  private keyArrowsHtml(): string {
    const arrow = (deg: number) =>
      `<span class="menu-key-arrow" aria-hidden="true"><svg viewBox="0 0 12 12" focusable="false"><path fill="currentColor" transform="rotate(${deg} 6 6)" d="M6 1.2 L10.2 7.2 H7.4 V10.8 H4.6 V7.2 H1.8 Z"/></svg></span>`
    return `<span class="menu-key-arrows" title="${t('menu.escArrowsLabel')}" aria-label="${t('menu.escArrowsLabel')}">${arrow(0)}${arrow(90)}${arrow(180)}${arrow(270)}</span>`
  }

  /** Esc / Backspace / šipky / Enter (bez myši a prstu). */
  private kbdHintHtml(extraClass = ''): string {
    if (isMobileClient()) return ''
    const cls = ['menu-esc-hint', extraClass].filter(Boolean).join(' ')
    return `<p class="${cls}">
      <span>Esc</span><span class="menu-esc-sep">/</span>
      <span>Backspace</span><span class="menu-esc-sep">/</span>
      ${this.keyArrowsHtml()}<span class="menu-esc-sep">/</span>
      <span>Enter</span>
    </p>`
  }

  /**
   * Domů: stejný DOM footprint jako backRow(flow) — neviditelné Zpět vlevo
   * drží výšku patičky, ať se hub/brief neposune dolů.
   */
  private homeChromeFooter(): string {
    return `<div class="menu-nav-back menu-nav-back--flow">
      <button type="button" class="btn-ghost menu-back-btn menu-back-btn--phantom" tabindex="-1" aria-hidden="true">${t('menu.back')}</button>
      ${this.kbdHintHtml()}
    </div>`
  }

  /**
   * Viditelné Zpět vlevo (hlavně telefon — Esc tam není).
   * dock = fixed vlevo dole obrazovky (výjimky mimo panel)
   * flow = v černém pásu panelu (menu-panel-dock) — scrolluje tělo, Zpět zůstává
   */
  private backRow(to: Screen | 'entry' = 'home', mode: 'dock' | 'flow' = 'dock'): string {
    const entry = to === 'entry'
    const label = entry ? t('menu.backEntry') : t('menu.back')
    const attr = entry ? 'data-back-entry' : 'data-back'
    const esc = this.kbdHintHtml()
    const modeClass = mode === 'flow' ? ' menu-nav-back--flow' : ' menu-nav-back--dock'
    return `<div class="menu-nav-back${modeClass}">
      <button type="button" class="btn-ghost menu-back-btn" ${attr}>${label}</button>
      ${esc}
    </div>`
  }

  /** Peklostroj: Zpět vlevo, OK + Tuning vpravo. */
  private vehiclesNavRow(): string {
    const esc = this.kbdHintHtml()
    return `<div class="menu-nav-back menu-nav-back--flow menu-nav-back--split">
      <button type="button" class="btn-ghost menu-back-btn" data-back>${t('menu.back')}</button>
      <div class="menu-nav-right">
        <button type="button" class="btn-ghost menu-back-btn menu-tune-btn" data-ok>${t('menu.ok')}</button>
        <button type="button" class="btn-ghost menu-back-btn menu-tune-btn" data-tuning>${t('menu.tuning')}</button>
      </div>
      ${esc}
    </div>`
  }

  /** Tuning: Zpět vlevo, OK vpravo. */
  private tuningNavRow(): string {
    const esc = this.kbdHintHtml()
    return `<div class="menu-nav-back menu-nav-back--flow menu-nav-back--split">
      <button type="button" class="btn-ghost menu-back-btn" data-back>${t('menu.back')}</button>
      <button type="button" class="btn-ghost menu-back-btn menu-tune-btn" data-ok>${t('menu.ok')}</button>
      ${esc}
    </div>`
  }

  /** Trať: Zpět vlevo, OK vpravo. */
  private tracksNavRow(): string {
    const esc = this.kbdHintHtml()
    return `<div class="menu-nav-back menu-nav-back--flow menu-nav-back--split">
      <button type="button" class="btn-ghost menu-back-btn" data-back>${t('menu.back')}</button>
      <button type="button" class="btn-ghost menu-back-btn menu-tune-btn" data-ok>${t('menu.ok')}</button>
      ${esc}
    </div>`
  }

  /** Nastavení: Zpět/Esc vrátí draft, OK potvrdí. */
  private settingsOkNavRow(): string {
    const esc = this.kbdHintHtml()
    return `<div class="menu-nav-back menu-nav-back--flow menu-nav-back--split">
      <button type="button" class="btn-ghost menu-back-btn" data-back>${t('menu.back')}</button>
      <button type="button" class="btn-ghost menu-back-btn menu-tune-btn" data-ok>${t('menu.ok')}</button>
      ${esc}
    </div>`
  }

  /**
   * Kariéra / split patička: Zpět vlevo (volitelně), OK/Další vpravo.
   * `hideBack` = jen potvrzení (obtížnost).
   */
  private champOkNavRow(
    okAttr: string,
    opts?: { okLabel?: string; hideBack?: boolean },
  ): string {
    const esc = this.kbdHintHtml()
    const okLabel = opts?.okLabel ?? t('menu.ok')
    const back = opts?.hideBack
      ? `<button type="button" class="btn-ghost menu-back-btn menu-back-btn--phantom" tabindex="-1" aria-hidden="true">${t('menu.back')}</button>`
      : `<button type="button" class="btn-ghost menu-back-btn" data-back>${t('menu.back')}</button>`
    return `<div class="menu-nav-back menu-nav-back--flow menu-nav-back--split">
      ${back}
      <button type="button" class="btn-ghost menu-back-btn menu-tune-btn" ${okAttr}>${okLabel}</button>
      ${esc}
    </div>`
  }

  private beginSettingsDraft(kind: SettingsDraftKind): void {
    if (this.settingsDraft?.kind === kind) return
    const draft: NonNullable<typeof this.settingsDraft> = { kind }
    if (kind === 'audio') {
      draft.audio = { ...(this.audioApi?.get() ?? DEFAULT_AUDIO) }
    }
    if (kind === 'atmosphere') {
      draft.atmosphere = { ...(this.atmosphereApi?.get() ?? DEFAULT_ATMOSPHERE) }
      draft.visual = { ...(this.visualApi?.get() ?? DEFAULT_VISUAL) }
      draft.calendarPackOpen = this.calendarPackOpen
    }
    if (kind === 'difficulty') {
      draft.difficulty = this.selectedDifficulty
      draft.race = { ...(this.raceApi?.get() ?? DEFAULT_RACE) }
    }
    if (kind === 'aiLearn') {
      draft.learn = { ...loadLearnSettings() }
    }
    if (kind === 'controls') {
      draft.bindings = cloneBindings(loadKeyBindings())
      draft.tricks = Object.fromEntries(
        Object.entries(loadTrickBindings()).map(([k, v]) => [k, [v[0], v[1]] as const]),
      ) as TrickBindingsMap
      draft.controlFeel = { ...(this.controlFeelApi?.get() ?? DEFAULT_CONTROL_FEEL) }
      draft.race = { ...(this.raceApi?.get() ?? DEFAULT_RACE) }
      draft.ctrlTrickKind = this.ctrlTrickKind
    }
    this.settingsDraft = draft
  }

  private revertSettingsDraft(): void {
    const d = this.settingsDraft
    if (!d) return
    if (d.audio) this.audioApi?.set(d.audio)
    if (d.atmosphere) {
      this.atmosphereApi?.set(d.atmosphere)
      applyUiAtmosphere(d.atmosphere)
    }
    if (d.visual) this.visualApi?.set(d.visual)
    if (typeof d.calendarPackOpen === 'boolean') this.calendarPackOpen = d.calendarPackOpen
    if (d.difficulty) this.selectedDifficulty = d.difficulty
    if (d.race) this.raceApi?.set(d.race)
    if (d.learn) saveLearnSettings(d.learn)
    if (d.bindings) {
      saveKeyBindings(d.bindings)
      saveTrickBindings(d.tricks ?? defaultTrickBindings())
    }
    if (d.controlFeel) this.controlFeelApi?.set(d.controlFeel)
    if (d.ctrlTrickKind === 'skate' || d.ctrlTrickKind === 'skates' || d.ctrlTrickKind === 'bike') {
      this.ctrlTrickKind = d.ctrlTrickKind
    }
    this.settingsDraft = null
  }

  private commitSettingsDraft(): void {
    this.settingsDraft = null
  }

  private bindSettingsOkEsc(to: Screen = 'settings'): void {
    this.root.querySelector('[data-ok]')?.addEventListener('click', () => {
      this.audioApi?.playClick?.()
      // Dočti kola z inputu před commit (stejný problém jako Trať)
      const lapsInput = this.root.querySelector<HTMLInputElement>('[data-race-laps-input]')
      if (lapsInput) this.raceApi?.set({ laps: clampRaceLaps(lapsInput.value) })
      this.commitSettingsDraft()
      this.screen = to
      this.render()
    })
    this.root.querySelector('[data-back]')?.addEventListener('click', () => {
      this.audioApi?.playClick?.()
      this.revertSettingsDraft()
      this.screen = to
      this.render()
    })
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
    this.scooterModalEsc = 0
  }

  /** Další narážka — jen overlay (bez full render = bez mikrolagu). */
  private bumpScooterTrap(): void {
    this.scooterLeaveAttempts += 1
    if (this.scooterLeaveAttempts > SCOOTER_INSULT_MAX) {
      this.selectedVehicle = 'skate'
      this.clearScooterTrap()
      this.render()
      return
    }
    const rocket = this.selectedVehicle === 'rocketScooter'
    this.scooterPopup = scooterInsult(this.scooterLeaveAttempts, rocket)
    this.scooterForceSkate = this.scooterLeaveAttempts >= SCOOTER_INSULT_MAX
    this.scooterModalEsc = 0
    this.mountScooterModal()
  }

  /** Jen hláška + OK — stejná velikost pro koloběžku i raketovou. */
  private scooterModalHtml(): string {
    if (!this.scooterPopup) return ''
    return `<div class="scooter-modal" role="dialog" aria-modal="true">
      <div class="scooter-modal-card">
        <p>${this.escape(this.scooterPopup)}</p>
        <button type="button" class="menu-start" data-scooter-ok>OK</button>
      </div>
    </div>`
  }

  private mountScooterModal(onDismiss?: () => void): void {
    this.root.querySelector('.scooter-modal')?.remove()
    if (!this.scooterPopup) return
    this.root.insertAdjacentHTML('beforeend', this.scooterModalHtml())
    this.bindScooterModal(onDismiss)
  }

  /** Enter / klik OK na buzna popup. */
  private confirmScooterModal(onDismiss?: () => void): void {
    if (!this.scooterPopup) return
    const forceSkate = this.scooterForceSkate || this.scooterLeaveAttempts >= SCOOTER_INSULT_MAX
    this.scooterPopup = null
    this.scooterModalEsc = 0
    this.root.querySelector('.scooter-modal')?.remove()
    if (forceSkate) {
      this.selectedVehicle = 'skate'
      this.clearScooterTrap()
      onDismiss?.()
      this.render()
      return
    }
    onDismiss?.()
  }

  /** 2× Esc = zpět (zavřít popup bez force skate). */
  private dismissScooterModalBack(): void {
    this.scooterPopup = null
    this.scooterModalEsc = 0
    this.root.querySelector('.scooter-modal')?.remove()
  }

  /** Herní confirm (ne window.confirm) — stejný footprint jako scooter modal. */
  private showMenuConfirm(message: string, onYes: () => void): void {
    this.root.querySelector('.menu-confirm-modal')?.remove()
    this.root.insertAdjacentHTML(
      'beforeend',
      `<div class="scooter-modal menu-confirm-modal" role="dialog" aria-modal="true">
        <div class="scooter-modal-card menu-confirm-card">
          <p>${this.escape(message)}</p>
          <div class="menu-confirm-actions">
            <button type="button" class="btn-ghost" data-confirm-no>${t('menu.back')}</button>
            <button type="button" class="menu-start" data-confirm-yes>${t('menu.ok')}</button>
          </div>
        </div>
      </div>`,
    )
    const close = () => this.root.querySelector('.menu-confirm-modal')?.remove()
    this.root.querySelector('[data-confirm-no]')?.addEventListener('click', () => {
      this.audioApi?.playClick?.()
      close()
    })
    this.root.querySelector('[data-confirm-yes]')?.addEventListener('click', () => {
      this.audioApi?.playClick?.()
      close()
      onYes()
    })
  }

  private bindScooterModal(onDismiss?: () => void): void {
    this.root.querySelector('[data-scooter-ok]')?.addEventListener('click', () => {
      this.confirmScooterModal(onDismiss)
    })
  }

  handleEscape(): 'stay' | 'to-entry' {
    if (!this.visible) return 'stay'
    if (this.scooterPopup) {
      this.scooterModalEsc += 1
      if (this.scooterModalEsc >= 2) this.dismissScooterModalBack()
      return 'stay'
    }
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
      this.screen === 'aiLearn' ||
      this.screen === 'controls'
    ) {
      this.revertSettingsDraft()
      this.screen = this.settingsSubBack
      this.render()
      return 'stay'
    }
    if (
      this.screen === 'champPit' ||
      this.screen === 'champSeries' ||
      this.screen === 'champDiff' ||
      this.screen === 'champStandings' ||
      this.screen === 'champSeason' ||
      this.screen === 'champLeague'
    ) {
      const career =
        this.champCareer ?? getCareer(this.champBranch, this.champLeague, this.champSeason)
      if (
        this.screen === 'champPit' ||
        this.screen === 'champStandings' ||
        this.screen === 'champSeason'
      ) {
        if (this.screen === 'champPit') {
          this.champPitPreview = null
          if (career) this.resetPitCart(career)
        }
        this.screen = 'champBrief'
      } else if (this.screen === 'champDiff') {
        this.revertChampSeriesDraft(career)
        this.champPickDiff = null
        this.screen = career && career.qualified && !career.seriesChosen ? 'champCena' : 'champBrief'
      } else if (this.screen === 'champSeries') {
        this.revertChampSeriesDraft(career)
        this.screen = 'champBrief'
      } else {
        this.screen = 'champBrief'
      }
      this.render()
      return 'stay'
    }
    if (this.screen === 'champStarter') {
      this.screen = 'champHub'
      this.render()
      return 'stay'
    }
    if (this.screen === 'champBrief') {
      // Po zamčení setupu: Cena = pokračovat / zrušit
      this.screen = 'champCena'
      this.render()
      return 'stay'
    }
    if (this.screen === 'champCena') {
      const career =
        this.champCareer ?? getActiveCareerForBranch(this.champBranch)
      this.champPickLeague = null
      if (career && career.qualified && !career.seriesChosen && career.nameChosen) {
        this.screen = 'champName'
      } else if (career && career.qualified && !career.nameChosen) {
        this.screen = 'champPostQual'
      } else {
        this.screen = 'champHub'
      }
      this.render()
      return 'stay'
    }
    if (this.screen === 'champName') {
      this.screen = 'champPostQual'
      this.render()
      return 'stay'
    }
    if (this.screen === 'champPostQual') {
      this.screen = 'champHub'
      this.render()
      return 'stay'
    }
    if (this.screen === 'champHub' || this.screen === 'champTrophy') {
      this.champSeasonCompleteInfo = null
      this.champTrophyCareerKey = ''
      this.screen = 'home'
      this.render()
      return 'stay'
    }
    if (this.screen === 'tuning') {
      this.revertTuningDraft()
      this.screen = 'vehicles'
      this.render()
      return 'stay'
    }
    if (this.screen === 'vehicles') {
      this.revertVehicleDraft()
      this.clearScooterTrap()
      this.screen = 'raceSetup'
      this.render()
      return 'stay'
    }
    if (this.screen === 'tracks') {
      this.revertTracksDraft()
      this.screen = 'raceSetup'
      this.render()
      return 'stay'
    }
    if (this.screen === 'raceSetup') {
      this.screen = 'home'
      this.render()
      return 'stay'
    }
    if (this.screen === 'online') {
      this.raceModePick = 'online'
      this.screen = 'raceSetup'
      this.render()
      return 'stay'
    }
    if (this.screen === 'raceMode' || this.screen === 'records') {
      this.screen = this.screen === 'records' ? this.recordsBack : 'home'
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

  /** Scroll pozice panelu / seznamu / náhledu — po kliknutí na kartu se nesmí skákat nahoru. */
  private savePanelScroll(): { body: number; list: number; preview: number } {
    const body = this.root.querySelector<HTMLElement>('.menu-panel-body')
    const list = this.root.querySelector<HTMLElement>('.tracks-list, .champ-cal-list-scroll')
    const preview = this.root.querySelector<HTMLElement>('.vehicle-stage, .tracks-preview-pane')
    return {
      body: body?.scrollTop ?? 0,
      list: list?.scrollTop ?? 0,
      preview: preview?.scrollTop ?? 0,
    }
  }

  private restorePanelScroll(pos: { body: number; list: number; preview: number }): void {
    requestAnimationFrame(() => {
      const body = this.root.querySelector<HTMLElement>('.menu-panel-body')
      const list = this.root.querySelector<HTMLElement>('.tracks-list, .champ-cal-list-scroll')
      const preview = this.root.querySelector<HTMLElement>('.vehicle-stage, .tracks-preview-pane')
      if (body) body.scrollTop = pos.body
      if (list) list.scrollTop = pos.list
      if (preview) preview.scrollTop = pos.preview
    })
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
            <p class="gta-tagline gta-tagline--slot" aria-hidden="true">&nbsp;</p>
          </header>
          <div class="gta-tiles gta-tiles-home3">
            <button type="button" class="gta-tile gta-tile-hero" data-go="champHub" style="--tile:url('${champBriefArt().featured}')">
              <strong class="gta-tile-label">${t('menu.champTile')}</strong>
            </button>
            <button type="button" class="gta-tile gta-tile-setup" data-go-setup style="--tile:url('${art.race}')">
              <strong class="gta-tile-label">${t('menu.raceTile')}</strong>
            </button>
            <button type="button" class="gta-tile gta-tile-setup" data-go="records" style="--tile:url('${champStandingsArt()}')">
              <strong class="gta-tile-label">${t('menu.leaderboard')}</strong>
            </button>
            <button type="button" class="gta-tile gta-tile-setup" data-go="settings" style="--tile:url('${art.settings}')">
              <strong class="gta-tile-label">${t('menu.settings')}</strong>
            </button>
          </div>
          ${this.homeChromeFooter()}
        </div>
      `
      this.bindMuteBar()
      this.root.querySelector<HTMLButtonElement>('[data-go-setup]')?.addEventListener('click', () => {
        this.screen = 'raceSetup'
        this.render()
      })
      this.root.querySelectorAll<HTMLButtonElement>('[data-go]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const go = (btn.dataset.go as Screen) || 'home'
          if (go === 'records') this.recordsBack = 'home'
          if (go === 'settings') this.settingsSubBack = 'settings'
          if (go === 'champHub') {
            this.champCareer = null
            this.champBranch = 'auto'
            this.champLeague = 'baby'
            this.champPoolPref = 'half'
          }
          this.screen = go
          this.render()
        })
      })
      return
    }

    if (this.screen === 'raceSetup') {
      const atm = this.atmosphereApi?.get() ?? DEFAULT_ATMOSPHERE
      const art = menuArtForTone(atm.tone, atm.calendarPack)
      const trackDef = TRACKS.find((tr) => tr.id === this.selectedTrackId) ?? TRACKS[0]
      const race = this.raceApi?.get() ?? { ...DEFAULT_RACE }
      const lapsNow = clampRaceLaps(race.laps)
      const lapsSelectable = Boolean(trackDef && !trackDef.sandbox && trackDef.loop)
      const trackName = this.escape(this.trackLabel())
      const vehicleName = this.vehicleLabel(this.selectedVehicle)
      const jetSub = lapsSelectable
        ? `${trackName} · ${vehicleName} · ${lapsNow} ${t('menu.onlineLaps').toLowerCase()}`
        : `${trackName} · ${vehicleName}`
      const lapsPanel = lapsSelectable
        ? `<section class="menu-section race-setup-laps" aria-label="${t('menu.onlineLaps')}">
            <p class="tune-rules">${t('menu.onlineLaps')}</p>
            <div class="lap-stepper" role="group" aria-label="${t('menu.onlineLaps')}">
              <button type="button" class="btn-ghost lap-step" data-setup-laps-delta="-1" aria-label="-">−</button>
              <input type="number" class="lap-step-input" min="${RACE_LAP_MIN}" max="${RACE_LAP_MAX}" step="1" value="${lapsNow}" data-setup-laps-input inputmode="numeric" />
              <button type="button" class="btn-ghost lap-step" data-setup-laps-delta="1" aria-label="+">+</button>
            </div>
          </section>`
        : `<p class="tune-help race-setup-laps-na">${t('menu.circuitLapsNA')}</p>`
      this.root.innerHTML = `
        ${wm}
        ${this.muteBar()}
        <div class="menu-shell menu-home gta-home">
          <header class="gta-home-hero">
            ${brandLockupHtml({ size: 'menu' })}
            <p class="gta-tagline gta-tagline--slot" aria-hidden="true">&nbsp;</p>
          </header>
          <div class="gta-tiles gta-tiles-home3 gta-tiles-setup">
            <button type="button" class="gta-tile gta-tile-hero" data-setup-jet style="--tile:url('${art.jet}')">
              <strong class="gta-tile-label">${t('menu.jet')}</strong>
              <span class="gta-tile-sub">${jetSub}</span>
            </button>
            <button type="button" class="gta-tile gta-tile-setup" data-go="tracks" style="--tile:url('${art.tracks}')">
              <strong class="gta-tile-label">${t('menu.trackSelect')}</strong>
              <span class="gta-tile-sub">${trackName}</span>
            </button>
            <button type="button" class="gta-tile gta-tile-setup" data-go="vehicles" style="--tile:url('${art.garage}')">
              <strong class="gta-tile-label">${t('menu.vehicleSelect')}</strong>
              <span class="gta-tile-sub">${vehicleName}</span>
            </button>
            <button type="button" class="gta-tile gta-tile-setup" data-setup-multi style="--tile:url('${art.multi}')">
              <strong class="gta-tile-label">${t('menu.raceMulti')}</strong>
            </button>
          </div>
          ${lapsPanel}
          ${this.backRow('home', 'flow')}
        </div>
      `
      this.bindMuteBar()
      this.bindBack('home')
      if (lapsSelectable) {
        this.bindLapStepper({
          get: () => clampRaceLaps(this.raceApi?.get().laps ?? DEFAULT_RACE.laps),
          set: (n) => {
            this.raceApi?.set({ laps: n })
            const input = this.root.querySelector<HTMLInputElement>('[data-setup-laps-input]')
            if (input && input.value !== String(n)) input.value = String(n)
            const jetSubEl = this.root.querySelector<HTMLElement>('[data-setup-jet] .gta-tile-sub')
            if (jetSubEl) {
              jetSubEl.textContent = `${this.trackLabel()} · ${this.vehicleLabel(this.selectedVehicle)} · ${n} ${t('menu.onlineLaps').toLowerCase()}`
            }
          },
          deltaAttr: 'data-setup-laps-delta',
          inputAttr: 'data-setup-laps-input',
        })
      }
      this.root.querySelectorAll<HTMLButtonElement>('[data-go]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const go = (btn.dataset.go as Screen) || 'raceSetup'
          if (go === 'tracks') this.beginTracksDraft()
          if (go === 'vehicles') this.beginVehicleDraft()
          this.screen = go
          this.render()
        })
      })
      this.root.querySelector('[data-setup-jet]')?.addEventListener('click', () => {
        this.raceModePick = 'classic'
        const lapsInput = this.root.querySelector<HTMLInputElement>('[data-setup-laps-input]')
        if (lapsInput) this.raceApi?.set({ laps: clampRaceLaps(lapsInput.value) })
        this.raceApi?.set({ freestyle: false })
        const raceNow = this.raceApi?.get()
        if (raceNow) {
          this.raceApi?.set({
            opponents: clampOpponentsToCategory(raceNow.opponents, this.selectedVehicle, false),
          })
        }
        this.startSolo()
      })
      this.root.querySelector('[data-setup-multi]')?.addEventListener('click', () => {
        this.raceModePick = 'online'
        this.screen = 'online'
        this.render()
        this.onBrowseOnline?.()
        // Založ místnost s aktuální tratí/vozem
        requestAnimationFrame(() => {
          this.root.querySelector<HTMLButtonElement>('#btn-host')?.click()
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
        { id: 'classic', title: t('menu.raceSingle'), blurb: t('menu.raceClassicBlurb') },
        {
          id: 'online',
          title: t('menu.raceMulti'),
          blurb: t('menu.raceOnlineBlurb'),
          online: true,
        },
      ]
      const pick = modes.find((m) => m.id === this.raceModePick) ?? modes[0]!
      this.root.innerHTML = `
        ${wm}
        ${this.muteBar()}
        <div class="menu-shell menu-panel gta-panel menu-panel-dock">
          <div class="menu-panel-body">
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
                <p class="tune-rules" data-race-hint>${t('menu.raceModeConfirm')}</p>
              </div>
            </div>
            ${
              onPhone
                ? `<p class="tune-rules menu-mobile-warn">${t('menu.mobileLimits')}</p>`
                : ''
            }
          </div>
          ${this.backRow('home', 'flow')}
        </div>
      `
      this.bindMuteBar()
      this.bindBack('home')
      const titleEl = this.root.querySelector<HTMLElement>('[data-race-title]')
      const blurbEl = this.root.querySelector<HTMLElement>('[data-race-blurb]')
      const setPick = (id: RaceModeId) => {
        if (id !== 'classic' && id !== 'online') id = 'classic'
        this.raceModePick = id
        const m = modes.find((x) => x.id === id) ?? modes[0]!
        if (titleEl) titleEl.textContent = m.title
        if (blurbEl) blurbEl.textContent = m.blurb
        this.root.querySelectorAll<HTMLButtonElement>('[data-race-mode]').forEach((b) => {
          b.classList.toggle('active', b.dataset.raceMode === id)
        })
      }
      const confirm = () => {
        this.confirmRaceMode()
      }
      this.root.querySelectorAll<HTMLButtonElement>('[data-race-mode]').forEach((btn) => {
        const id = (btn.dataset.raceMode || 'classic') as RaceModeId
        btn.addEventListener(
          'click',
          (e) => {
            e.preventDefault()
            setPick(id)
            confirm()
          },
          { signal },
        )
      })
      return
    }

    if (this.screen === 'tracks') {
      if (!this.draftTracks) this.beginTracksDraft()
      const scrollPos = this.savePanelScroll()
      const selected = TRACKS.find((tr) => tr.id === this.selectedTrackId) ?? TRACKS[0]
      const race = this.raceApi?.get() ?? { ...DEFAULT_RACE }
      const lapsNow = clampRaceLaps(race.laps)
      const onPhone = isMobileClient()
      /** Počet kol 1–69 — jen okruhy; etapa/Plácek bez stepperu. */
      const lapsUnderPreview = (tr: TrackDef) =>
        tr.sandbox || !tr.loop
          ? `<p class="tune-rules track-laps-na">${t('menu.circuitLapsNA')}</p>`
          : `<p class="tune-rules track-laps-label">${t('menu.onlineLaps')}</p>
        <div class="lap-stepper track-laps-stepper" role="group" aria-label="${t('menu.onlineLaps')}">
          <button type="button" class="btn-ghost lap-step" data-track-laps-delta="-1" aria-label="-">−</button>
          <input type="number" class="lap-step-input" min="${RACE_LAP_MIN}" max="${RACE_LAP_MAX}" step="1" value="${lapsNow}" data-track-laps-input inputmode="numeric" />
          <button type="button" class="btn-ghost lap-step" data-track-laps-delta="1" aria-label="+">+</button>
        </div>`
      const previewBlock = (tr: TrackDef) => `
        <div class="track-inline-preview">
          ${trackPreviewHtml(tr, race.reverse)}
          ${lapsUnderPreview(tr)}
          <div class="track-preview-meta">
            <strong>${this.escape(this.trackName(tr))}</strong>
            <span>${tr.sandbox ? t('menu.sandboxMeta') : this.escape(this.trackBlurb(tr))}</span>
            ${this.trackEstPaceHtml(tr)}
          </div>
          ${
            tr.sandbox
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
        </div>`
      const listHtml = onPhone
        ? TRACKS.map((tr) => {
            const open = tr.id === this.selectedTrackId
            return `<div class="track-acc ${open ? 'open' : ''}">
              ${this.trackCard(tr)}
              ${open ? previewBlock(tr) : ''}
            </div>`
          }).join('')
        : TRACKS.map((tr) => this.trackCard(tr)).join('')
      this.root.innerHTML = `
        ${wm}
        ${this.muteBar()}
        <div class="menu-shell menu-panel menu-panel-dock menu-tracks">
          <div class="menu-panel-body">
            <p class="tune-rules menu-scroll-hint">${t('menu.tracksScrollHint')}</p>
            <div class="tracks-layout ${onPhone ? 'tracks-layout-mobile' : ''}">
              <div class="tracks-list">${listHtml}</div>
              ${
                onPhone
                  ? ''
                  : `<div class="tracks-preview-pane">
                ${trackPreviewHtml(selected, race.reverse)}
                ${lapsUnderPreview(selected)}
                <div class="track-preview-meta">
                  <strong>${this.escape(this.trackName(selected))}</strong>
                  <span>${selected.sandbox ? t('menu.sandboxMeta') : this.escape(this.trackBlurb(selected))}</span>
                  ${this.trackEstPaceHtml(selected)}
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
              </div>`
              }
            </div>
          </div>
          ${this.tracksNavRow()}
        </div>
      `
      this.bindMuteBar()
      this.bindBack('raceSetup')
      this.bindTracks()
      const commitTracks = () => {
        const input = this.root.querySelector<HTMLInputElement>('[data-track-laps-input]')
        if (input) this.raceApi?.set({ laps: clampRaceLaps(input.value) })
        this.commitTracksDraft()
        this.screen = 'raceSetup'
        this.render()
      }
      this.root.querySelector('[data-ok]')?.addEventListener('click', () => commitTracks())
      this.root.querySelectorAll<HTMLButtonElement>('[data-reverse]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const scroll = this.savePanelScroll()
          const lapsInput = this.root.querySelector<HTMLInputElement>('[data-track-laps-input]')
          if (lapsInput) this.raceApi?.set({ laps: clampRaceLaps(lapsInput.value) })
          this.raceApi?.set({ reverse: btn.dataset.reverse === '1' })
          this.render()
          this.restorePanelScroll(scroll)
        })
      })
      this.bindLapStepper({
        get: () => clampRaceLaps(this.raceApi?.get().laps ?? DEFAULT_RACE.laps),
        set: (n) => {
          this.raceApi?.set({ laps: n })
          const input = this.root.querySelector<HTMLInputElement>('[data-track-laps-input]')
          if (input && input.value !== String(n)) input.value = String(n)
        },
        deltaAttr: 'data-track-laps-delta',
        inputAttr: 'data-track-laps-input',
      })
      window.addEventListener(
        'keydown',
        (e) => {
          if (!this.visible || this.screen !== 'tracks') return
          if (e.code !== 'Enter' && e.code !== 'NumpadEnter') return
          e.preventDefault()
          commitTracks()
        },
        { signal },
      )
      this.restorePanelScroll(scrollPos)
      return
    }

    if (this.screen === 'vehicles') {
      if (!this.draftVehicle) this.beginVehicleDraft()
      const scrollPos = this.savePanelScroll()
      const kind = this.selectedVehicle
      this.selectedBranch = vehicleBranch(kind)
      const branchKinds = kindsInBranch(this.selectedBranch)
      const confirmVehicleOk = () => {
        // Past: hláška až při OK — výběr samotný nic nespouští, závod nezačne
        if (isScooterTrapKind(this.selectedVehicle)) {
          this.bumpScooterTrap()
          return
        }
        this.commitVehicleDraft()
        this.clearScooterTrap()
        this.screen = 'raceSetup'
        this.render()
      }
      const openTuning = () => {
        if (isScooterTrapKind(this.selectedVehicle)) {
          this.bumpScooterTrap()
          return
        }
        this.beginTuningDraft()
        this.screen = 'tuning'
        this.render()
      }
      const branches: VehicleBranch[] = ['auto', 'moto', 'monster', 'freestyle']
      this.root.innerHTML = `
        ${wm}
        ${this.muteBar()}
        <div class="menu-shell menu-panel menu-panel-dock menu-vehicles">
          <div class="menu-panel-body">
            <p class="tune-rules menu-scroll-hint">${t('menu.vehiclesScrollHint')}</p>
            <div class="vehicle-branch-row">
              <div class="vehicle-branch-tabs">
                ${branches
                  .map((b) => {
                    const active = b === this.selectedBranch ? 'active' : ''
                    return `<button type="button" class="btn-ghost vehicle-branch-tab ${active}" data-branch="${b}">${t(`menu.branch.${b}`)}</button>`
                  })
                  .join('')}
              </div>
            </div>
            <div class="tracks-layout vehicles-layout">
              <div class="tracks-list">
                ${branchKinds.map((k) => {
                  const active = k === kind ? 'active' : ''
                  return `<button type="button" class="track-card ${active}" data-vehicle="${k}">
                    <strong>${this.vehicleLabel(k)}</strong>
                  </button>`
                }).join('')}
              </div>
              <div class="tracks-preview-pane vehicle-stage">
                <canvas id="vehicle-preview" class="vehicle-preview-canvas"></canvas>
                <p class="tune-help">${t('menu.vehicleDrag')}</p>
                <div class="track-preview-meta">
                  <strong>${this.vehicleLabel(kind)}</strong>
                  <span>${t(`menu.branch.${vehicleBranch(kind)}`)}</span>
                </div>
                ${this.paintRowHtml('color', t('menu.colorPick'), this.selectedColor, PLAYER_COLOR_CHOICES, true)}
                <details class="vehicle-more" open>
                  <summary>${t('menu.vehicleMore')}</summary>
                  ${
                    kind === 'scooter' || kind === 'rocketScooter'
                      ? ''
                      : `<p class="tune-rules">${t(`vehicle.${kind}.max`)}</p>
                  ${this.vehicleCrashInfoHtml(kind)}
                  <div class="veh-stats">${statsBarsHtml(kind, (key) => t(`menu.stat.${key}`), this.tuning)}</div>
                  <p class="vehicle-lore">${t(`vehicle.${kind}.invented`)}</p>
                  <p class="vehicle-lore">${t(`vehicle.${kind}.first`)}</p>
                  <p class="tune-rules">${t('menu.vehicleControls')}</p>
                  <p class="vehicle-lore vehicle-controls">${this.vehicleHelp(kind)}</p>`
                  }
                </details>
              </div>
            </div>
          </div>
          ${this.vehiclesNavRow()}
        </div>
      `
      this.bindMuteBar()
      this.bindBack('raceSetup')
      this.root.querySelector('[data-ok]')?.addEventListener('click', () => confirmVehicleOk())
      this.root.querySelector('[data-tuning]')?.addEventListener('click', () => openTuning())
      this.root.querySelectorAll<HTMLButtonElement>('[data-branch]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const b = (btn.dataset.branch || 'auto') as VehicleBranch
          this.selectedBranch = b
          const pool = kindsInBranch(b)
          if (!pool.includes(this.selectedVehicle)) {
            this.selectedVehicle = pool.find((k) => !isScooterTrapKind(k)) ?? pool[0]!
            this.clearScooterTrap()
          }
          this.render()
        })
      })
      this.root.querySelectorAll<HTMLButtonElement>('[data-vehicle]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const next = (btn.dataset.vehicle as VehicleKind) || 'street'
          this.selectedVehicle = next
          this.selectedBranch = vehicleBranch(next)
          // Jen výběr — past až při potvrzení OK / Enter
          if (!isScooterTrapKind(next)) this.clearScooterTrap()
          const race = this.raceApi?.get()
          if (race && !isScooterTrapKind(next)) {
            this.raceApi?.set({
              opponents: clampOpponentsToCategory(race.opponents, next, false),
            })
          }
          this.render()
        })
      })
      window.addEventListener(
        'keydown',
        (e) => {
          if (!this.visible || this.screen !== 'vehicles') return
          if (this.root.querySelector('.scooter-modal')) return
          if (e.code !== 'Enter' && e.code !== 'NumpadEnter') return
          e.preventDefault()
          confirmVehicleOk()
        },
        { signal },
      )
      const canvas = this.root.querySelector<HTMLCanvasElement>('#vehicle-preview')
      if (canvas) {
        this.vehiclePreview = new VehiclePreview(canvas)
        this.vehiclePreview.setVehicle(kind, this.currentLook())
      }
      this.bindPaintPickers()
      this.restorePanelScroll(scrollPos)
      return
    }

    if (this.screen === 'tuning') {
      if (!this.draftTuning) this.beginTuningDraft()
      const kind = this.selectedVehicle
      const freestyle = vehicleBranch(kind) === 'freestyle'
      const confirmTuning = () => {
        this.commitTuningDraft()
        this.commitVehicleDraft()
        this.screen = 'raceSetup'
        this.render()
      }
      this.root.innerHTML = `
        ${wm}
        ${this.muteBar()}
        <div class="menu-shell menu-panel menu-tuning vehicles-tune menu-panel-dock">
          <div class="menu-panel-body">
            <div class="tracks-layout vehicles-layout">
              <div class="tuning-side">
                <div class="tune-stack">
                  ${TUNE_KEYS.map((key) => this.slider(key, t(`menu.${key}`), this.tuning[key])).join('')}
                </div>
              </div>
              <div class="tracks-preview-pane vehicle-stage">
                <canvas id="vehicle-preview" class="vehicle-preview-canvas"></canvas>
                <p class="tune-help">${t('menu.vehicleDrag')}</p>
                <div class="track-preview-meta">
                  <strong>${this.vehicleLabel(kind)}</strong>
                  <span>${t(`vehicle.${kind}.max`)}</span>
                </div>
                <div class="veh-stats" id="tune-stats">${statsBarsHtml(kind, (key) => t(`menu.stat.${key}`), this.tuning)}</div>
                ${
                  isScooterTrapKind(kind)
                    ? `<p class="tune-rules scooter-warn">${t('menu.scooterTrap')}</p>`
                    : ''
                }
                ${
                  freestyle
                    ? ''
                    : this.paintRowHtml('neon', t('menu.neonPick'), this.selectedNeon, NEON_COLOR_CHOICES, true)
                }
                ${this.paintRowHtml('wheel', t('menu.wheelPick'), this.selectedWheel, NEON_COLOR_CHOICES, true)}
                ${
                  vehicleHasRider(kind)
                    ? this.paintRowHtml('rider', t('menu.riderPick'), this.selectedRider, NEON_COLOR_CHOICES, true, {
                        stepMinus: true,
                        stepPlus: true,
                      })
                    : ''
                }
                ${
                  vehicleHasHelm(kind)
                    ? this.paintRowHtml('helm', t('menu.helmPick'), this.selectedHelm, NEON_COLOR_CHOICES, true)
                    : ''
                }
              </div>
            </div>
          </div>
          ${this.tuningNavRow()}
        </div>
      `
      this.bindMuteBar()
      this.bindBack('vehicles')
      this.bindTuning()
      this.root.querySelector('[data-ok]')?.addEventListener('click', () => confirmTuning())
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
        this.vehiclePreview.setVehicle(kind, this.currentLook())
      }
      this.bindPaintPickers()
      return
    }

    if (this.screen === 'settings') {
      this.root.innerHTML = `
        ${wm}
        ${this.muteBar()}
        <div class="menu-shell menu-home gta-home menu-settings-hub">
          <header class="gta-home-hero">
            ${brandLockupHtml({ size: 'menu' })}
            <p class="gta-tagline gta-tagline--slot" aria-hidden="true">&nbsp;</p>
          </header>
          <div class="gta-home-scroll menu-panel-body">
            <div class="home-actions">
              <p class="settings-group-label">${t('menu.settingsPlayer')}</p>
              <button type="button" class="btn-ghost home-panel" data-go="controls">${t('menu.settingsControls')}</button>
              <button type="button" class="btn-ghost home-panel" data-go="difficulty">${t('menu.difficulty')}</button>
              <button type="button" class="btn-ghost home-panel" data-go="audio">${t('menu.settingsAudio')}</button>
              <button type="button" class="btn-ghost home-panel" data-go="atmosphere">${t('menu.settingsAtmosphere')}</button>
              <details class="settings-advanced">
                <summary>${t('menu.settingsAdvanced')}</summary>
                <div class="settings-advanced-list">
                  <button type="button" class="btn-ghost home-panel" data-go="aiLearn">${t('menu.settingsAiLearn')}</button>
                </div>
              </details>
            </div>
          </div>
          ${this.backRow('home', 'flow')}
        </div>
        ${this.settingsThanks()}
      `
      this.bindMuteBar()
      this.bindBack('home')
      this.bindThanks()
      this.root.querySelectorAll<HTMLButtonElement>('[data-go]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const go = (btn.dataset.go as Screen) || 'settings'
          this.settingsSubBack = 'settings'
          if (
            go === 'controls' ||
            go === 'difficulty' ||
            go === 'audio' ||
            go === 'atmosphere' ||
            go === 'aiLearn'
          ) {
            this.beginSettingsDraft(go)
          }
          this.screen = go
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
        <div class="menu-shell menu-panel menu-panel-dock">
          <div class="menu-panel-body">
            <p class="tune-rules">${t('menu.aiLearnBlurb')}</p>
            <p class="tune-help">${t('menu.aiLearnStats', { n: samples.length, c: model.cells.length })}</p>
            <div class="dir-grid" style="margin:12px 0">
              <button type="button" class="track-card ${learn.enabled ? 'active' : ''}" data-learn-enabled>
                <strong>${t('menu.aiLearnCollect')}</strong>
                <span>${learn.enabled ? t('menu.ctrlOn') : t('menu.ctrlOff')}</span>
              </button>
              <button type="button" class="track-card ${learn.upload ? 'active' : ''}" data-learn-upload>
                <strong>${t('menu.aiLearnUpload')}</strong>
                <span>${learn.upload ? t('menu.ctrlOn') : t('menu.ctrlOff')}</span>
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
          </div>
          ${this.settingsOkNavRow()}
        </div>
      `
      this.bindMuteBar()
      this.bindSettingsOkEsc(this.settingsSubBack)
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
        const [a, b] = tricks[ch] ?? [null, null]
        return `<div class="bind-row bind-row-trick" data-trick-letter="${ch}">
          <span class="bind-name">${ch} · ${this.escape(name)}</span>
          <button type="button" class="bind-key" data-trick-slot="0">${codeLabel(a)}</button>
          <button type="button" class="bind-key" data-trick-slot="1">${codeLabel(b)}</button>
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
              <h3 class="bind-section-title" style="margin-top:14px">${t('menu.ctrlSectionDrive')}</h3>
              ${MOBILE_DRIVE_SCHEMES.map((s) => {
                const active = s === feel.mobileScheme ? 'active' : ''
                return `<div class="bind-row mobile-scheme-row ${active}" data-mobile-scheme="${s}" role="button" tabindex="0">
                  <div class="bind-row-label">
                    <strong>${t(`menu.ctrlMobile.${s}`)}</strong>
                    <span class="bind-row-hint">${t(`menu.ctrlMobile.${s}.blurb`)}</span>
                  </div>
                  <span class="bind-row-keys">${active ? '✓' : ''}</span>
                </div>`
              }).join('')}
              <h3 class="bind-section-title" style="margin-top:14px">${t('menu.ctrlSectionSpecial')}</h3>
              <div class="bind-row ${feel.allowPortraitRotation ? 'active' : ''}" data-allow-portrait role="button" tabindex="0">
                <div class="bind-row-label">
                  <strong>${t('menu.ctrlAllowPortrait')}</strong>
                  <span class="bind-row-hint">${t('menu.ctrlAllowPortraitBlurb')}</span>
                </div>
                <span class="bind-row-keys">${feel.allowPortraitRotation ? t('menu.ctrlOn') : t('menu.ctrlOff')}</span>
              </div>
            </div>`
      this.root.innerHTML = `
        ${wm}
        ${this.muteBar()}
        <div class="menu-shell menu-panel menu-controls menu-panel-dock">
          <div class="menu-panel-body">
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
                    <span>${feel.driftMode ? t('menu.ctrlOn') : t('menu.ctrlOff')} · ${t('menu.ctrlDriftBlurb')}</span>
                  </button>
                  <button type="button" class="track-card ${raceFeel.skipCountdown ? 'active' : ''}" data-feel-skip-cd>
                    <strong>${t('menu.ctrlSkipCountdown')}</strong>
                    <span>${raceFeel.skipCountdown ? t('menu.ctrlOn') : t('menu.ctrlOff')}</span>
                  </button>
                  <button type="button" class="track-card ${feel.immortality ? 'active' : ''}" data-feel-immortal>
                    <strong>${t('menu.ctrlImmortal')}</strong>
                    <span>${feel.immortality ? t('menu.ctrlOn') : t('menu.ctrlOff')} · ${t('menu.ctrlImmortalBlurb')}</span>
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
                <p class="tune-rules" style="margin-top:12px">${t('menu.ctrlSkateStance')}</p>
                <div class="dir-grid">
                  ${SKATE_STANCES.map((s) => {
                    const active = s === feel.skateStance ? 'active' : ''
                    return `<button type="button" class="track-card ${active}" data-feel-stance="${s}">
                      <strong>${t(`menu.ctrlSkate.${s}`)}</strong>
                      <span>${t(`menu.ctrlSkate.${s}.blurb`)}</span>
                    </button>`
                  }).join('')}
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
                  <button type="button" class="track-card ${trickKind === 'skates' ? 'active' : ''}" data-trick-kind="skates">
                    <strong>${t('vehicle.skates')}</strong>
                  </button>
                  <button type="button" class="track-card ${trickKind === 'bike' ? 'active' : ''}" data-trick-kind="bike">
                    <strong>${t('vehicle.bike')}</strong>
                  </button>
                </div>
                <div class="trick-bind-list">${trickRows}</div>
              </div>`
              }
              <button type="button" class="btn-ghost" data-reset-binds style="margin-top:6px">${t('menu.ctrlReset')}</button>
            </div>
          </div>
          ${this.settingsOkNavRow()}
        </div>
      `
      this.bindMuteBar()
      this.bindSettingsOkEsc(this.settingsSubBack)
      this.bindControlFeel()
      this.root.querySelectorAll<HTMLButtonElement>('[data-tx]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const mode = btn.dataset.tx
          if (mode !== 'auto' && mode !== 'manual' && mode !== 'clutch') return
          this.raceApi?.set({ transmission: mode })
          this.render()
        })
      })
      let listen:
        | { kind: 'action'; action: BindAction; slot: 0 | 1 }
        | { kind: 'trick'; letter: string; slot: 0 | 1 }
        | null = null
      const onKey = (e: KeyboardEvent) => {
        if (!listen) return
        e.preventDefault()
        e.stopPropagation()
        const clear = e.code === 'Backspace' || e.code === 'Delete' || e.code === 'Escape'
        if (listen.kind === 'action') {
          if (clear) binds[listen.action][listen.slot] = null
          else binds[listen.action][listen.slot] = e.code
          saveKeyBindings(binds)
        } else {
          const pair = tricks[listen.letter] ?? [null, null]
          if (clear) pair[listen.slot] = null
          else pair[listen.slot] = e.code
          tricks[listen.letter] = pair
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
        this.root.querySelectorAll<HTMLButtonElement>('[data-trick-slot]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const row = btn.closest('[data-trick-letter]') as HTMLElement
            const letter = row?.dataset.trickLetter
            const slot = Number(btn.dataset.trickSlot) as 0 | 1
            if (!letter) return
            listen = { kind: 'trick', letter, slot }
            btn.textContent = '…'
            window.addEventListener('keydown', onKey, true)
          })
        })
      }
      wireTrickKeys()
      this.root.querySelectorAll<HTMLButtonElement>('[data-trick-kind]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const raw = btn.dataset.trickKind
          const next: 'skate' | 'skates' | 'bike' =
            raw === 'bike' ? 'bike' : raw === 'skates' ? 'skates' : 'skate'
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
              const [a, b] = tricks[ch] ?? [null, null]
              return `<div class="bind-row bind-row-trick" data-trick-letter="${ch}">
                <span class="bind-name">${ch} · ${this.escape(name)}</span>
                <button type="button" class="bind-key" data-trick-slot="0">${codeLabel(a)}</button>
                <button type="button" class="bind-key" data-trick-slot="1">${codeLabel(b)}</button>
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
      const board = this.recordsMode
      const scope = this.recordsScope
      const localList = (
        filter ? recordsFor(filter, undefined, board) : recordsFor(undefined, undefined, board)
      ).slice(0, 30)
      const worldList = this.worldRecords
        .filter((e) => {
          if (filter && e.trackId !== filter) return false
          const fs =
            e.vehicle === 'skate' ||
            e.vehicle === 'skates' ||
            e.vehicle === 'bike' ||
            e.vehicle === 'scooter' ||
            e.vehicle === 'rocketScooter' ||
            e.vehicle === 'rocketSkate' ||
            e.vehicle === 'rocketSkates' ||
            e.vehicle === 'rocketBike'
          return board === 'freestyle' ? fs : !fs
        })
        .slice(0, 30)
      const list = scope === 'world' ? worldList : localList
      const modeTabs = `
        <button type="button" class="btn-ghost vehicle-branch-tab ${board === 'race' ? 'active' : ''}" data-rec-mode="race">${t('menu.recordsRace')}</button>
        <button type="button" class="btn-ghost vehicle-branch-tab ${board === 'freestyle' ? 'active' : ''}" data-rec-mode="freestyle">${t('menu.recordsFs')}</button>
      `
      const scopeTabs = `
        <button type="button" class="btn-ghost vehicle-branch-tab ${scope === 'local' ? 'active' : ''}" data-rec-scope="local">${t('menu.recordsLocal')}</button>
        <button type="button" class="btn-ghost vehicle-branch-tab ${scope === 'world' ? 'active' : ''}" data-rec-scope="world">${t('menu.recordsWorld')}</button>
      `
      const filterLabel = filter
        ? this.escape(this.trackName(TRACKS.find((x) => x.id === filter) ?? TRACKS[0]!))
        : t('menu.lbAll')
      const trackOptions = [
        `<button type="button" class="track-card ${!filter ? 'active' : ''}" data-lb="">${t('menu.lbAll')}</button>`,
        ...TRACKS.map((tr) => {
          const active = filter === tr.id ? 'active' : ''
          return `<button type="button" class="track-card ${active}" data-lb="${tr.id}">${this.escape(this.trackName(tr))}</button>`
        }),
      ].join('')
      const empty =
        scope === 'world' && this.worldRecordsLoading
          ? `<li>${t('menu.recordsLoading')}</li>`
          : `<li>${t('menu.recEmpty')}</li>`
      const rows = list
        .map((e, i) => {
          const tr = TRACKS.find((x) => x.id === e.trackId)
          const trackLabel = tr ? this.trackName(tr) : e.trackId
          const laps = Math.max(1, Math.round(Number((e as { laps?: number }).laps) || 1))
          const time =
            board === 'freestyle'
              ? `FS ${e.bestFsScore || 0}${e.bestTrickPts > 0 ? ` · ${e.bestTrickPts.toFixed(1)}` : ''}`
              : e.bestTimeMs > 0
                ? formatTime(e.bestTimeMs)
                : '—'
          const ghost = e.immortal
            ? `<span class="lb-ghost" title="${t('menu.immortalBadge')}" aria-label="${t('menu.immortalBadge')}">👻</span>`
            : `<span class="lb-ghost lb-ghost--off" aria-hidden="true"></span>`
          return `<li class="lb-row ${e.immortal ? 'lb-row-immortal' : ''}">
            <span class="lb-rank">${i + 1}.</span>
            <span class="lb-player">${ghost}${this.escape(e.player)}</span>
            <span class="lb-meta">
              <span class="lb-track">${this.escape(trackLabel)}</span>
              <span class="lb-sep">·</span>
              <span class="lb-vehicle">${this.vehicleLabel(e.vehicle as VehicleKind)}</span>
              <span class="lb-sep">·</span>
              <span class="lb-laps">${laps} ${t('menu.onlineLaps').toLowerCase()}</span>
            </span>
            <span class="lb-time">${time}</span>
          </li>`
        })
        .join('')
      this.root.innerHTML = `
        ${wm}
        ${this.muteBar()}
        <div class="menu-shell menu-home gta-home">
          <header class="gta-home-hero">
            ${brandLockupHtml({ size: 'menu' })}
            <p class="gta-tagline gta-tagline--slot" aria-hidden="true">&nbsp;</p>
          </header>
          <div class="gta-home-scroll menu-panel-body">
            <p class="tune-rules">${scope === 'world' ? t('menu.lbBlurbWorld') : t('menu.lbBlurb')}</p>
            <div class="lb-toolbar">
              <div class="vehicle-branch-tabs">${scopeTabs}</div>
              <div class="vehicle-branch-tabs">${modeTabs}</div>
            </div>
            <details class="lb-track-details">
              <summary class="lb-track-summary">${t('menu.lbTrackFilter')}: <strong>${filterLabel}</strong></summary>
              <div class="lb-tabs">${trackOptions}</div>
            </details>
            <ol class="records-list lb-list">${rows || empty}</ol>
          </div>
          ${this.backRow(this.recordsBack, 'flow')}
        </div>
      `
      this.bindMuteBar()
      this.bindBack(this.recordsBack)
      this.root.querySelectorAll<HTMLButtonElement>('[data-rec-mode]').forEach((btn) => {
        btn.addEventListener('click', () => {
          this.recordsMode = btn.dataset.recMode === 'freestyle' ? 'freestyle' : 'race'
          if (this.recordsScope === 'world') void this.loadWorldRecords()
          else this.render()
        })
      })
      this.root.querySelectorAll<HTMLButtonElement>('[data-rec-scope]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const next = btn.dataset.recScope === 'world' ? 'world' : 'local'
          this.recordsScope = next
          if (next === 'world') void this.loadWorldRecords()
          else this.render()
        })
      })
      this.root.querySelectorAll<HTMLButtonElement>('[data-lb]').forEach((btn) => {
        btn.addEventListener('click', () => {
          this.lbTrackId = btn.dataset.lb || ''
          if (this.recordsScope === 'world') void this.loadWorldRecords()
          else this.render()
        })
      })
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
      // Flat track-grid jako Audio / Atmosphere (jen názvy, bez blurbu / help)
      this.root.innerHTML = `
        ${wm}
        ${this.muteBar()}
        <div class="menu-shell menu-panel menu-panel-dock menu-difficulty">
          <div class="menu-panel-body">
            <p class="tune-rules">${t('menu.difficulty')}</p>
            <div class="track-grid">
              ${DIFFICULTIES.map((d) => {
                const active = d.id === this.selectedDifficulty ? 'active' : ''
                return `<button type="button" class="track-card track-card-photo ${active}" data-diff="${d.id}" style="--card-photo:url('${difficultyArt(d.id)}')">
                  <strong>${t(`diff.${d.id}`)}</strong>
                </button>`
              }).join('')}
            </div>
            <div class="atm-scene-panel">
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
          </div>
          ${this.settingsOkNavRow()}
        </div>
      `
      this.bindMuteBar()
      this.bindSettingsOkEsc(this.settingsSubBack)
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
        <div class="menu-shell menu-panel menu-audio menu-panel-dock">
          <div class="menu-panel-body">
            <p class="tune-rules">${t('menu.audioTrack')}</p>
            <div class="track-grid">
              ${MUSIC_TRACKS.map((m) => {
                const active = m.id === audio.track ? 'active' : ''
                return `<button type="button" class="track-card ${active}" data-music="${m.id}">
                  <strong>${t(m.labelKey)}</strong>
                </button>`
              }).join('')}
            </div>
            <div class="atm-scene-panel">
              <p class="atm-scene-title">${t('menu.audioTitle')}</p>
              <p class="tune-help">${t('menu.audioMenuBlurb')}</p>
              <div class="tune-grid atm-scene-sliders">
                ${this.audioSlider('master', t('menu.audioMaster'), audio.master)}
                ${this.audioSlider('music', t('menu.audioMusic'), audio.music)}
                ${this.audioSlider('sfx', t('menu.audioSfx'), audio.sfx)}
                ${this.audioSlider('menu', t('menu.audioMenu'), audio.menu)}
              </div>
            </div>
          </div>
          ${this.settingsOkNavRow()}
        </div>
      `
      this.bindMuteBar()
      this.bindSettingsOkEsc(this.settingsSubBack)
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
        <div class="menu-shell menu-panel menu-panel-dock">
          <div class="menu-panel-body">
            <p class="tune-rules">${t('menu.atmTone')}</p>
            <div class="track-grid">
              ${toneCards}
            </div>
            ${calendarPacksHtml}
            <p class="tune-rules" style="margin-top:18px">${t('menu.visualQuality')}</p>
            <p class="tune-help">${t('menu.visualQualityBlurb')}</p>
            <p class="tune-help">${t('menu.visualRecommend', {
              q: t(`menu.visual.${lastSuggestedQuality() ?? suggestVisualQuality()}`),
            })}</p>
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
          </div>
          ${this.settingsOkNavRow()}
        </div>
      `
      this.bindMuteBar()
      this.bindSettingsOkEsc(this.settingsSubBack)
      this.bindAtmosphere()
      this.bindVisual()
      return
    }

    if (this.screen === 'champHub') {
      const branches: VehicleBranch[] = ['auto', 'moto', 'monster', 'freestyle']
      if (!branches.includes(this.champBranch)) this.champBranch = 'auto'

      const branchMeta = (b: VehicleBranch) => {
        const live = getActiveCareerForBranch(b)
        const sub = live
          ? live.setupComplete
            ? `${t(`champ.league.${live.league}`)} · S${live.season} · ${championshipProgressLabel(live)}`
            : live.qualified
              ? t('champ.postQualTitle')
              : t('champ.hubNewSeries')
          : t('champ.hubNewSeries')
        const kicker = live?.setupComplete
          ? t('champ.hubLive')
          : live?.qualified
            ? t('champ.postQualTitle')
            : t('champ.hubNewSeries')
        return { live, sub, kicker }
      }

      const liveBranches = branches.filter((b) => branchMeta(b).live)
      if (liveBranches.includes(this.champBranch)) {
        /* keep */
      } else if (liveBranches[0]) {
        this.champBranch = liveBranches[0]
      }

      const hubTone = this.atmosphereApi?.get().tone ?? DEFAULT_ATMOSPHERE.tone
      const branchTiles = branches
        .map((b) => {
          const { live, sub, kicker } = branchMeta(b)
          return `<button type="button" class="gta-tile ${live ? 'gta-tile-live' : ''}" data-champ-branch="${b}" style="--tile:url('${champClassArt(b, hubTone)}')">
            <span class="gta-tile-kicker">${kicker}</span>
            <strong class="gta-tile-label">${t(`menu.branch.${b}`)}</strong>
            <span class="gta-tile-sub">${sub}</span>
          </button>`
        })
        .join('')

      this.root.innerHTML = `
        ${wm}
        ${this.muteBar()}
        <div class="menu-shell menu-home gta-home">
          <header class="gta-home-hero">
            ${brandLockupHtml({ size: 'menu' })}
            <p class="gta-tagline gta-tagline--slot" aria-hidden="true">&nbsp;</p>
          </header>
          <div class="gta-tiles gta-tiles-champ-hub" aria-label="${t('menu.champTile')}">
            ${branchTiles}
          </div>
          ${this.backRow('home', 'flow')}
        </div>
      `
      this.bindMuteBar()
      this.bindBack('home')
      this.root.querySelectorAll<HTMLButtonElement>('[data-champ-branch]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const b = btn.dataset.champBranch as VehicleBranch
          if (!b) return
          this.champBranch = b
          const active = getActiveCareerForBranch(b)
          if (active) {
            this.champCareer = active
            this.champLeague = active.league
            this.champSeason = active.season
            // Rozehrané / zamčené → Cena (pokračovat / zrušit), ne bounce zpět.
            if (active.setupComplete) {
              this.screen = 'champCena'
            } else if (active.qualified && !active.nameChosen) {
              this.screen = 'champPostQual'
            } else if (active.qualified && !active.leagueChosen) {
              this.screen = 'champCena'
            } else if (active.qualified && !active.seriesChosen) {
              this.screen = 'champDiff'
            } else {
              this.screen = 'champStarter'
            }
            this.render()
            return
          }
          this.champSeason = 1
          this.champLeague = 'baby'
          this.screen = 'champStarter'
          this.render()
        })
      })
      return
    }

    if (this.screen === 'champName') {
      const career =
        this.champCareer ?? getActiveCareerForBranch(this.champBranch)
      this.champCareer = career
      if (!career || !career.qualified) {
        this.screen = 'champHub'
        this.render()
        return
      }
      // Po potvrzení obtížnosti jméno nejde měnit.
      if (career.setupComplete || (career.seriesChosen && career.leagueChosen)) {
        this.screen = 'champCena'
        this.render()
        return
      }
      if (!this.champNameDraft) this.champNameDraft = career.playerName ?? ''
      const briefArt = champBriefArt(
        career.branch,
        this.atmosphereApi?.get().tone ?? DEFAULT_ATMOSPHERE.tone,
      )
      this.root.innerHTML = `
        ${wm}
        ${this.muteBar()}
        <div class="menu-shell menu-home gta-home champ-name-screen">
          <header class="gta-home-hero champ-name-hero">
            ${brandLockupHtml({ size: 'menu' })}
            <p class="gta-tagline gta-tagline--slot" aria-hidden="true">&nbsp;</p>
          </header>
          <div class="champ-name-stage" style="--tile:url('${briefArt.featured}')">
            <p class="champ-name-kicker">${t(`menu.branch.${career.branch}`)} · ${t('champ.postQualTitle')}</p>
            <h2 class="champ-name-title">${t('champ.nameTitle')}</h2>
            <label class="champ-name-field">
              <input type="text" class="champ-name-input" maxlength="24" data-champ-name value="${this.escape(this.champNameDraft)}" autocomplete="nickname" spellcheck="false" placeholder="${t('champ.namePlaceholder')}" />
            </label>
          </div>
          ${this.champOkNavRow('data-champ-name-ok', { okLabel: t('menu.next') })}
        </div>
      `
      this.bindMuteBar()
      const nameInput = this.root.querySelector<HTMLInputElement>('[data-champ-name]')
      nameInput?.focus()
      nameInput?.select()
      nameInput?.addEventListener('input', () => {
        this.champNameDraft = nameInput.value
      })
      this.root.querySelector('[data-back]')?.addEventListener('click', () => {
        this.audioApi?.playClick?.()
        this.screen = 'champPostQual'
        this.render()
      })
      const commitName = () => {
        if (!this.champCareer) return
        try {
          assignChampPlayerName(this.champCareer, this.champNameDraft)
          if (!this.champPickLeague) this.champPickLeague = null
          this.screen = 'champCena'
          this.render()
        } catch {
          nameInput?.focus()
        }
      }
      this.root.querySelector('[data-champ-name-ok]')?.addEventListener('click', () => {
        this.audioApi?.playClick?.()
        commitName()
      })
      nameInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          commitName()
        }
      })
      return
    }

    if (this.screen === 'champCena') {
      const b = this.champBranch
      const briefArt = champBriefArt(b, this.atmosphereApi?.get().tone ?? DEFAULT_ATMOSPHERE.tone)
      const draft =
        (this.champCareer && this.champCareer.branch === b
          ? this.champCareer
          : null) ?? getActiveCareerForBranch(b)
      this.champCareer = draft
      // Zamčeno po OK obtížnosti / u rozehrané kariéry — jen pokračovat nebo zrušit.
      const locked = Boolean(
        draft && (draft.setupComplete || (draft.seriesChosen && draft.leagueChosen && draft.nameChosen)),
      )
      const postQualPick = Boolean(
        draft && draft.qualified && draft.nameChosen && !draft.seriesChosen && !draft.setupComplete,
      )

      if (locked && draft) {
        this.champLeague = draft.league
        this.champSeason = draft.season
        const live = draft
        this.root.innerHTML = `
          ${wm}
          ${this.muteBar()}
          <div class="menu-shell menu-home gta-home">
            <header class="gta-home-hero">
              ${brandLockupHtml({ size: 'menu' })}
              <p class="gta-tagline">${this.escape(live.playerName || t(`menu.branch.${b}`))} · ${t(`champ.league.${live.league}`)} · S${live.season}</p>
            </header>
            <div class="gta-tiles gta-tiles-champ-hub gta-tiles-champ-locked" aria-label="${t('champ.cenaTitle')}">
              <button type="button" class="gta-tile gta-tile-live" data-champ-continue style="--tile:url('${briefArt.league}')">
                <span class="gta-tile-kicker">${t('champ.hubLive')}</span>
                <strong class="gta-tile-label">${t('champ.continue')}</strong>
                <span class="gta-tile-sub">${championshipProgressLabel(live)} · ${live.points}b · ${t(`diff.${live.difficulty}`)}</span>
              </button>
              <button type="button" class="gta-tile" data-champ-cancel-cup style="--tile:url('${briefArt.series}')">
                <span class="gta-tile-kicker">${t('champ.restartCareer')}</span>
                <strong class="gta-tile-label">${t('champ.cancelCup')}</strong>
                <span class="gta-tile-sub">${t('champ.cancelCupHint')}</span>
              </button>
            </div>
            ${this.backRow('champHub', 'flow')}
          </div>
        `
        this.bindMuteBar()
        this.bindBack('champHub')
        this.root.querySelector('[data-champ-continue]')?.addEventListener('click', () => {
          this.screen = 'champBrief'
          this.render()
        })
        this.root.querySelector('[data-champ-cancel-cup]')?.addEventListener('click', () => {
          this.showMenuConfirm(t('champ.restartCareerConfirm'), () => {
            wipeBranchCareers(b)
            this.champCareer = null
            this.champPickLeague = null
            this.champPickDiff = null
            this.champNameDraft = ''
            this.champSeason = 1
            this.champLeague = 'baby'
            this.screen = 'champStarter'
            this.render()
          })
        })
        return
      }

      if (!draft) {
        this.screen = 'champHub'
        this.render()
        return
      }
      if (!draft.nameChosen) {
        this.screen = 'champName'
        this.render()
        return
      }
      if (!postQualPick) {
        // Už zamčené / rozjeté — pokračovat, nikdy bounce na hub.
        if (draft.seriesChosen || draft.setupComplete) {
          draft.setupComplete = true
          draft.seriesChosen = true
          draft.leagueChosen = true
          draft.nameChosen = true
          saveCareer(draft)
          this.render()
          return
        }
        this.screen = 'champDiff'
        this.render()
        return
      }

      const cenaTiles = CHAMP_LEAGUES.map((league) => {
        const active = this.champPickLeague === league
        return `<button type="button" class="gta-tile ${active ? 'gta-tile-live gta-tile-picked' : ''}" data-champ-cena="${league}" aria-pressed="${active ? 'true' : 'false'}" style="--tile:url('${champCenaArt(league)}')">
          <span class="gta-tile-kicker">${LEAGUE_LAPS[league]} ${t('champ.lapUnit')}</span>
          <strong class="gta-tile-label">${t(`champ.league.${league}`)}</strong>
          <span class="gta-tile-sub">${active ? t('champ.pickSelected') : `${LEAGUE_LAPS[league]} ${t('champ.lapUnit')}`}</span>
        </button>`
      }).join('')

      this.root.innerHTML = `
        ${wm}
        ${this.muteBar()}
        <div class="menu-shell menu-home gta-home">
          <header class="gta-home-hero">
            ${brandLockupHtml({ size: 'menu' })}
            <p class="gta-tagline">${t(`menu.branch.${b}`)} · ${t('champ.cenaTitle')} · ${t('champ.postQualCena')}</p>
          </header>
          <div class="gta-tiles gta-tiles-champ-hub gta-tiles-champ-cena" aria-label="${t('champ.cenaTitle')}">
            ${cenaTiles}
          </div>
          ${this.champOkNavRow('data-champ-cena-ok', { okLabel: t('menu.next') })}
        </div>
      `
      this.bindMuteBar()
      this.root.querySelector('[data-back]')?.addEventListener('click', () => {
        this.audioApi?.playClick?.()
        this.screen = 'champName'
        this.render()
      })
      this.root.querySelectorAll<HTMLButtonElement>('[data-champ-cena]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const league = btn.dataset.champCena as ChampLeague
          if (!CHAMP_LEAGUES.includes(league)) return
          if (this.champPickLeague === league) return
          this.champPickLeague = league
          // Bez full re-render — jen aktivní dlaždice (arty se znovu nenačítají).
          this.root.querySelectorAll<HTMLButtonElement>('[data-champ-cena]').forEach((b) => {
            const on = b.dataset.champCena === league
            b.classList.toggle('gta-tile-live', on)
            b.classList.toggle('gta-tile-picked', on)
            b.setAttribute('aria-pressed', on ? 'true' : 'false')
            const sub = b.querySelector('.gta-tile-sub')
            if (sub) {
              const L = b.dataset.champCena as ChampLeague
              sub.textContent = on
                ? t('champ.pickSelected')
                : `${LEAGUE_LAPS[L]} ${t('champ.lapUnit')}`
            }
          })
        })
      })
      this.root.querySelector('[data-champ-cena-ok]')?.addEventListener('click', () => {
        this.audioApi?.playClick?.()
        if (!this.champCareer || !this.champPickLeague) return
        try {
          this.champCareer = assignChampLeague(this.champCareer, this.champPickLeague)
          this.champLeague = this.champPickLeague
          this.champSeason = this.champCareer.season
          if (!this.champPickDiff) this.champPickDiff = this.champCareer.difficulty
          this.beginChampSeriesDraft(this.champCareer)
          this.screen = 'champDiff'
          this.render()
        } catch {
          /* ignore */
        }
      })
      return
    }

    if (this.screen === 'champDiff') {
      const career =
        this.champCareer ?? getCareer(this.champBranch, this.champLeague, this.champSeason)
      this.champCareer = career
      if (!career || !career.qualified || !career.nameChosen || !career.leagueChosen) {
        this.screen = !career?.nameChosen ? 'champName' : career?.qualified ? 'champCena' : 'champHub'
        this.render()
        return
      }
      if (career.setupComplete || career.seriesChosen) {
        this.screen = 'champBrief'
        this.render()
        return
      }
      this.beginChampSeriesDraft(career)
      if (!this.champPickDiff) this.champPickDiff = career.difficulty
      const diffTiles = DIFFICULTIES.map((d) => {
        const active = d.id === this.champPickDiff
        return `<button type="button" class="gta-tile ${active ? 'gta-tile-live gta-tile-picked' : ''}" data-champ-diff-tile="${d.id}" aria-pressed="${active ? 'true' : 'false'}" style="--tile:url('${difficultyArt(d.id)}')">
          <span class="gta-tile-kicker">${t('champ.difficulty')}</span>
          <strong class="gta-tile-label">${t(`diff.${d.id}`)}</strong>
          <span class="gta-tile-sub">${active ? t('champ.pickSelectedOk') : t('champ.diffNextSeasonHint')}</span>
        </button>`
      }).join('')
      this.root.innerHTML = `
        ${wm}
        ${this.muteBar()}
        <div class="menu-shell menu-home gta-home">
          <header class="gta-home-hero">
            ${brandLockupHtml({ size: 'menu' })}
            <p class="gta-tagline">${t(`menu.branch.${career.branch}`)} · ${t(`champ.league.${career.league}`)} · ${t('champ.difficulty')}</p>
          </header>
          <div class="gta-tiles gta-tiles-champ-hub gta-tiles-champ-cena gta-tiles-champ-diff" aria-label="${t('champ.difficulty')}">
            ${diffTiles}
          </div>
          ${this.champOkNavRow('data-champ-diff-ok', { hideBack: true })}
        </div>
      `
      this.bindMuteBar()
      this.root.querySelectorAll<HTMLButtonElement>('[data-champ-diff-tile]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = btn.dataset.champDiffTile as DifficultyId
          if (!DIFFICULTIES.some((d) => d.id === id)) return
          if (this.champPickDiff === id) return
          this.champPickDiff = id
          // Bez full re-render — jen aktivní dlaždice.
          this.root.querySelectorAll<HTMLButtonElement>('[data-champ-diff-tile]').forEach((b) => {
            const on = b.dataset.champDiffTile === id
            b.classList.toggle('gta-tile-live', on)
            b.classList.toggle('gta-tile-picked', on)
            b.setAttribute('aria-pressed', on ? 'true' : 'false')
            const sub = b.querySelector('.gta-tile-sub')
            if (sub) {
              sub.textContent = on ? t('champ.pickSelectedOk') : t('champ.diffNextSeasonHint')
            }
          })
        })
      })
      this.root.querySelector('[data-champ-diff-ok]')?.addEventListener('click', () => {
        this.audioApi?.playClick?.()
        if (!this.champCareer || !this.champPickDiff) return
        this.champCareer.difficulty = this.champPickDiff
        this.selectedDifficulty = this.champPickDiff
        this.champCareer.seriesChosen = true
        this.commitChampSeriesDraft()
        markChampSetupComplete(this.champCareer)
        this.champPickDiff = null
        this.champPickLeague = null
        this.screen = 'champBrief'
        this.render()
      })
      return
    }

    if (this.screen === 'champStarter') {
      const order = listUnlockOrder(this.champBranch)
      const budget = CHAMP_START_CASH
      const starters = [...starterVehicles(this.champBranch)].map((k, tileIdx) => {
        const idx = order.indexOf(k)
        const price =
          vehicleBuyPrice(this.champBranch, Math.max(0, idx < 0 ? 0 : idx), this.selectedDifficulty) ??
          15_000
        return { k, price, tileIdx }
      })
      // FS: pevné pořadí dlaždic (ne podle ceny) — skate, BMX, brusle, koloběžka
      if (this.champBranch !== 'freestyle') {
        starters.sort((a, b) => a.price - b.price || a.tileIdx - b.tileIdx)
      }
      const fsFour = this.champBranch === 'freestyle' && starters.length >= 4
      const tileHtml = starters
        .map(({ k, price }, i) => {
          const art = champStarterVehicleArt(k, this.champBranch)
          // Koloběžka / raketová: jen název vozidla, žádný popis (prázdný sub drží výšku)
          const isScooter = k === 'scooter' || k === 'rocketScooter'
          const sub = isScooter
            ? `<span class="gta-tile-sub" aria-hidden="true"></span>`
            : `<span class="gta-tile-sub">${this.escape(`${t(`vehicle.${k}.max`)} · ${t(`vehicle.${k}.invented`)}`)}</span>`
          if (fsFour) {
            return `<div class="gta-tile" style="--tile:url('${art}')">
            <span class="gta-tile-kicker">${t('menu.jet')} · ${this.formatKc(price)}</span>
            <strong class="gta-tile-label">${this.vehicleLabel(k)}</strong>
            ${sub}
            <button type="button" class="menu-start gta-tile-start-btn" data-champ-start-buy="${k}">${t('menu.jet')}</button>
          </div>`
          }
          const side = i === 0 ? 'cheap' : 'pricey'
          return `<div class="gta-tile gta-tile-starter gta-tile-starter--${side}" style="--tile:url('${art}')">
            <span class="gta-tile-kicker">${t('menu.jet')} · ${this.formatKc(price)}</span>
            <strong class="gta-tile-label">${this.vehicleLabel(k)}</strong>
            ${sub}
            <button type="button" class="menu-start gta-tile-start-btn" data-champ-start-buy="${k}">${t('menu.jet')}</button>
          </div>`
        })
        .join('')
      const tilesBlock = fsFour
        ? `<div class="gta-tiles gta-tiles-champ-hub" aria-label="${t('champ.starterTitle')}">${tileHtml}</div>`
        : `<div class="gta-tiles gta-tiles-home3 gta-tiles-setup gta-tiles-champ-starter" aria-label="${t('champ.starterTitle')}">
            <div class="gta-tile-hero gta-tile-jet-split" role="group" aria-label="${t('menu.jet')}">
              ${tileHtml}
            </div>
          </div>`
      this.root.innerHTML = `
        ${wm}
        ${this.muteBar()}
        <div class="menu-shell menu-home gta-home">
          <header class="gta-home-hero">
            ${brandLockupHtml({ size: 'menu' })}
            <p class="gta-tagline champ-starter-budget">${t('champ.cash')} · ${this.formatChampCash(budget)}</p>
            <p class="gta-tagline gta-tagline--soft">${t(`menu.branch.${this.champBranch}`)} · S${this.champSeason} · ${t('champ.starterTitle')}</p>
          </header>
          ${tilesBlock}
          ${this.backRow('champHub', 'flow')}
        </div>
      `
      this.bindMuteBar()
      this.bindBack('champHub')
      const buyStarter = (k: VehicleKind) => {
        if (!starters.some((s) => s.k === k)) return
        if (isScooterTrapKind(k)) {
          this.selectedVehicle = k
          this.bumpScooterTrap()
          return
        }
        try {
          const career = startNewSeason(
            this.champBranch,
            this.champSeason,
            this.selectedDifficulty,
            k,
            this.champLeague,
            this.champPoolPref,
          )
          ensureChampStartCash(career)
          this.champCareer = career
          this.startChampionshipRace()
        } catch {
          this.screen = 'champHub'
          this.render()
        }
      }
      this.root.querySelectorAll<HTMLButtonElement>('[data-champ-start-buy]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation()
          buyStarter(btn.dataset.champStartBuy as VehicleKind)
        })
      })
      return
    }

    if (this.screen === 'champBrief') {
      // Vždy ze save — ať sedí migrace cash 45k / art (ne starý in-memory career).
      const career = getCareer(this.champBranch, this.champLeague, this.champSeason) ?? this.champCareer
      this.champCareer = career
      if (!career) {
        this.screen = 'champCena'
        this.render()
        return
      }
      this.champLeague = career.league
      if (career.done) {
        this.showChampionshipTrophy(career)
        return
      }
      if (career.qualified && !career.setupComplete && !career.nameChosen) {
        this.screen = 'champPostQual'
        this.render()
        return
      }
      if (career.qualified && !career.nameChosen) {
        this.screen = 'champName'
        this.render()
        return
      }
      if (career.qualified && !career.leagueChosen) {
        this.screen = 'champCena'
        this.render()
        return
      }
      if (career.qualified && !career.seriesChosen) {
        this.screen = 'champDiff'
        this.render()
        return
      }
      if (needsChampPostQualSetup(career)) {
        markChampSetupComplete(career)
      }
      this.ensureChampLeagueDefaults(career)
      const brief = champBriefArt(
        career.branch,
        this.atmosphereApi?.get().tone ?? DEFAULT_ATMOSPHERE.tone,
      )
      const qualifying = isChampQualifying(career)
      const roundMeta = qualifying
        ? null
        : championshipRoundMeta(career.round, career.league, career.trackPool, career.season)
      const trackId = championshipTrackId(career)
      const track = trackId ? TRACKS.find((tr) => tr.id === trackId) : null
      const trackLabel = track ? this.trackName(track) : '—'
      const dir = qualifying
        ? t('champ.dirForward')
        : roundMeta?.reverse
          ? t('champ.dirReverse')
          : t('champ.dirForward')
      const progress = championshipProgressLabel(career)
      const leagueLabel = t(`champ.league.${career.league}`)
      const nameBit = career.playerName ? `${this.escape(career.playerName)} · ` : ''
      const raceKicker = qualifying ? t('champ.qualKicker') : t('champ.briefRace')
      const raceSub = qualifying
        ? `${this.escape(trackLabel)} · 1 ${t('menu.onlineLaps').toLowerCase()} · ${this.vehicleLabel(career.vehicle)}`
        : `${this.escape(trackLabel)} · ${dir} · ${this.vehicleLabel(career.vehicle)}`
      this.root.innerHTML = `
        ${wm}
        ${this.muteBar()}
        <div class="menu-shell menu-home gta-home">
          <header class="gta-home-hero">
            ${brandLockupHtml({ size: 'menu' })}
            <p class="gta-tagline">${nameBit}${t(`menu.branch.${career.branch}`)} · ${leagueLabel} · S${career.season} · ${progress}</p>
          </header>
          <div class="gta-tiles gta-tiles-home3 gta-tiles-champ-brief gta-tiles-champ-brief-4">
            <button type="button" class="gta-tile gta-tile-hero" data-champ-jet style="--tile:url('${brief.jet}')">
              <span class="gta-tile-kicker">${raceKicker}</span>
              <strong class="gta-tile-label">${t('menu.jet')}</strong>
              <span class="gta-tile-sub">${raceSub}</span>
            </button>
            <button type="button" class="gta-tile gta-tile-setup" data-champ-pit style="--tile:url('${champPitArt(career.vehicle, career.branch)}')">
              <span class="gta-tile-kicker">${t('champ.cash')}</span>
              <strong class="gta-tile-label">${t('champ.pit')}</strong>
              <span class="gta-tile-sub">${this.formatChampCash(career.cash)} · ${this.vehicleLabel(career.vehicle)}</span>
            </button>
            <button type="button" class="gta-tile gta-tile-setup" data-champ-standings style="--tile:url('${brief.standings}')" ${qualifying ? 'disabled' : ''}>
              <span class="gta-tile-kicker">${career.points}b</span>
              <strong class="gta-tile-label">${t('champ.standingsTile')}</strong>
              <span class="gta-tile-sub">${progress} · ${t(`diff.${career.difficulty}`)}</span>
            </button>
            <button type="button" class="gta-tile gta-tile-setup" data-champ-season style="--tile:url('${brief.season}')" ${qualifying ? 'disabled' : ''}>
              <span class="gta-tile-kicker">S${career.season}</span>
              <strong class="gta-tile-label">${t('champ.seasonTile')}</strong>
              <span class="gta-tile-sub">${t('champ.seasonTileSub')}</span>
            </button>
          </div>
          ${this.backRow('champCena', 'flow')}
        </div>
      `
      this.bindMuteBar()
      this.bindBack('champCena')
      this.root.querySelector('[data-champ-jet]')?.addEventListener('click', () => this.startChampionshipRace())
      this.root.querySelector('[data-champ-pit]')?.addEventListener('click', () => {
        this.resetPitCart(career)
        this.screen = 'champPit'
        this.render()
      })
      this.root.querySelector('[data-champ-standings]')?.addEventListener('click', () => {
        this.screen = 'champStandings'
        this.render()
      })
      this.root.querySelector('[data-champ-season]')?.addEventListener('click', () => {
        this.screen = 'champSeason'
        this.render()
      })
      return
    }

    if (this.screen === 'champSeason') {
      const career = getCareer(this.champBranch, this.champLeague, this.champSeason) ?? this.champCareer
      this.champCareer = career
      if (!career) {
        this.screen = 'champCena'
        this.render()
        return
      }
      const totalRounds = championshipTotalRounds(career.league, career.trackPool, career.season)
      if (this.champCalPreviewRound < 0 || this.champCalPreviewRound >= totalRounds) {
        this.champCalPreviewRound = Math.min(Math.max(0, career.round), Math.max(0, totalRounds - 1))
      }
      const previewMeta = championshipRoundMeta(
        this.champCalPreviewRound,
        career.league,
        career.trackPool,
        career.season,
      )
      const previewTr = previewMeta
        ? TRACKS.find((x) => x.id === previewMeta.trackId) ?? null
        : null
      const previewRes = career.results[this.champCalPreviewRound]
      const rewardChips = [1, 2, 3, 4]
        .map((p) => {
          const cash = placeCash(p, career.difficulty)
          const pts = roundPoints(career.branch, p, 0)
          return `<span class="champ-reward-chip">P${p} · ${pts}b · ${this.formatChampCash(cash)}</span>`
        })
        .join('')
      const listHtml = Array.from({ length: totalRounds }, (_, i) => {
        const meta = championshipRoundMeta(i, career.league, career.trackPool, career.season)
        if (!meta) return ''
        const tr = TRACKS.find((x) => x.id === meta.trackId)
        if (!tr) return ''
        const name = this.trackName(tr)
        const dir = meta.reverse ? t('champ.dirReverse') : t('champ.dirForward')
        const res = career.results[i]
        const current = !career.done && i === career.round
        const done = i < career.round || career.done
        const active = i === this.champCalPreviewRound
        const status = res
          ? `P${res.place} · ${res.pts}b`
          : current
            ? t('champ.standingsNext')
            : done
              ? '—'
              : dir
        const cls = [
          'track-card',
          'track-card-lite',
          'champ-cal-track-card',
          active ? 'active' : '',
          current ? 'is-current' : '',
          done && !current ? 'is-done' : '',
        ]
          .filter(Boolean)
          .join(' ')
        return `<button type="button" class="${cls}" data-champ-cal-round="${i}">
          <span class="champ-cal-card-map" aria-hidden="true">${trackPreviewHtml(tr, meta.reverse)}</span>
          <span class="champ-cal-card-text">
            <strong>${meta.indexLabel} · ${this.escape(name)}</strong>
            <span>${status}</span>
          </span>
        </button>`
      }).join('')
      const previewPane = previewTr && previewMeta
        ? `<div class="tracks-preview-pane champ-cal-preview">
            ${trackPreviewHtml(previewTr, previewMeta.reverse)}
            <div class="track-preview-meta">
              <strong>${previewMeta.indexLabel} · ${this.escape(this.trackName(previewTr))}</strong>
              <span>${this.escape(this.trackBlurb(previewTr))}</span>
            </div>
            <p class="tune-rules">${t('champ.calDirLocked')}: ${
              previewMeta.reverse ? t('champ.dirReverse') : t('champ.dirForward')
            }</p>
            <p class="tune-help">${
              previewRes
                ? `P${previewRes.place} · ${previewRes.pts}b · ${this.formatChampCash(previewRes.cashEarned)}`
                : !career.done && this.champCalPreviewRound === career.round
                  ? t('champ.standingsNext')
                  : t('champ.calBrowseHint')
            }</p>
          </div>`
        : ''
      this.root.innerHTML = `
        ${wm}
        ${this.muteBar()}
        <div class="menu-shell menu-home gta-home menu-champ-cal">
          <header class="gta-home-hero">
            ${brandLockupHtml({ size: 'menu' })}
            <p class="gta-tagline">${t('champ.calendar')} · S${career.season} · ${t(`champ.league.${career.league}`)}</p>
          </header>
          <div class="gta-home-scroll menu-panel-body champ-cal-body" style="--tile:url('${champSeasonArt()}')">
            <div class="champ-reward-strip" aria-label="${t('champ.seasonRewardsHint')}">${rewardChips}</div>
            <div class="tracks-layout">
              <div class="tracks-list champ-cal-list-scroll">${listHtml}</div>
              ${previewPane}
            </div>
          </div>
          ${this.champOkNavRow('data-champ-season-ok')}
        </div>
      `
      this.bindMuteBar()
      this.root.querySelector('[data-champ-season-ok]')?.addEventListener('click', () => {
        this.audioApi?.playClick?.()
        this.screen = 'champBrief'
        this.render()
      })
      this.root.querySelector('[data-back]')?.addEventListener('click', () => {
        this.audioApi?.playClick?.()
        this.screen = 'champBrief'
        this.render()
      })
      this.root.querySelectorAll<HTMLButtonElement>('[data-champ-cal-round]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const idx = Number(btn.dataset.champCalRound)
          if (!Number.isFinite(idx)) return
          const scroll = this.savePanelScroll()
          this.champCalPreviewRound = idx
          this.render()
          this.restorePanelScroll(scroll)
        })
      })
      return
    }

    if (this.screen === 'champPostQual') {
      const b = this.champBranch
      const briefArt = champBriefArt(b, this.atmosphereApi?.get().tone ?? DEFAULT_ATMOSPHERE.tone)
      const career =
        (this.champCareer && this.champCareer.branch === b
          ? this.champCareer
          : null) ?? getActiveCareerForBranch(b)
      this.champCareer = career
      if (!career || !career.qualified) {
        this.screen = 'champHub'
        this.render()
        return
      }
      if (career.setupComplete) {
        this.screen = 'champCena'
        this.render()
        return
      }
      if (career.nameChosen) {
        this.screen = career.leagueChosen
          ? career.seriesChosen
            ? 'champBrief'
            : 'champDiff'
          : 'champCena'
        this.render()
        return
      }
      this.root.innerHTML = `
        ${wm}
        ${this.muteBar()}
        <div class="menu-shell menu-home gta-home">
          <header class="gta-home-hero">
            ${brandLockupHtml({ size: 'menu' })}
            <p class="gta-tagline">${t(`menu.branch.${b}`)} · ${t('champ.postQualTitle')}</p>
          </header>
          <p class="tune-help champ-diff-banner" style="text-align:center;margin:0 12px 10px">${t('champ.postQualHint')}</p>
          <div class="gta-tiles gta-tiles-champ-hub gta-tiles-champ-locked" aria-label="${t('champ.postQualTitle')}">
            <button type="button" class="gta-tile gta-tile-live" data-postqual-continue style="--tile:url('${briefArt.jet}')">
              <span class="gta-tile-kicker">${t('champ.postQualTitle')}</span>
              <strong class="gta-tile-label">${t('champ.postQualContinue')}</strong>
              <span class="gta-tile-sub">${t('champ.postQualContinueSub')}</span>
            </button>
            <button type="button" class="gta-tile" data-postqual-cancel style="--tile:url('${briefArt.series}')">
              <span class="gta-tile-kicker">${t('champ.restartCareer')}</span>
              <strong class="gta-tile-label">${t('champ.cancelCup')}</strong>
              <span class="gta-tile-sub">${t('champ.cancelCupHint')}</span>
            </button>
          </div>
          ${this.backRow('champHub', 'flow')}
        </div>
      `
      this.bindMuteBar()
      this.bindBack('champHub')
      this.root.querySelector('[data-postqual-continue]')?.addEventListener('click', () => {
        this.champNameDraft = career.playerName ?? ''
        this.screen = 'champName'
        this.render()
      })
      this.root.querySelector('[data-postqual-cancel]')?.addEventListener('click', () => {
        this.showMenuConfirm(t('champ.restartCareerConfirm'), () => {
          wipeBranchCareers(b)
          this.champCareer = null
          this.champPickLeague = null
          this.champPickDiff = null
          this.champNameDraft = ''
          this.champSeason = 1
          this.champLeague = 'baby'
          this.screen = 'champStarter'
          this.render()
        })
      })
      return
    }

    if (this.screen === 'champLeague') {
      // Cena se nemění v sezóně — UI výběru zrušeno.
      this.screen = 'champBrief'
      this.render()
      return
    }

    if (this.screen === 'champStandings') {
      const career = getCareer(this.champBranch, this.champLeague, this.champSeason) ?? this.champCareer
      this.champCareer = career
      if (!career) {
        this.screen = 'champCena'
        this.render()
        return
      }
      const dp = career.driverPoints ?? [career.points, 0, 0, 0]
      const entries = [
        { name: career.playerName || t('champ.nameTitle'), pts: dp[0]!, me: true },
        { name: CHAMP_RIVAL_NAMES[0], pts: dp[1]!, me: false },
        { name: CHAMP_RIVAL_NAMES[1], pts: dp[2]!, me: false },
        { name: CHAMP_RIVAL_NAMES[2], pts: dp[3]!, me: false },
      ].sort((a, b) => b.pts - a.pts || (a.me === b.me ? 0 : a.me ? -1 : 1))
      const rows = entries
        .map(
          (e, i) => `<li class="champ-f1-row ${e.me ? 'is-me' : ''}">
          <span class="champ-f1-pos">${i + 1}</span>
          <span class="champ-f1-name">${this.escape(e.name)}</span>
          <span class="champ-f1-pts">${e.pts}</span>
        </li>`,
        )
        .join('')
      this.root.innerHTML = `
        ${wm}
        ${this.muteBar()}
        <div class="menu-shell menu-home gta-home">
          <header class="gta-home-hero">
            ${brandLockupHtml({ size: 'menu' })}
            <p class="gta-tagline">${t('champ.standingsTile')} · S${career.season}</p>
          </header>
          <div class="gta-home-scroll champ-pit-body menu-panel-body champ-standings-body" style="--tile:url('${champStandingsArt()}')">
            <p class="tune-help">${t('champ.standingsHint')}</p>
            <ol class="champ-f1-standings">${rows}</ol>
          </div>
          ${this.champOkNavRow('data-champ-standings-ok')}
        </div>
      `
      this.bindMuteBar()
      this.root.querySelector('[data-champ-standings-ok]')?.addEventListener('click', () => {
        this.audioApi?.playClick?.()
        this.screen = 'champBrief'
        this.render()
      })
      this.root.querySelector('[data-back]')?.addEventListener('click', () => {
        this.audioApi?.playClick?.()
        this.screen = 'champBrief'
        this.render()
      })
      return
    }

    if (this.screen === 'champSeries') {
      // Starý accordion → dlaždice jako Cena.
      this.screen = 'champDiff'
      this.render()
      return
    }

    if (this.screen === 'champPit') {
      const career = getCareer(this.champBranch, this.champLeague, this.champSeason) ?? this.champCareer
      this.champCareer = career
      if (!career) {
        this.screen = 'champHub'
        this.render()
        return
      }
      if (!this.pitCartTune) this.resetPitCart(career)
      const draftTune = this.pitCartTune ?? { ...career.tuning }
      const order = listUnlockOrder(career.branch)
      const shopDisplay = sortKindsBySpeedDesc(order)
      const nextLocked = order.find((k) => !career.unlocked.includes(k))
      const trapShop: VehicleKind[] =
        career.branch === 'freestyle' ? ['scooter', 'rocketScooter'] : []
      if (
        !this.champPitPreview ||
        (!order.includes(this.champPitPreview) && !isScooterTrapKind(this.champPitPreview))
      ) {
        this.champPitPreview = career.vehicle
      }
      const previewKind = this.champPitPreview
      const cart = this.pitCartSummary(career, draftTune, this.pitCartBuy)
      const shopRows = shopDisplay
        .map((k) => {
          const i = order.indexOf(k)
          const owned = career.unlocked.includes(k)
          const price = vehicleBuyPrice(career.branch, i, career.difficulty)
          const isNext = nextLocked === k
          const check = isNext ? canBuy(career, k) : null
          const previewOn = previewKind === k ? 'is-preview' : ''
          const inCart = this.pitCartBuy === k
          const priceLabel = owned
            ? t('champ.shopOwned')
            : price != null
              ? this.formatKc(price)
              : '—'
          const state = owned ? 'is-owned' : isNext ? 'is-next' : 'is-locked'
          const buyBtn =
            isNext && check?.ok
              ? `<button type="button" class="btn-ghost ${inCart ? 'active' : ''}" data-champ-cart-buy="${k}">${inCart ? t('champ.cartQueued') : t('champ.addToCart')}</button>`
              : isNext && check?.reason === 'insufficient_cash'
                ? `<span class="tune-help">${t('champ.cantAfford')}</span>`
                : ''
          return `<div class="champ-shop-row ${state} ${previewOn}" data-champ-preview="${k}" role="button" tabindex="0">
                  <div>
                    <strong>${this.vehicleLabel(k)}</strong>
                    <span>${priceLabel}${isNext && !owned ? ` · ${t('champ.shopNext')}` : ''}${!owned ? ` · ${t('champ.shopPreview')}` : ''}</span>
                  </div>
                  ${buyBtn}
                </div>`
        })
        .join('')
      const trapRows = trapShop
        .map((k) => {
          const previewOn = previewKind === k ? 'is-preview' : ''
          const inCart = this.pitCartBuy === k
          return `<div class="champ-shop-row is-next ${previewOn}" data-champ-preview="${k}" role="button" tabindex="0">
                  <div>
                    <strong>${this.vehicleLabel(k)}</strong>
                  </div>
                  <button type="button" class="btn-ghost ${inCart ? 'active' : ''}" data-champ-cart-buy="${k}">${inCart ? t('champ.cartQueued') : t('champ.addToCart')}</button>
                </div>`
        })
        .join('')
      const catalog = `<div class="champ-shop-list">${shopRows}${trapRows}</div>`
      const vehiclePick = sortKindsBySpeedDesc(career.unlocked)
        .map((k) => {
          const active = k === career.vehicle ? 'active' : ''
          return `<button type="button" class="track-card ${active}" data-champ-veh="${k}">${this.vehicleLabel(k)}</button>`
        })
        .join('')
      const sliders = TUNE_KEYS.map((key) => {
        const base = career.tuning[key]
        const val = draftTune[key]
        const upCost =
          val > base
            ? tuningUpgradeCost(val, career.difficulty, base, career.vehicle, career.branch)
            : 0
        const costBit = upCost > 0 ? ` · ${this.formatKc(upCost)}` : ''
        return `<label class="tune-row">
          <span class="tune-label">${t(`menu.${key}`)} <span class="tune-val">${val}</span>${costBit}</span>
          <input type="range" min="0" max="${CHAMP_TUNING_MAX}" step="1" value="${val}" data-champ-tune="${key}" />
        </label>`
      }).join('')
      const previewOwned = career.unlocked.includes(previewKind)
      const cartLines =
        cart.lines.length === 0
          ? `<p class="tune-help">${t('champ.cartEmpty')}</p>`
          : `<ul class="champ-cart-lines">${cart.lines
              .map((l) => `<li>${this.escape(l)}</li>`)
              .join('')}</ul>`
      if (this.pitAccordionOpen == null) this.pitAccordionOpen = 'shop'
      const pitAcc = [
        this.menuAccordionBlock({
          id: 'shop',
          open: this.pitAccordionOpen,
          title: t('champ.shopTitle'),
          meta: nextLocked ? this.vehicleLabel(nextLocked) : t('champ.shopOwned'),
          active: this.pitAccordionOpen === 'shop',
          body: catalog,
        }),
        this.menuAccordionBlock({
          id: 'garage',
          open: this.pitAccordionOpen,
          title: t('champ.selectVehicle'),
          meta: this.vehicleLabel(career.vehicle),
          active: this.pitAccordionOpen === 'garage',
          body: `<div class="dir-grid">${vehiclePick}</div>`,
        }),
        this.menuAccordionBlock({
          id: 'tune',
          open: this.pitAccordionOpen,
          title: t('menu.tuning'),
          meta: `${Object.values(draftTune).reduce((a, b) => a + b, 0)} / ${TUNE_KEYS.length * CHAMP_TUNING_MAX}`,
          active: this.pitAccordionOpen === 'tune',
          body: `<div class="tune-stack">${sliders}</div>`,
        }),
      ].join('')
      this.root.innerHTML = `
        ${wm}
        ${this.muteBar()}
        <div class="menu-shell menu-home gta-home">
          <header class="gta-home-hero">
            ${brandLockupHtml({ size: 'menu' })}
            <p class="gta-tagline">${t('champ.pitTitle')} · ${this.formatChampCash(career.cash)}</p>
          </header>
          <div class="gta-home-scroll">
            <div class="champ-pit-layout">
              <div class="champ-pit-stage vehicle-stage">
                <canvas id="vehicle-preview" class="vehicle-preview-canvas"></canvas>
                <p class="tune-help">${t('menu.vehicleDrag')}</p>
                <div class="track-preview-meta">
                  <strong>${this.vehicleLabel(previewKind)}</strong>
                  <span>${previewOwned ? t('champ.shopOwned') : t('champ.shopPreview')}</span>
                </div>
                ${
                  vehicleHasRider(previewKind)
                    ? this.paintRowHtml(
                        'rider',
                        t('menu.riderPick'),
                        this.selectedRider,
                        NEON_COLOR_CHOICES,
                        true,
                        { stepPlus: true },
                      )
                    : ''
                }
              </div>
              <div class="champ-pit-body menu-panel-body">
                <div class="menu-accordion menu-accordion-stack">${pitAcc}</div>
                <div class="champ-cart" data-champ-cart style="margin-top:14px">
                  <p class="atm-scene-title">${t('champ.cartTitle')}</p>
                  <div data-cart-lines>${cartLines}</div>
                  <p class="champ-cart-total">${t('champ.cartTotal')}: <strong>${this.formatKc(cart.total)}</strong>
                    · ${t('champ.cartRemain')}: <strong>${this.formatChampCash(Math.max(0, career.cash - cart.total))}</strong></p>
                  <div class="champ-cart-actions">
                    <button type="button" class="btn-ghost" data-champ-cart-confirm ${cart.total <= 0 || cart.total > career.cash ? 'disabled' : ''}>${t('champ.cartConfirm')}</button>
                    <button type="button" class="btn-ghost" data-champ-cart-clear ${cart.total <= 0 && !this.pitCartBuy ? 'disabled' : ''}>${t('champ.cartClear')}</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
          ${this.champOkNavRow('data-champ-pit-ok')}
        </div>
      `
      this.bindMuteBar()
      this.root.querySelector('[data-champ-pit-ok]')?.addEventListener('click', () => {
        this.audioApi?.playClick?.()
        // OK bez košíku = odejít; nákup jen přes Potvrdit nákup
        this.champPitPreview = null
        if (this.champCareer) this.resetPitCart(this.champCareer)
        this.screen = 'champBrief'
        this.render()
      })
      this.root.querySelector('[data-back]')?.addEventListener('click', () => {
        this.audioApi?.playClick?.()
        this.champPitPreview = null
        if (this.champCareer) this.resetPitCart(this.champCareer)
        this.screen = 'champBrief'
        this.render()
      })
      const canvas = this.root.querySelector<HTMLCanvasElement>('#vehicle-preview')
      if (canvas) {
        this.vehiclePreview = new VehiclePreview(canvas)
        this.vehiclePreview.setVehicle(previewKind, this.currentLook())
      }
      this.bindPaintPickers()
      this.root.querySelectorAll<HTMLButtonElement>('[data-champ-cart-buy]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation()
          const k = btn.dataset.champCartBuy as VehicleKind
          if (!k) return
          this.pitCartBuy = this.pitCartBuy === k ? null : k
          this.render()
        })
      })
      this.root.querySelector('[data-champ-cart-confirm]')?.addEventListener('click', () => {
        this.commitPitCart()
      })
      this.root.querySelector('[data-champ-cart-clear]')?.addEventListener('click', () => {
        if (!this.champCareer) return
        this.resetPitCart(this.champCareer)
        this.render()
      })
      const setPreview = (k: VehicleKind) => {
        this.champPitPreview = k
        this.render()
      }
      this.root.querySelectorAll<HTMLElement>('[data-champ-preview]').forEach((row) => {
        const pick = () => {
          const k = row.dataset.champPreview as VehicleKind
          if (k) setPreview(k)
        }
        row.addEventListener('click', (e) => {
          if ((e.target as HTMLElement).closest('[data-champ-cart-buy]')) return
          pick()
        })
        row.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            pick()
          }
        })
      })
      this.root.querySelectorAll<HTMLButtonElement>('[data-champ-veh]').forEach((btn) => {
        btn.addEventListener('click', () => {
          if (!this.champCareer) return
          const k = btn.dataset.champVeh as VehicleKind
          if (this.champCareer.unlocked.includes(k)) {
            this.champCareer.vehicle = k
            this.champPitPreview = k
            saveCareer(this.champCareer)
            this.render()
          }
        })
      })
      this.root.querySelectorAll<HTMLInputElement>('[data-champ-tune]').forEach((input) => {
        const refreshCartUi = () => {
          if (!this.champCareer || !this.pitCartTune) return
          const key = input.dataset.champTune as keyof PlayerTuningValues
          const target = Number(input.value)
          if (!Number.isFinite(target)) return
          const clamped = Math.max(0, Math.min(CHAMP_TUNING_MAX, Math.round(target)))
          this.pitCartTune = { ...this.pitCartTune, [key]: clamped }
          const label = input.parentElement?.querySelector('.tune-val')
          if (label) label.textContent = String(clamped)
          const base = this.champCareer.tuning[key]
          const costBit =
            clamped > base
              ? ` · ${this.formatKc(tuningUpgradeCost(clamped, this.champCareer.difficulty, base, this.champCareer.vehicle, this.champCareer.branch))}`
              : ''
          const lab = input.parentElement?.querySelector('.tune-label')
          if (lab) {
            lab.innerHTML = `${t(`menu.${key}`)} <span class="tune-val">${clamped}</span>${costBit}`
          }
          const cartEl = this.root.querySelector('[data-champ-cart]')
          if (!cartEl) return
          const summary = this.pitCartSummary(this.champCareer, this.pitCartTune, this.pitCartBuy)
          const linesHost = cartEl.querySelector('[data-cart-lines]')
          if (linesHost) {
            linesHost.innerHTML =
              summary.lines.length === 0
                ? `<p class="tune-help">${t('champ.cartEmpty')}</p>`
                : `<ul class="champ-cart-lines">${summary.lines
                    .map((l) => `<li>${this.escape(l)}</li>`)
                    .join('')}</ul>`
          }
          const totalP = cartEl.querySelector('.champ-cart-total')
          if (totalP) {
            totalP.innerHTML = `${t('champ.cartTotal')}: <strong>${this.formatKc(summary.total)}</strong>
                  · ${t('champ.cartRemain')}: <strong>${this.formatChampCash(Math.max(0, this.champCareer.cash - summary.total))}</strong>`
          }
          const conf = cartEl.querySelector<HTMLButtonElement>('[data-champ-cart-confirm]')
          if (conf) conf.disabled = summary.total <= 0 || summary.total > this.champCareer.cash
          const clear = cartEl.querySelector<HTMLButtonElement>('[data-champ-cart-clear]')
          if (clear) clear.disabled = summary.total <= 0 && !this.pitCartBuy
        }
        input.addEventListener('input', refreshCartUi)
        input.addEventListener('change', refreshCartUi)
      })
      this.bindMenuAccordionToggle((id) => {
        const next = id as 'shop' | 'garage' | 'tune'
        this.pitAccordionOpen = this.pitAccordionOpen === next ? null : next
      })
      return
    }

    if (this.screen === 'champTrophy') {
      const career = this.champCareer
      const info = this.champSeasonCompleteInfo
      if (!career || !info) {
        this.screen = 'home'
        this.render()
        return
      }
      const consolation = Boolean(career.consolation)
      const tier = consolation ? 4 : seasonPodiumRank(career)
      const nextSeason = info.nextSeason
      const nextCareer =
        nextSeason != null ? getCareer(career.branch, career.league, nextSeason) : null
      const conquered = Boolean(info.conquered)
      const cup = champBriefArt()
      const celebrate = !consolation && (conquered || tier <= 2)
      const sprayN = celebrate ? (conquered || tier === 1 ? 28 : tier === 2 ? 16 : 0) : 0
      const spray = sprayN
        ? `<div class="trophy-spray" aria-hidden="true">${Array.from({ length: sprayN }, (_, i) => {
            const ang = (i / sprayN) * Math.PI * 2
            const dist = 110 + (i % 6) * 18
            const dx = Math.round(Math.cos(ang) * dist)
            const dy = Math.round(Math.sin(ang) * dist * 0.65 - 50)
            return `<span class="trophy-foam" style="--i:${i};--dx:${dx}px;--dy:${dy}px"></span>`
          }).join('')}</div>`
        : ''
      const resultRows = career.results
        .map((r, i) => {
          const tr = TRACKS.find((x) => x.id === r.trackId)
          const name = tr ? this.trackName(tr) : r.trackId
          const dir = r.reverse ? t('champ.dirReverse') : t('champ.dirForward')
          return `<tr>
            <td>${i + 1}</td>
            <td>${this.escape(name)} · ${dir}</td>
            <td>P${r.place}</td>
            <td>+${r.pts}</td>
            <td>${this.formatKc(r.cashEarned)}</td>
          </tr>`
        })
        .join('')
      const title = consolation
        ? t('champ.consolationTitle')
        : conquered
          ? t('champ.conquerTitle')
          : t('champ.trophyCup')
      const blurb = consolation
        ? t('champ.consolationBlurb')
        : conquered
          ? t('champ.conquerBody')
          : t(`champ.podium.${tier}`)
      const nextBtn =
        nextCareer && !nextCareer.done
          ? `<button type="button" class="btn-ghost menu-tune-btn" data-champ-next-season>${t('champ.nextSeason')}</button>`
          : consolation
            ? `<button type="button" class="btn-ghost menu-tune-btn" data-champ-restart>${t('champ.againS1')}</button>`
            : ''
      this.root.innerHTML = `
        ${wm}
        ${this.muteBar()}
        <div class="menu-shell menu-home gta-home">
          <header class="gta-home-hero">
            ${brandLockupHtml({ size: 'menu' })}
            <p class="gta-tagline">${t(`menu.branch.${career.branch}`)} · S${career.season} · ${t(`champ.league.${career.league}`)}</p>
          </header>
          <div class="gta-home-scroll">
            <div class="champ-trophy champ-trophy--tier${tier}${celebrate ? ' champ-trophy--celebrate' : ''}${consolation ? ' champ-trophy--consolation' : ''}${conquered ? ' champ-trophy--conquer' : ''}">
              <div class="champ-trophy-hero" style="--tile:url('${cup.cup}')">
                ${spray}
                ${
                  consolation
                    ? ''
                    : `<div class="trophy-podium" aria-hidden="true">
                  <span class="trophy-step trophy-step--2"></span>
                  <span class="trophy-step trophy-step--1"></span>
                  <span class="trophy-step trophy-step--3"></span>
                </div>
                <div class="trophy-bottles" aria-hidden="true">
                  <span class="trophy-bottle trophy-bottle--l"></span>
                  <span class="trophy-bottle trophy-bottle--r"></span>
                </div>`
                }
                <div class="champ-trophy-hero-copy">
                  <span class="gta-tile-kicker">${consolation ? t('champ.consolationKicker') : conquered ? t('diff.superHard') : t('champ.trophyParade')}</span>
                  ${consolation || conquered ? '' : `<span class="trophy-tier-badge">T${tier}</span>`}
                  <strong class="champ-trophy-title">${title}</strong>
                  <p class="champ-trophy-tier">${blurb}</p>
                  ${
                    celebrate && !conquered
                      ? `<p class="champ-trophy-champagne">${t('champ.trophyChampagne')}</p>`
                      : ''
                  }
                  ${
                    consolation
                      ? `<p class="champ-trophy-champagne">${t('vehicle.scooter')} · ${t('champ.consolationPrize')}</p>`
                      : ''
                  }
                </div>
              </div>
              <div class="champ-trophy-rewards">
                <div class="champ-reward-card">
                  <span>${t('champ.points')}</span>
                  <strong>${career.points}</strong>
                </div>
                <div class="champ-reward-card">
                  <span>${t('champ.trophyPurse')}</span>
                  <strong>${this.formatKc(info.purse)}</strong>
                </div>
                <div class="champ-reward-card">
                  <span>${t('champ.trophyCarry')}</span>
                  <strong>${this.formatKc(info.cashCarry)}</strong>
                </div>
                <div class="champ-reward-card">
                  <span>${t('champ.cash')}</span>
                  <strong>${this.formatChampCash(career.cash)}</strong>
                </div>
              </div>
              <div class="champ-trophy-table-wrap">
                <table class="champ-trophy-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>${t('champ.track')}</th>
                      <th>${t('champ.placeCol')}</th>
                      <th>${t('champ.points')}</th>
                      <th>${t('champ.cash')}</th>
                    </tr>
                  </thead>
                  <tbody>${resultRows || `<tr><td colspan="5">—</td></tr>`}</tbody>
                </table>
              </div>
              <div class="champ-trophy-actions">
                ${nextBtn}
                ${
                  conquered
                    ? `<button type="button" class="menu-start" data-champ-home>${t('champ.conquerMenu')}</button>`
                    : `<button type="button" class="btn-ghost" data-champ-restart>${t('champ.classesTile')}</button>
                <button type="button" class="btn-ghost" data-champ-home>${t('champ.home')}</button>`
                }
              </div>
            </div>
          </div>
          ${this.backRow('home', 'flow')}
        </div>
      `
      this.bindMuteBar()
      this.bindBack('home')
      this.root.querySelector('[data-champ-home]')?.addEventListener('click', () => {
        this.champSeasonCompleteInfo = null
        this.champTrophyCareerKey = ''
        this.screen = 'home'
        this.render()
      })
      this.root.querySelector('[data-champ-next-season]')?.addEventListener('click', () => {
        this.champSeasonCompleteInfo = null
        this.champTrophyCareerKey = ''
        this.champBranch = career.branch
        this.champLeague = career.league
        if (nextSeason == null || !nextCareer) return
        this.champSeason = nextSeason
        this.champCareer = nextCareer
        this.screen = 'champBrief'
        this.render()
      })
      this.root.querySelector('[data-champ-restart]')?.addEventListener('click', () => {
        this.champSeasonCompleteInfo = null
        this.champTrophyCareerKey = ''
        this.champBranch = career.branch
        this.champSeason = 1
        this.screen = 'champHub'
        this.render()
      })
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
        <div class="menu-shell menu-panel menu-online menu-panel-dock">
          <div class="menu-panel-body">
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
              <p class="tune-rules" style="margin-top:10px">${t('menu.onlineLaps')}</p>
              <div class="lap-stepper" role="group" aria-label="${t('menu.onlineLaps')}">
                <button type="button" class="btn-ghost lap-step" data-host-laps-delta="-1" aria-label="-">−</button>
                <input type="number" class="lap-step-input" min="${RACE_LAP_MIN}" max="${RACE_LAP_MAX}" step="1" value="${this.hostLaps}" data-host-laps-input inputmode="numeric" />
                <button type="button" class="btn-ghost lap-step" data-host-laps-delta="1" aria-label="+">+</button>
              </div>
              <button type="button" class="menu-start" id="btn-host" style="margin-top:12px">${t('menu.onlineCreate')}</button>
            </section>
            <details class="online-advanced">
              <summary>${t('menu.onlineConn')}</summary>
              ${this.onlineBlock()}
              <button type="button" class="btn-ghost" id="btn-join" style="margin-top:8px">${t('menu.join')} (${t('menu.roomCode')})</button>
            </details>
            ${this.lobbyError || ob.error ? `<p class="menu-error">${this.escape(this.lobbyError || ob.error)}</p>` : ''}
          </div>
          ${this.backRow('raceSetup', 'flow')}
        </div>
      `
      this.bindMuteBar()
      this.bindBack('raceSetup')
      this.root.querySelector('#player-name')?.addEventListener('change', () => {
        this.readFields()
        this.onBrowseOnline?.()
      })
      this.root.querySelectorAll<HTMLButtonElement>('[data-host-track]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const next = btn.dataset.hostTrack || this.selectedTrackId
          if (next === this.selectedTrackId) return
          this.selectedTrackId = next
          // Jen přepnout active třídu — bez full re-render (scroll by skákal).
          this.root.querySelectorAll<HTMLButtonElement>('[data-host-track]').forEach((b) => {
            b.classList.toggle('active', b.dataset.hostTrack === this.selectedTrackId)
          })
        })
      })
      this.bindLapStepper({
        get: () => this.hostLaps,
        set: (n) => {
          this.hostLaps = n
          const input = this.root.querySelector<HTMLInputElement>('[data-host-laps-input]')
          if (input && input.value !== String(n)) input.value = String(n)
        },
        deltaAttr: 'data-host-laps-delta',
        inputAttr: 'data-host-laps-input',
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

  private currentLook(): VehicleLook {
    const freestyle = vehicleBranch(this.selectedVehicle) === 'freestyle'
    return {
      body: this.selectedColor,
      neon: freestyle ? COLOR_NONE : this.selectedNeon,
      wheel: this.selectedWheel,
      rider: this.selectedRider,
      helm: this.selectedHelm,
    }
  }

  private paintRowHtml(
    kind: 'color' | 'neon' | 'wheel' | 'rider' | 'helm',
    label: string,
    selected: number,
    choices: readonly number[],
    allowNone: boolean,
    step?: { stepMinus?: boolean; stepPlus?: boolean },
  ): string {
    const minus = step?.stepMinus
      ? `<button type="button" class="paint-step-btn" data-paint-step="${kind}" data-paint-dir="-1" aria-label="-">−</button>`
      : ''
    const plus = step?.stepPlus
      ? `<button type="button" class="paint-step-btn" data-paint-step="${kind}" data-paint-dir="1" aria-label="+">+</button>`
      : ''
    return `<p class="tune-rules">${label}</p>
      <div class="color-grid ${step ? 'color-grid--step' : ''}">
        ${minus}
        ${allowNone ? this.colorSwatchHtml(kind, COLOR_NONE, selected) : ''}
        ${choices.map((c) => this.colorSwatchHtml(kind, c, selected)).join('')}
        <label class="color-rgb" title="${t('menu.colorRgb')}">
          <input type="color" id="${kind}-rgb" value="${selected < 0 ? '#c62828' : '#' + selected.toString(16).padStart(6, '0')}" />
        </label>
        ${plus}
      </div>`
  }

  private bindPaintPickers(): void {
    const slots: Array<{
      key: 'color' | 'neon' | 'wheel' | 'rider' | 'helm'
      get: () => number
      set: (v: number) => void
      apply: (v: number) => void
      fallback: number
    }> = [
      {
        key: 'color',
        get: () => this.selectedColor,
        set: (v) => {
          this.selectedColor = v
        },
        apply: (v) => this.vehiclePreview?.setColor(v),
        fallback: PLAYER_COLOR_CHOICES[0]!,
      },
      {
        key: 'neon',
        get: () => this.selectedNeon,
        set: (v) => {
          this.selectedNeon = v
        },
        apply: (v) => this.vehiclePreview?.setNeon(v),
        fallback: NEON_COLOR_CHOICES[0]!,
      },
      {
        key: 'wheel',
        get: () => this.selectedWheel,
        set: (v) => {
          this.selectedWheel = v
        },
        apply: (v) => this.vehiclePreview?.setWheelColor(v),
        fallback: DEFAULT_VEHICLE_LOOK.wheel,
      },
      {
        key: 'rider',
        get: () => this.selectedRider,
        set: (v) => {
          this.selectedRider = v
        },
        apply: (v) => this.vehiclePreview?.setRiderColor(v),
        fallback: DEFAULT_VEHICLE_LOOK.rider,
      },
      {
        key: 'helm',
        get: () => this.selectedHelm,
        set: (v) => {
          this.selectedHelm = v
        },
        apply: (v) => this.vehiclePreview?.setHelmColor(v),
        fallback: DEFAULT_VEHICLE_LOOK.helm,
      },
    ]
    for (const slot of slots) {
      const sync = () => {
        this.root.querySelectorAll<HTMLButtonElement>(`[data-${slot.key}]`).forEach((b) => {
          b.classList.toggle('active', Number(b.dataset[slot.key]) === slot.get())
        })
      }
      this.root.querySelectorAll<HTMLButtonElement>(`[data-${slot.key}]`).forEach((btn) => {
        btn.addEventListener('click', () => {
          let v = Number(btn.dataset[slot.key])
          if (Number.isNaN(v)) v = slot.fallback
          slot.set(v)
          if (this.vehiclePreview) {
            slot.apply(v)
            sync()
          } else {
            this.render()
          }
        })
      })
      this.root.querySelector<HTMLInputElement>(`#${slot.key}-rgb`)?.addEventListener('input', (e) => {
        const el = e.target as HTMLInputElement
        const v = parseInt(el.value.slice(1), 16)
        slot.set(v)
        slot.apply(v)
        sync()
      })
    }
    this.root.querySelectorAll<HTMLButtonElement>('[data-paint-step]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.paintStep as 'color' | 'neon' | 'wheel' | 'rider' | 'helm'
        const dir = Number(btn.dataset.paintDir) || 1
        const slot = slots.find((s) => s.key === key)
        if (!slot) return
        const choices =
          key === 'color' ? [...PLAYER_COLOR_CHOICES] : [...NEON_COLOR_CHOICES]
        const pool = key === 'color' || key === 'neon' || key === 'wheel' || key === 'rider' || key === 'helm'
          ? [COLOR_NONE, ...choices]
          : choices
        const cur = slot.get()
        let idx = pool.indexOf(cur)
        if (idx < 0) idx = 0
        const next = pool[(idx + dir + pool.length) % pool.length]!
        slot.set(next)
        if (this.vehiclePreview) {
          slot.apply(next)
          this.root.querySelectorAll<HTMLButtonElement>(`[data-${slot.key}]`).forEach((b) => {
            b.classList.toggle('active', Number(b.dataset[slot.key]) === next)
          })
          const rgb = this.root.querySelector<HTMLInputElement>(`#${slot.key}-rgb`)
          if (rgb && next >= 0) rgb.value = '#' + next.toString(16).padStart(6, '0')
        } else {
          this.render()
        }
      })
    })
  }

  private emitStart(mode: 'host' | 'join'): void {
    const look = this.currentLook()
    this.onStart?.({
      mode,
      trackId: this.selectedTrackId,
      vehicle: this.selectedVehicle,
      color: look.body,
      neon: look.neon,
      wheel: look.wheel,
      rider: look.rider,
      helm: look.helm,
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
      if (this.screen === 'tracks') this.revertTracksDraft()
      if (this.screen === 'tuning') this.revertTuningDraft()
      if (this.screen === 'vehicles' && (to === 'home' || to === 'raceSetup')) {
        // Zpět = zrušit výběr (past jen při OK)
        this.revertVehicleDraft()
        this.clearScooterTrap()
      }
      if (this.screen === 'online' && to === 'raceMode') {
        this.raceModePick = 'online'
      }
      this.screen = to
      this.render()
    })
  }

  private beginTracksDraft(): void {
    if (this.draftTracks) return
    const race = this.raceApi?.get() ?? DEFAULT_RACE
    this.draftTracks = {
      trackId: this.selectedTrackId,
      reverse: !!race.reverse,
      laps: clampRaceLaps(race.laps),
    }
  }

  private revertTracksDraft(): void {
    if (!this.draftTracks) return
    this.selectedTrackId = this.draftTracks.trackId
    this.raceApi?.set({
      reverse: this.draftTracks.reverse,
      laps: clampRaceLaps(this.draftTracks.laps),
    })
    this.draftTracks = null
  }

  private commitTracksDraft(): void {
    // Dočti kola z číselníku (OK bez blur by jinak neuložil)
    const input = this.root.querySelector<HTMLInputElement>('[data-track-laps-input]')
    if (input) this.raceApi?.set({ laps: clampRaceLaps(input.value) })
    this.draftTracks = null
  }

  private beginVehicleDraft(): void {
    this.draftVehicle = {
      vehicle: this.selectedVehicle,
      color: this.selectedColor,
      neon: this.selectedNeon,
      wheel: this.selectedWheel,
      rider: this.selectedRider,
      helm: this.selectedHelm,
      branch: this.selectedBranch,
    }
  }

  private revertVehicleDraft(): void {
    if (!this.draftVehicle) return
    const d = this.draftVehicle
    this.selectedVehicle = d.vehicle
    this.selectedColor = d.color
    this.selectedNeon = d.neon
    this.selectedWheel = d.wheel
    this.selectedRider = d.rider
    this.selectedHelm = d.helm
    this.selectedBranch = d.branch
    const race = this.raceApi?.get()
    if (race && !isScooterTrapKind(d.vehicle)) {
      this.raceApi?.set({
        opponents: clampOpponentsToCategory(race.opponents, d.vehicle, false),
      })
    }
    this.draftVehicle = null
  }

  private commitVehicleDraft(): void {
    this.draftVehicle = null
  }

  private beginTuningDraft(): void {
    this.draftTuning = {
      tuning: { ...this.tuning },
      neon: this.selectedNeon,
      wheel: this.selectedWheel,
      rider: this.selectedRider,
      helm: this.selectedHelm,
    }
  }

  private revertTuningDraft(): void {
    if (!this.draftTuning) return
    this.tuning = { ...this.draftTuning.tuning }
    this.selectedNeon = this.draftTuning.neon
    this.selectedWheel = this.draftTuning.wheel
    this.selectedRider = this.draftTuning.rider
    this.selectedHelm = this.draftTuning.helm
    this.draftTuning = null
  }

  private commitTuningDraft(): void {
    this.draftTuning = null
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

  private resetPitCart(career: ChampCareer): void {
    this.pitCartTune = { ...career.tuning }
    this.pitCartBuy = null
  }

  private pitCartSummary(
    career: ChampCareer,
    draft: PlayerTuningValues,
    buy: VehicleKind | null,
  ): { lines: string[]; total: number } {
    const lines: string[] = []
    let total = 0
    for (const key of TUNE_KEYS) {
      const from = career.tuning[key]
      const to = draft[key]
      if (to > from) {
        const cost = tuningUpgradeCost(to, career.difficulty, from, career.vehicle, career.branch)
        total += cost
        lines.push(`${t(`menu.${key}`)} ${from}→${to} · ${this.formatKc(cost)}`)
      }
    }
    if (buy) {
      if (isScooterTrapKind(buy)) {
        total += 15_000
        lines.push(`${this.vehicleLabel(buy)} · ${this.formatKc(15_000)}`)
      } else {
        const order = listUnlockOrder(career.branch)
        const idx = order.indexOf(buy)
        const price = idx >= 0 ? vehicleBuyPrice(career.branch, idx, career.difficulty) : null
        if (price != null) {
          total += price
          lines.push(`${this.vehicleLabel(buy)} · ${this.formatKc(price)}`)
        }
      }
    }
    return { lines, total }
  }

  private commitPitCart(): void {
    if (!this.champCareer || !this.pitCartTune) return
    // Koloběžka / raketová koloběžka v košíku = žádná platba, jen hláška
    if (this.pitCartBuy && isScooterTrapKind(this.pitCartBuy)) {
      this.selectedVehicle = this.pitCartBuy
      this.bumpScooterTrap()
      return
    }
    let career = this.champCareer
    // Nejdřív downgrady (zdarma), pak upgrady — šamp bez solo rozpočtu
    for (const key of TUNE_KEYS) {
      const from = career.tuning[key]
      const to = Math.max(0, Math.min(CHAMP_TUNING_MAX, this.pitCartTune[key]))
      if (to < from) {
        career.tuning = { ...career.tuning, [key]: to }
      }
    }
    for (const key of TUNE_KEYS) {
      const from = career.tuning[key]
      const to = this.pitCartTune[key]
      if (to > from) {
        career = applyTuningUpgrade(career, key, to)
      }
    }
    if (this.pitCartBuy) {
      career = buyVehicle(career, this.pitCartBuy)
      this.champPitPreview = this.pitCartBuy
    }
    saveCareer(career)
    this.champCareer = career
    this.resetPitCart(career)
    this.render()
  }

  private startChampionshipRace(): void {
    const career = this.champCareer
    if (!career || career.done) return
    if (needsChampPostQualSetup(career)) {
      markChampSetupComplete(career)
    }
    ensureChampRivalMidSpike(career)
    this.champCareer = career
    if (career.done) {
      this.screen = career.consolation ? 'champTrophy' : 'champBrief'
      if (career.consolation) this.showChampionshipTrophy(career)
      else this.render()
      return
    }
    const trackId =
      championshipTrackId(career) ??
      (isChampQualifying(career) ? championshipQualTrackId(career.branch) : null)
    if (!trackId) return
    this.raceApi?.set({ reverse: championshipReverse(career) })
    const look = this.currentLook()
    const fsQual = isChampFsQual(career)
    const qual = isChampQualifying(career)
    const laps = qual || fsQual ? 1 : championshipRaceLaps(career.league, trackId)
    this.onStart?.({
      mode: 'solo',
      trackId,
      vehicle: career.vehicle,
      color: look.body,
      neon: look.neon,
      wheel: look.wheel,
      rider: look.rider,
      helm: look.helm,
      tuning: champTuningToSolo(career.tuning),
      name: this.playerName,
      difficulty: career.difficulty,
      laps,
      timeLimitMs: fsQual ? CHAMP_FS_QUAL_MS : undefined,
      championship: { branch: career.branch, season: career.season, league: career.league },
    })
  }

  private startSolo(): void {
    if (isScooterTrapKind(this.selectedVehicle)) {
      this.screen = 'vehicles'
      this.bumpScooterTrap()
      return
    }
    const look = this.currentLook()
    this.onStart?.({
      mode: 'solo',
      trackId: this.selectedTrackId,
      vehicle: this.selectedVehicle,
      color: look.body,
      neon: look.neon,
      wheel: look.wheel,
      rider: look.rider,
      helm: look.helm,
      tuning: { ...this.tuning },
      name: this.playerName,
      difficulty: this.selectedDifficulty,
    })
  }

  private async loadWorldRecords(): Promise<void> {
    this.worldRecordsLoading = true
    this.render()
    // Lokální lidské skóre → svět (boti už filtrovaní v Records)
    shareLocalRecordsWithWorld()
    const trackId = this.lbTrackId || undefined
    const board = this.recordsMode
    try {
      this.worldRecords = await fetchCloudRecords({ trackId, board })
    } catch {
      this.worldRecords = []
    }
    this.worldRecordsLoading = false
    if (this.screen === 'records') this.render()
  }

  private colorSwatchHtml(
    kind: 'color' | 'neon' | 'wheel' | 'rider' | 'helm',
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
    if (this.isHost && !this.lobbyWaitStartedAt) {
      this.lobbyWaitStartedAt = Date.now()
      this.armLobbyWaitTimer()
    }
    const waitLeft = Math.max(
      0,
      Math.ceil((this.lobbyWaitMs - (Date.now() - (this.lobbyWaitStartedAt || Date.now()))) / 1000),
    )
    const waitMin = Math.floor(waitLeft / 60)
    const waitSec = String(waitLeft % 60).padStart(2, '0')
    this.root.innerHTML = `
      ${wm}
      ${this.muteBar()}
      <div class="menu-shell menu-panel menu-panel-dock">
        <div class="menu-panel-body">
          <p class="menu-sub">${t('menu.room')} ${room.code} · ${room.players.length}/${room.maxPlayers || 4} ${t('menu.playersOf')} · ${this.escape(trackLabel)} · ${room.laps} ${t('menu.onlineLaps').toLowerCase()}</p>
          <p class="tune-rules">${t('menu.lobbyWait')}: ${waitMin}:${waitSec}</p>
          <section class="menu-section">
            <h2>${t('menu.players')}</h2>
            <ol class="lobby-list">${players}</ol>
          </section>
          ${
            this.isHost
              ? `<section class="menu-section">
              <label class="manual-option ${this.lobbyFillAi ? 'active' : ''}" style="margin:8px 0;display:flex;gap:10px;align-items:flex-start;cursor:pointer">
                <input type="checkbox" id="lobby-fill-ai" ${this.lobbyFillAi ? 'checked' : ''} />
                <span><strong>${t('menu.lobbyFillAi')}</strong></span>
              </label>
              <h2>${t('menu.onlineLaps')}</h2>
              <div class="lap-stepper" role="group" aria-label="${t('menu.onlineLaps')}">
                <button type="button" class="btn-ghost lap-step" data-lobby-laps-delta="-1" aria-label="-">−</button>
                <input type="number" class="lap-step-input" min="${RACE_LAP_MIN}" max="${RACE_LAP_MAX}" step="1" value="${room.laps}" data-lobby-laps-input inputmode="numeric" />
                <button type="button" class="btn-ghost lap-step" data-lobby-laps-delta="1" aria-label="+">+</button>
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
              ? `<button type="button" class="menu-start" id="btn-race" style="margin-top:8px">${t('menu.lobbyStartNow')}</button>
                 <p class="tune-rules">${allReady ? '' : t('menu.onlineStartNeedReady')}</p>`
              : ''
          }
          <button type="button" class="btn-ghost" id="btn-leave" style="margin-top:12px">${t('menu.leaveLobby')}</button>
          ${this.lobbyError ? `<p class="menu-error">${this.escape(this.lobbyError)}</p>` : ''}
        </div>
      </div>
    `
    this.bindMuteBar()
    this.root.querySelector('#lobby-fill-ai')?.addEventListener('change', (e) => {
      this.lobbyFillAi = (e.target as HTMLInputElement).checked
    })
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
    this.bindLapStepper({
      get: () => clampRaceLaps(this.lobby?.laps ?? this.hostLaps),
      set: (n) => {
        const input = this.root.querySelector<HTMLInputElement>('[data-lobby-laps-input]')
        if (input && input.value !== String(n)) input.value = String(n)
        // Subtitle v lobby — update bez skoku scrollu (setLobby přijde ze sítě).
        const sub = this.root.querySelector('.menu-sub')
        if (sub && this.lobby) {
          const track = TRACKS.find((tr) => tr.id === this.lobby!.trackId)
          const trackLabel = track ? this.trackName(track) : this.lobby.trackId
          sub.textContent = `${t('menu.room')} ${this.lobby.code} · ${this.lobby.players.length}/${this.lobby.maxPlayers || 4} ${t('menu.playersOf')} · ${trackLabel} · ${n} ${t('menu.onlineLaps').toLowerCase()}`
        }
        this.onLobbyLaps?.(n)
      },
      deltaAttr: 'data-lobby-laps-delta',
      inputAttr: 'data-lobby-laps-input',
    })
    this.root.querySelectorAll<HTMLButtonElement>('[data-lobby-track]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.lobbyTrack
        if (!id || id === this.lobby?.trackId) return
        // Okamžitě vizuálně — scroll zůstane; síťová odpověď dorovná přes setLobby.
        this.root.querySelectorAll<HTMLButtonElement>('[data-lobby-track]').forEach((b) => {
          b.classList.toggle('active', b.dataset.lobbyTrack === id)
        })
        this.onLobbyTrack?.(id)
      })
    })
    this.root.querySelector('#btn-race')?.addEventListener('click', () => {
      this.clearLobbyWaitTimer()
      this.onHostStart?.()
    })
    this.root.querySelector('#btn-leave')?.addEventListener('click', () => {
      if (!window.confirm(t('menu.leaveConfirm'))) return
      this.clearLobbyWaitTimer()
      this.onLeaveLobby?.()
    })
  }

  private armLobbyWaitTimer(): void {
    this.clearLobbyWaitTimer()
    this.lobbyWaitTimer = window.setInterval(() => {
      if (!this.lobby || !this.isHost) {
        this.clearLobbyWaitTimer()
        return
      }
      const left = this.lobbyWaitMs - (Date.now() - this.lobbyWaitStartedAt)
      if (left <= 0) {
        this.clearLobbyWaitTimer()
        this.onHostStart?.()
        return
      }
      if (this.visible && this.lobby) {
        const scrollPos = this.savePanelScroll()
        this.render()
        this.restorePanelScroll(scrollPos)
      }
    }, 1000)
  }

  private clearLobbyWaitTimer(): void {
    if (this.lobbyWaitTimer != null) {
      window.clearInterval(this.lobbyWaitTimer)
      this.lobbyWaitTimer = null
    }
    this.lobbyWaitStartedAt = 0
  }

  private bindTracks(): void {
    this.root.querySelectorAll<HTMLButtonElement>('[data-track]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const next = btn.dataset.track || TRACKS[0].id
        if (next === this.selectedTrackId) return
        const scroll = this.savePanelScroll()
        // Kola drží napříč výběrem tratí v tomto menu.
        const lapsInput = this.root.querySelector<HTMLInputElement>('[data-track-laps-input]')
        if (lapsInput) this.raceApi?.set({ laps: clampRaceLaps(lapsInput.value) })
        this.selectedTrackId = next
        this.render()
        this.restorePanelScroll(scroll)
      })
    })
  }

  private bindTuning(): void {
    this.root.querySelectorAll<HTMLInputElement>('input[data-tune]').forEach((input) => {
      input.addEventListener('input', () => {
        const key = input.dataset.tune as keyof PlayerTuningValues
        this.tuning = setTuningStat(this.tuning, key, Number(input.value))
        this.syncSliders()
        const stats = this.root.querySelector('#tune-stats')
        if (stats) {
          stats.innerHTML = statsBarsHtml(
            this.selectedVehicle,
            (k) => t(`menu.stat.${k}`),
            this.tuning,
          )
        }
      })
    })
  }

  private readFields(): void {
    const name = this.root.querySelector<HTMLInputElement>('#player-name')
    if (name) {
      this.playerName = savePlayerName(name.value.trim() || loadOrCreatePlayerName())
      name.value = this.playerName
    }
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
    if (tr.sandbox) {
      return `
      <button type="button" class="track-card track-card-lite ${active}" data-track="${tr.id}">
        <strong>${this.escape(this.trackName(tr))}</strong>
        <span class="track-card-est">${t('menu.sandboxTag')}</span>
      </button>`
    }
    return `
      <button type="button" class="track-card track-card-lite ${active}" data-track="${tr.id}">
        <strong>${this.escape(this.trackName(tr))}</strong>
      </button>
    `
  }

  /** Orientační čas do náhledu — kalibrace = ZávoďáQ / střední (ne formule). */
  private trackEstPaceHtml(tr: TrackDef): string {
    if (tr.sandbox || !tr.estTime) return ''
    const line = t('menu.estTimePace', {
      time: tr.estTime,
      vehicle: t('vehicle.street'),
      diff: t('diff.normal'),
    })
    return `<p class="tune-rules track-est-pace" title="${t('menu.estTimePaceHint')}">${line}</p>
      <p class="tune-help track-est-pace-hint">${t('menu.estTimePaceHint')}</p>`
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

  /** Info o pádu — jen pokud peklostroj umí umřít (monster / pomalé vozy vynechat). */
  private vehicleCrashInfoHtml(kind: VehicleKind): string {
    if (vehicleBranch(kind) === 'monster') return ''
    if (
      kind === 'skate' ||
      kind === 'skates' ||
      kind === 'bike' ||
      kind === 'rocketSkate' ||
      kind === 'rocketSkates' ||
      kind === 'rocketBike'
    ) {
      return `<p class="tune-rules vehicle-crash-info">${t('vehicle.crash.fs')}</p>`
    }
    if (!catalogCanDieFromSpeed(kind)) return ''
    return `<p class="tune-rules vehicle-crash-info">${t('vehicle.crash.speed')}</p>`
  }

  private slider(key: keyof PlayerTuningValues, label: string, value: number): string {
    return `
      <label class="tune-row">
        <span class="tune-label">${label} <span class="tune-val">${value}</span></span>
        <input type="range" min="0" max="${TUNING_MAX}" step="1" value="${value}" data-tune="${key}" />
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
    this.root.querySelector<HTMLButtonElement>('[data-feel-immortal]')?.addEventListener('click', () => {
      const cur = this.controlFeelApi?.get() ?? DEFAULT_CONTROL_FEEL
      this.controlFeelApi?.set({ immortality: !cur.immortality })
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
    this.root.querySelectorAll<HTMLButtonElement>('[data-feel-stance]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const stance = btn.dataset.feelStance as SkateStance
        if (!SKATE_STANCES.includes(stance)) return
        this.controlFeelApi?.set({ skateStance: stance })
        this.render()
      })
    })
    this.root.querySelectorAll<HTMLElement>('[data-mobile-scheme]').forEach((row) => {
      const pick = () => {
        const scheme = row.dataset.mobileScheme as MobileDriveScheme
        if (!MOBILE_DRIVE_SCHEMES.includes(scheme)) return
        this.controlFeelApi?.set({ mobileScheme: scheme })
        this.render()
      }
      row.addEventListener('click', pick)
      row.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          pick()
        }
      })
    })
    const portrait = this.root.querySelector<HTMLElement>('[data-allow-portrait]')
    const togglePortrait = () => {
      const cur = this.controlFeelApi?.get() ?? DEFAULT_CONTROL_FEEL
      this.controlFeelApi?.set({ allowPortraitRotation: !cur.allowPortraitRotation })
      this.render()
    }
    portrait?.addEventListener('click', togglePortrait)
    portrait?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        togglePortrait()
      }
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
    this.root.querySelector<HTMLButtonElement>('[data-learn-upload]')?.addEventListener('click', () => {
      const cur = loadLearnSettings()
      saveLearnSettings({ ...cur, upload: !cur.upload })
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
        laps: e.laps,
        immortal: !!e.immortal,
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

  private formatKc(n: number): string {
    return `${Math.round(n).toLocaleString('cs-CZ')} Kč`
  }

  /** Hotovost v šampionátu — růžově svítí. */
  private formatChampCash(n: number): string {
    return `<span class="champ-cash-glow">${this.formatKc(n)}</span>`
  }

  private escape(s: string): string {
    return s
      .replaceAll('&', '&amp;')
      .replaceAll('"', '&quot;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
  }

  /**
   * Default sezóny: Baby + polovina (ne Velká), jen před 1. kolem.
   * Nevalidní hodnoty → baby/half; prefs synchronizovat.
   */
  private ensureChampLeagueDefaults(career: ChampCareer): void {
    if (career.round > 0) return
    let changed = false
    if (career.league !== 'baby' && career.league !== 'small' && career.league !== 'grand') {
      career.league = 'baby'
      changed = true
    }
    if (career.trackPool !== 'half' && career.trackPool !== 'all') {
      career.trackPool = 'half'
      changed = true
    }
    this.champLeague = career.league
    this.champPoolPref = career.trackPool
    if (changed) saveCareer(career)
  }

  /** Sdílený blok accordionu (liga / série / pit / obtížnost). */
  private menuAccordionBlock(opts: {
    id: string
    open: string | null
    title: string
    meta?: string
    body: string
    active?: boolean
  }): string {
    const isOpen = opts.open === opts.id
    return `<div class="menu-accordion-block ${opts.active ? 'is-active' : ''} ${isOpen ? 'is-open' : ''}">
      <button type="button" class="track-card ${opts.active ? 'active' : ''}" data-acc-toggle="${opts.id}" aria-expanded="${isOpen ? 'true' : 'false'}">
        <span class="menu-accordion-head">
          <strong>${opts.title}</strong>
          ${opts.meta ? `<span class="menu-accordion-meta">${opts.meta}</span>` : ''}
        </span>
        <span class="menu-accordion-chevron" aria-hidden="true">${isOpen ? '▲' : '▼'}</span>
      </button>
      <div class="menu-accordion-body">${opts.body}</div>
    </div>`
  }

  private bindMenuAccordionToggle(onToggle: (id: string) => void): void {
    this.root.querySelectorAll<HTMLButtonElement>('[data-acc-toggle]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.accToggle
        if (!id) return
        onToggle(id)
        this.render()
      })
    })
  }

  /** Číselník kol 1–69 (quick race / host / lobby). */
  private bindLapStepper(opts: {
    get: () => number
    set: (n: number) => void
    deltaAttr?: string
    inputAttr?: string
  }): void {
    const deltaAttr = opts.deltaAttr ?? 'data-race-laps-delta'
    const inputAttr = opts.inputAttr ?? 'data-race-laps-input'
    this.root.querySelectorAll<HTMLButtonElement>(`[${deltaAttr}]`).forEach((btn) => {
      btn.addEventListener('click', () => {
        this.audioApi?.playClick?.()
        const d = Number(btn.getAttribute(deltaAttr)) || 0
        opts.set(clampRaceLaps(opts.get() + d))
      })
    })
    const input = this.root.querySelector<HTMLInputElement>(`[${inputAttr}]`)
    if (!input) return
    const commit = () => opts.set(clampRaceLaps(input.value))
    input.addEventListener('change', commit)
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        commit()
        input.blur()
      }
    })
  }

  private beginChampSeriesDraft(career: ChampCareer): void {
    if (this.champSeriesDraft) return
    this.champSeriesDraft = { difficulty: career.difficulty }
  }

  private commitChampSeriesDraft(): void {
    this.champSeriesDraft = null
  }

  private revertChampSeriesDraft(career: ChampCareer | null): void {
    const d = this.champSeriesDraft
    if (d && career) {
      career.difficulty = d.difficulty
      this.selectedDifficulty = d.difficulty
      this.champCareer = career
    }
    this.champSeriesDraft = null
  }

}

function fmtMs(ms: number): string {
  if (!(ms > 0)) return '—'
  const s = Math.round(ms / 1000)
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${r.toString().padStart(2, '0')}`
}
