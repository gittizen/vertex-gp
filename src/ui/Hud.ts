import type { CameraController } from '../camera/CameraController'
import { t } from '../i18n/i18n'
import type { RaceManager } from '../race/RaceManager'
import { formatTime } from '../race/RaceManager'
import type { Vehicle } from '../vehicle/Vehicle'
import type { VehicleKind } from '../track/TrackDefs'
import { freestyleList, freestyleRaceScore, placePoints } from '../freestyle/FreestyleTricks'
import { isFsBoardKind } from '../vehicle/FsKinds'
import { FATAL_SPEED_KMH } from '../vehicle/VehicleProfiles'
import {
  BIND_ACTION_ORDER,
  codeLabel,
  loadKeyBindings,
  type BindAction,
} from '../input/KeyBindings'
import { loadTrickBindings, TRICK_LETTERS } from '../input/TrickBindings'
import type { CompetitionId } from '../render/CompetitionSettings'

/** Radar barvy (všichni stejně, bez ohledu na to jestli můžou umřít). */
const RADAR_GREEN_KMH = 100
const RADAR_YELLOW_KMH = 200
type RadarBand = 'ok' | 'mid' | 'warn' | 'fatal'

export type PauseHelp = {
  kind: VehicleKind
  immortal?: boolean
  allowImmortal?: boolean
  /** Šampionát: ukázat i „Zrušit závod“. Rychlý závod = jen odstoupit. */
  championship?: boolean
  /** Multiplayer — bez odstoupení / zrušení solo flow. */
  multiplayer?: boolean
  /** Počet Esc ve pauze (1–3); 3 = odejít. */
  escQuitCount?: number
}

/** HUD bez přepisování celého DOM každý frame. */
export class Hud {
  private readonly root: HTMLElement
  private readonly overlay: HTMLElement
  private trackName = 'Nordring'
  private onMenuRequest: (() => void) | null = null
  private onPauseRequest: (() => void) | null = null
  private onResumeRequest: (() => void) | null = null
  private onRestartRequest: (() => void) | null = null
  private onChampionshipNext: (() => void) | null = null
  private onImmortalToggle: (() => void) | null = null
  private onRetireRequest: (() => void) | null = null
  private champResult: {
    points: number
    progress: string
    done: boolean
    lastPts: number
    qual?: boolean
    fsQual?: boolean
    place?: number
  } | null = null
  private built = false
  private elRaceMeta: HTMLElement | null = null
  private elSpeed: HTMLElement | null = null
  private elRadarPanel: HTMLElement | null = null
  private elPlateText: HTMLElement | null = null
  private elGear: HTMLElement | null = null
  private elSplit: HTMLElement | null = null
  private elFps: HTMLElement | null = null
  private lastSpeedShown = -1
  private lastFsPtsShown = -1
  private lastRadarBand: RadarBand | '' = ''
  private lastPlateKey = ''
  private lastOverlayKey = ''
  private lastSplitKey = ''
  private hudAcc = 0
  private helpKind: VehicleKind | '' = ''
  private shellSandbox = false
  private shellLoop = false
  private paused = false
  private pauseHelp: PauseHelp | null = null
  private competition: CompetitionId = 'none'
  private onlineRace = false
  private mirrorFrame = false
  private mirrorEl: HTMLElement | null = null
  /** Mimo #hud (zoom/stacking) — floating pill jako mute/lang. */
  private pauseFab: HTMLButtonElement | null = null

  constructor(root: HTMLElement, overlay: HTMLElement) {
    this.root = root
    this.overlay = overlay
    this.ensurePauseFab()
    // pointerdown — spolehlivější než click (overlay se přepisuje každý frame při změně key).
    this.overlay.addEventListener(
      'pointerdown',
      (e) => {
        const el = (e.target as HTMLElement | null)?.closest?.('button')
        if (!el) return
        if (el.id === 'btn-restart') {
          e.preventDefault()
          e.stopPropagation()
          this.onRestartRequest?.()
          return
        }
        if (el.id === 'btn-champ-next') {
          e.preventDefault()
          e.stopPropagation()
          this.onChampionshipNext?.()
          return
        }
        if (el.id === 'btn-share') {
          e.preventDefault()
          e.stopPropagation()
          void this.shareResult(el)
          return
        }
        if (el.id === 'btn-menu') {
          e.preventDefault()
          e.stopPropagation()
          this.onMenuRequest?.()
          return
        }
        if (el.id === 'btn-retire') {
          e.preventDefault()
          e.stopPropagation()
          this.onRetireRequest?.()
          return
        }
        if (el.id === 'btn-resume') {
          e.preventDefault()
          e.stopPropagation()
          this.onResumeRequest?.()
          return
        }
        if (el.id === 'btn-immortal') {
          e.preventDefault()
          e.stopPropagation()
          this.onImmortalToggle?.()
          return
        }
      },
      { capture: true },
    )
  }

  private ensurePauseFab(): void {
    if (this.pauseFab?.isConnected) return
    const host = document.getElementById('app') ?? document.body
    let btn = document.getElementById('btn-hud-pause') as HTMLButtonElement | null
    if (!btn) {
      btn = document.createElement('button')
      btn.type = 'button'
      btn.id = 'btn-hud-pause'
      btn.className = 'hud-pause-toggle'
      btn.setAttribute('aria-label', t('hud.pause'))
      btn.innerHTML = `<span class="hud-pause-toggle-label">${t('hud.pause')}</span>`
      host.appendChild(btn)
    }
    this.pauseFab = btn
    this.pauseFab.hidden = true
    this.pauseFab.addEventListener(
      'pointerdown',
      (e) => {
        e.preventDefault()
        e.stopPropagation()
        this.onPauseRequest?.()
      },
      { capture: true },
    )
  }

  private setPauseFabVisible(on: boolean): void {
    this.ensurePauseFab()
    if (!this.pauseFab) return
    this.pauseFab.hidden = !on
    const label = this.pauseFab.querySelector('.hud-pause-toggle-label')
    if (label) label.textContent = t('hud.pause')
    this.pauseFab.setAttribute('aria-label', t('hud.pause'))
  }

  private shareText = ''

  private async shareResult(btn: Element): Promise<void> {
    const text = this.shareText
    if (!text) return
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ title: 'KlecMania', text })
        return
      }
    } catch {
      /* cancel / unsupported → clipboard */
    }
    try {
      await navigator.clipboard.writeText(text)
      const label = btn.querySelector('span') ?? btn
      const prev = label.textContent
      label.textContent = t('hud.shareCopied')
      window.setTimeout(() => {
        label.textContent = prev
      }, 1600)
    } catch {
      /* ignore */
    }
  }

  setOnlineRace(on: boolean): void {
    this.onlineRace = on
  }

  setTrackName(name: string): void {
    this.trackName = name
  }

  setCompetition(id: CompetitionId): void {
    this.competition = id
    this.built = false
  }

  setOnMenuRequest(cb: () => void): void {
    this.onMenuRequest = cb
  }

  setOnPauseRequest(cb: () => void): void {
    this.onPauseRequest = cb
  }

  setOnImmortalToggle(cb: () => void): void {
    this.onImmortalToggle = cb
  }

  setOnRetireRequest(cb: () => void): void {
    this.onRetireRequest = cb
  }

  setOnResumeRequest(cb: () => void): void {
    this.onResumeRequest = cb
  }

  setOnRestartRequest(cb: () => void): void {
    this.onRestartRequest = cb
  }

  setOnChampionshipNext(cb: () => void): void {
    this.onChampionshipNext = cb
  }

  setChampionshipResult(
    result: {
      points: number
      progress: string
      done: boolean
      lastPts: number
      qual?: boolean
      fsQual?: boolean
      place?: number
    } | null,
  ): void {
    this.champResult = result
    this.lastOverlayKey = ''
  }

  /** Schovej výsledky / pauzu — před restartem závodu. */
  clearResultsOverlay(): void {
    this.champResult = null
    this.paused = false
    this.pauseHelp = null
    this.lastOverlayKey = ''
    this.overlay.classList.remove('visible')
    this.overlay.innerHTML = ''
  }

  setPaused(paused: boolean, help: PauseHelp | null = null): void {
    this.paused = paused
    this.pauseHelp = help
    if (paused) this.lastOverlayKey = ''
  }

  /** FPS / draw calls (audit výkonu). */
  setPerf(fps: number, draws: number): void {
    if (!this.elFps) {
      this.elFps = document.createElement('div')
      this.elFps.className = 'hud-fps'
      this.elFps.setAttribute('aria-hidden', 'true')
      this.root.appendChild(this.elFps)
    }
    const warn = fps > 0 && fps < 55
    this.elFps.classList.toggle('hud-fps-low', warn)
    this.elFps.textContent = `${fps} FPS · ${draws} draw`
  }

  /** Rámeček kolem WebGL scissor zrcátka. */
  setMirrorFrame(on: boolean): void {
    this.mirrorFrame = on
    if (!this.mirrorEl) {
      this.mirrorEl = document.createElement('div')
      this.mirrorEl.className = 'hud-mirror'
      this.mirrorEl.setAttribute('aria-hidden', 'true')
      this.root.appendChild(this.mirrorEl)
    }
    this.mirrorEl.classList.toggle('visible', on)
  }

  update(
    player: Vehicle,
    race: RaceManager,
    camera: CameraController,
    showHud: boolean,
  ): void {
    void camera
    if (!showHud) {
      this.setPauseFabVisible(false)
      this.root.querySelectorAll(':not(.hud-mirror)').forEach((n) => n.remove())
      // mirror frame element keep if present
      const keep = this.mirrorEl
      if (!keep || keep.parentElement !== this.root) {
        this.root.innerHTML = ''
        this.mirrorEl = null
      } else {
        for (const child of [...this.root.children]) {
          if (child !== keep) child.remove()
        }
      }
      this.built = false
      this.helpKind = ''
      this.shellSandbox = false
      this.shellLoop = false
      this.paused = false
      this.pauseHelp = null
      this.competition = 'none'
      this.elRaceMeta = null
      this.elSpeed = null
      this.elGear = null
      this.elSplit = null
      this.overlay.classList.remove('visible')
      this.overlay.innerHTML = ''
      this.lastOverlayKey = ''
      this.lastSplitKey = ''
      this.setMirrorFrame(false)
      return
    }

    this.setPauseFabVisible(true)

    const loopRace = !race.isSandbox && !race.isStage
    if (
      !this.built ||
      this.helpKind !== player.kind ||
      this.shellSandbox !== race.isSandbox ||
      this.shellLoop !== loopRace
    ) {
      this.buildShell(player.kind, race.isSandbox, loopRace)
    }

    this.hudAcc++
    if (this.hudAcc >= 3 || race.phase !== 'racing' || this.paused) {
      this.hudAcc = 0
      if (this.elRaceMeta) {
        if (race.isSandbox) {
          // Body jsou v radaru — nahoře jen kontext tratě
          this.elRaceMeta.hidden = true
        } else if (race.phase === 'countdown') {
          this.elRaceMeta.hidden = true
        } else if (loopRace) {
          this.elRaceMeta.hidden = false
          const place = race.playerPlace()
          const lap = race.displayLap(player)
          this.elRaceMeta.textContent = `${t('hud.lapShort')} ${lap}/${race.totalLaps} · P${place}`
        } else {
          this.elRaceMeta.hidden = false
          this.elRaceMeta.textContent = `P${race.playerPlace()}`
        }
      }
      if (this.elGear) {
        const manual = player.physics.manualShift
        this.elGear.hidden = !manual
        if (manual) {
          const gear = player.physics.gear < 0 ? 'R' : String(player.physics.gear)
          this.elGear.textContent = `${t('hud.gear')} ${gear}`
        }
      }
    }

    const kmh = player.displaySpeedKmh
    if (this.elSpeed && kmh !== this.lastSpeedShown) {
      this.lastSpeedShown = kmh
      this.elSpeed.textContent = String(kmh)
    }
    // ≤100 zelená · ≤200 žlutá · ≤zóna smrti oranžová · nad ní červená
    const band: RadarBand =
      kmh <= RADAR_GREEN_KMH
        ? 'ok'
        : kmh <= RADAR_YELLOW_KMH
          ? 'mid'
          : kmh <= FATAL_SPEED_KMH
            ? 'warn'
            : 'fatal'
    if (this.elRadarPanel && band !== this.lastRadarBand) {
      this.lastRadarBand = band
      this.elRadarPanel.classList.remove(
        'hud-radar--ok',
        'hud-radar--mid',
        'hud-radar--warn',
        'hud-radar--fatal',
      )
      this.elRadarPanel.classList.add(`hud-radar--${band}`)
    }
    const fsOn = player.freestyleOn || race.isSandbox
    this.root.classList.toggle('hud-fs', fsOn)
    // SPZ: FS = jen body · jinak hláška dle barvy
    if (this.elPlateText) {
      if (fsOn) {
        const pts = Math.round(player.trickPoints)
        const key = `fs:${pts}`
        if (key !== this.lastPlateKey || pts !== this.lastFsPtsShown) {
          this.lastPlateKey = key
          this.lastFsPtsShown = pts
          this.elPlateText.textContent = `${t('hud.fsPoints')} ${pts}`
        }
      } else {
        const sloganKey =
          band === 'ok'
            ? 'hud.radarSloganOk'
            : band === 'mid'
              ? 'hud.radarSloganMid'
              : band === 'warn'
                ? 'hud.radarSloganWarn'
                : 'hud.radarSloganFatal'
        const key = `race:${band}`
        if (key !== this.lastPlateKey) {
          this.lastPlateKey = key
          this.elPlateText.textContent = t(sloganKey)
        }
      }
    }

    this.renderSplitFlash(race)

    const immortalEl = this.root.querySelector('[data-h="immortal"]')
    if (immortalEl instanceof HTMLElement) {
      immortalEl.hidden = !player.immortal
    }

    const boosting =
      (player.isMonsterFamily() && player.turboAmount > 0.25) ||
      player.pushAmount > 0.2 ||
      player.tabBoostAmount > 0.25
    this.root.classList.toggle('hud-boost', boosting)
    this.root.classList.toggle('hud-fallen', player.fallen)

    this.renderOverlay(race)
  }

  private buildShell(kind: VehicleKind, sandbox = false, loopRace = false): void {
    const keepMirror = this.mirrorEl
    const kidsSvg = `<svg class="hud-kids-icon" viewBox="0 0 64 56" aria-hidden="true">
      <polygon points="32,4 60,52 4,52" fill="#f5d547" stroke="#c62828" stroke-width="4" stroke-linejoin="round"/>
      <g fill="#1a1a1a">
        <circle cx="24" cy="22" r="3.2"/>
        <path d="M21 26.2h6l1.2 9.2h-8.4z"/>
        <path d="M20.2 35.2l-4.8 8.4h3.4l3.2-5.6 1.4 5.6h2.8z"/>
        <path d="M27.8 35.2l2.2 8.4h3.2l-1.6-8.4z"/>
        <circle cx="40" cy="24" r="3"/>
        <path d="M37.2 28h5.6l1 8.4h-7.6z"/>
        <path d="M36.4 36.2l-3.6 7.6h3.2l2.2-4.8 1.2 4.8h2.6z"/>
        <path d="M42.8 36.2l1.8 7.6h3l-1.4-7.6z"/>
        <circle cx="33.5" cy="40.5" r="2.6"/>
      </g>
    </svg>`
    this.root.innerHTML = `
      <div class="hud-fps" data-h="fps" aria-hidden="true">— FPS</div>
      <div class="hud-immortal" data-h="immortal" hidden title="${t('hud.immortal')}" aria-label="${t('hud.immortal')}">👻</div>
      <div class="hud-top-meta" data-h="raceMeta" hidden>—</div>
      <div class="hud-split" data-h="split" hidden aria-live="polite">
        <div class="hud-split-time" data-h="splitTime">0:00.00</div>
        <div class="hud-split-gap" data-h="splitGap"></div>
      </div>
      <div class="hud-bottom">
        <div class="hud-radar-sign hud-radar--ok" data-h="radarPanel" title="${t('hud.kidsCaution')}">
          <div class="hud-radar-top">
            <div class="hud-kids-sign">
              ${kidsSvg}
              <span class="hud-kids-label">${t('hud.kidsCaution')}</span>
            </div>
            <div class="hud-radar-speed-col">
              <div class="hud-radar-readout">
                <span class="hud-speed" data-h="speed">0</span>
                <span class="hud-radar-unit">km/h</span>
              </div>
            </div>
          </div>
          <div class="hud-radar-plate" data-h="plate">
            <span class="hud-radar-plate-text" data-h="plateText">${t('hud.radarSloganOk')}</span>
          </div>
        </div>
        <div class="hud-gear" data-h="gear" hidden>${t('hud.gear')} 1</div>
      </div>
      <div class="hud-boost-flash" aria-hidden="true"></div>
    `
    this.setPauseFabVisible(true)
    if (keepMirror) {
      this.root.appendChild(keepMirror)
      keepMirror.classList.toggle('visible', this.mirrorFrame)
    } else if (this.mirrorFrame) {
      this.setMirrorFrame(true)
    }
    this.elRaceMeta = this.root.querySelector('[data-h="raceMeta"]')
    this.elSpeed = this.root.querySelector('[data-h="speed"]')
    this.elRadarPanel = this.root.querySelector('[data-h="radarPanel"]')
    this.elPlateText = this.root.querySelector('[data-h="plateText"]')
    this.elGear = this.root.querySelector('[data-h="gear"]')
    this.elSplit = this.root.querySelector('[data-h="split"]')
    this.elFps = this.root.querySelector('[data-h="fps"]')
    this.helpKind = kind
    this.shellSandbox = sandbox
    this.shellLoop = loopRace
    this.lastSplitKey = ''
    this.lastSpeedShown = -1
    this.lastFsPtsShown = -1
    this.lastRadarBand = ''
    this.lastPlateKey = ''
    this.built = true
  }

  /** Checkpoint flash — jako semafor nahoře uprostřed (zelená/červená). */
  private renderSplitFlash(race: RaceManager): void {
    if (!this.elSplit) return
    const toast = race.splitToast
    if (!toast || race.phase !== 'racing' || race.isSandbox) {
      if (this.lastSplitKey !== '') {
        this.elSplit.hidden = true
        this.lastSplitKey = ''
      }
      return
    }
    const key = `${toast.untilMs}:${toast.timeMs}:${toast.gapMs}:${toast.ahead ? 1 : 0}`
    if (key === this.lastSplitKey) return
    this.lastSplitKey = key
    this.elSplit.hidden = false
    this.elSplit.classList.toggle('hud-split--lead', toast.ahead)
    this.elSplit.classList.toggle('hud-split--behind', !toast.ahead)
    const timeEl = this.elSplit.querySelector('[data-h="splitTime"]')
    const gapEl = this.elSplit.querySelector('[data-h="splitGap"]')
    if (timeEl) timeEl.textContent = formatTime(toast.timeMs)
    if (gapEl instanceof HTMLElement) {
      if (!toast.name || toast.gapMs <= 0) {
        gapEl.hidden = true
        gapEl.textContent = ''
      } else {
        gapEl.hidden = false
        const sec = (toast.gapMs / 1000).toFixed(1)
        const sign = toast.ahead ? '+' : '−'
        const label = toast.ahead ? t('hud.gapLead') : t('hud.gapBehind')
        gapEl.textContent = `${label} ${toast.name} ${sign}${sec}s`
      }
    }
  }

  private renderOverlay(race: RaceManager): void {
    if (this.paused && this.pauseHelp) {
      this.renderPause(this.pauseHelp)
      return
    }

    if (race.phase === 'countdown') {
      // Semafor: countdown 3→1 světlo, 2→2, 1→3 zelené; bez GO pauzy
      const lit = race.countdown > 0 ? Math.max(0, 4 - race.countdown) : 3
      const key = `cd:${race.countdown}:${lit}`
      if (key === this.lastOverlayKey) return
      this.lastOverlayKey = key
      this.overlay.classList.add('visible')
      this.overlay.innerHTML = `
        <div class="overlay-card overlay-countdown">
          <div class="start-lights" aria-hidden="true">
            <span class="start-light ${lit >= 1 ? 'on' : ''}"></span>
            <span class="start-light ${lit >= 2 ? 'on' : ''}"></span>
            <span class="start-light ${lit >= 3 ? 'on go' : ''}"></span>
          </div>
          <p>KlecMania — ${this.trackName}</p>
          <p class="overlay-hint">${t('menu.escBack')}</p>
        </div>
      `
      return
    }

    if (race.phase === 'finished') {
      const fs = race.standings.some((s) => s.vehicle.freestyleOn)
      const driftComp = this.competition === 'driftScore'
      const scored = race.standings.map((s) => {
        const placePts = placePoints(s.place)
        const trickPts = s.vehicle.trickPoints
        const driftPts = s.vehicle.driftPoints
        // FS: triky víc než umístění (čas); umístění pořád přispívá
        const total = driftComp
          ? driftPts
          : fs
            ? freestyleRaceScore(trickPts, s.place)
            : placePts + trickPts
        return { s, placePts, trickPts, driftPts, total }
      })
      if (fs || driftComp) scored.sort((a, b) => b.total - a.total || a.s.place - b.s.place)
      const champ = this.champResult
      const key = `fin:${race.playerPlace()}:${scored.map((x) => x.total).join(',')}:${fs ? 1 : 0}:${driftComp ? 1 : 0}:${champ?.progress ?? ''}:${champ?.done ? 1 : 0}:${champ?.qual ? 1 : 0}`
      if (key === this.lastOverlayKey) return
      this.lastOverlayKey = key
      this.overlay.classList.add('visible')
      const place = race.playerPlace()
      const placeKey = place <= 4 ? `hud.place${place}` : 'hud.place4'
      const rows = scored
        .map((row, i) => {
          const s = row.s
          const cls = [
            s.vehicle.info.isPlayer ? 'player-row' : '',
            i === 0 ? 'winner-row' : '',
          ]
            .filter(Boolean)
            .join(' ')
          const time = s.vehicle.finished ? formatTime(s.vehicle.finishTime) : '—'
          const tag = s.vehicle.info.isPlayer ? '' : ` · ${s.vehicle.info.team}`
          const fsLine = fs
            ? ` · FS ${row.total} (triky ${row.trickPts} + čas/místo ${Math.round(row.placePts * 0.35)})`
            : driftComp
              ? ` · ${t('hud.driftScore')} ${row.driftPts}`
              : s.vehicle.driftPoints > 0
                ? ` · ${t('hud.drift')} ${s.vehicle.driftPoints}`
                : ''
          return `<li class="${cls}">${i + 1}. ${s.vehicle.info.name}${tag} — ${time}${fsLine}</li>`
        })
        .join('')
      const standingPlayer = race.standings.find((s) => s.vehicle.info.isPlayer)
      const playerTrickPts = standingPlayer?.vehicle.trickPoints ?? 0
      const champLine = champ?.qual
        ? `<p class="overlay-hint">${t(champ.fsQual ? 'hud.champQualFs' : 'hud.champQual')}</p>${
            !champ.fsQual && (champ.place ?? place) === 1
              ? `<p class="overlay-hint">${t('hud.champQualFast')}</p>`
              : ''
          }${
            champ.fsQual ? `<p class="overlay-hint">FS ${playerTrickPts}</p>` : ''
          }<p class="overlay-hint">${t('hud.champQualNext')}</p>`
        : champ
          ? `<p class="overlay-hint">${t('hud.champRound', {
              progress: champ.progress,
              pts: champ.lastPts,
              total: champ.points,
            })}</p>`
          : ''
      const timeStr =
        standingPlayer?.vehicle.finished ? formatTime(standingPlayer.vehicle.finishTime) : '—'
      const scoreBit = fs
        ? scored.find((r) => r.s.vehicle.info.isPlayer)
        : driftComp
          ? scored.find((r) => r.s.vehicle.info.isPlayer)
          : null
      const extra =
        champ?.fsQual
          ? ` · FS ${playerTrickPts}`
          : fs && scoreBit
            ? ` · FS ${scoreBit.total}`
            : driftComp && scoreBit
              ? ` · drift ${scoreBit.driftPts}`
              : ''
      this.shareText = `KlecMania · ${this.trackName} · P${place} · ${timeStr}${extra}`
      const shareBtn = `<button type="button" class="btn-ghost" id="btn-share"><span>${t('hud.share')}</span></button>`
      const actions = this.onlineRace
        ? `<button type="button" class="menu-start" id="btn-menu">${t('menu.onlineAfterRace')}</button>${shareBtn}`
        : champ?.qual
          ? `<button type="button" class="menu-start" id="btn-champ-next">${t('hud.champQualContinue')}</button>
            ${shareBtn}
            <button type="button" class="btn-ghost" id="btn-menu">${t('hud.menu')}</button>`
          : champ && !champ.done
            ? `<button type="button" class="menu-start" id="btn-champ-next">${t('hud.champNext')}</button>
            <button type="button" class="menu-start" id="btn-restart">${t('hud.again')}</button>
            ${shareBtn}
            <button type="button" class="btn-ghost" id="btn-menu">${t('hud.menu')}</button>`
            : champ?.done
              ? `<button type="button" class="menu-start" id="btn-restart">${t('hud.again')}</button>
            ${shareBtn}
            <button type="button" class="btn-ghost" id="btn-menu">${t('hud.champDone')}</button>`
              : `<button type="button" class="menu-start" id="btn-restart">${t('hud.again')}</button>
            ${shareBtn}
            <button type="button" class="btn-ghost" id="btn-menu">${t('hud.menu')}</button>`
      const placeTier = place <= 1 ? 'p1' : place === 2 ? 'p2' : place === 3 ? 'p3' : 'p4'
      const sparkN = place === 1 ? 22 : place === 2 ? 12 : place === 3 ? 6 : 0
      const burst =
        sparkN > 0
          ? `<div class="finish-burst" aria-hidden="true">${Array.from({ length: sparkN }, (_, i) => {
              const ang = (i / sparkN) * Math.PI * 2
              const dist = (place === 1 ? 100 : place === 2 ? 86 : 70) + (i % 5) * 12
              const dx = Math.round(Math.cos(ang) * dist)
              const dy = Math.round(Math.sin(ang) * dist * 0.72 - 28)
              return `<span class="finish-spark" style="--i:${i};--dx:${dx}px;--dy:${dy}px"></span>`
            }).join('')}</div>`
          : ''
      const modeBit = fs
        ? ` · Freestyle`
        : driftComp
          ? ` · ${t('hud.drift')}`
          : champ
            ? ` · ${t('comp.championship')}`
            : ''
      this.overlay.innerHTML = `
        <div class="overlay-card pause-card overlay-finish overlay-finish--${placeTier}">
          ${burst}
          <header class="pause-card-head finish-hero">
            <p class="pause-kicker finish-kicker">${t('hud.results')}${modeBit}</p>
            <p class="overlay-winner">${place >= 4 ? t('hud.placeConsolation') : t(placeKey)}</p>
            <p class="finish-time">${timeStr}${extra}</p>
            <p class="finish-track overlay-hint">${this.trackName}</p>
          </header>
          <div class="pause-card-body">
            ${champLine}
            <ol class="finish-standings">${rows}</ol>
          </div>
          <div class="overlay-actions pause-actions finish-actions">${actions}</div>
        </div>
      `
      return
    }

    if (this.lastOverlayKey !== 'race') {
      this.lastOverlayKey = 'race'
      this.overlay.classList.remove('visible')
      this.overlay.innerHTML = ''
    }
  }

  private renderPause(help: PauseHelp): void {
    const immortalOn = !!help.immortal
    const champ = !!help.championship
    const mp = !!help.multiplayer
    const escN = Math.max(1, Math.min(3, help.escQuitCount ?? 1))
    const key = `pause:${help.kind}:${immortalOn ? 1 : 0}:${help.allowImmortal ? 1 : 0}:${champ ? 1 : 0}:${mp ? 1 : 0}:${escN}`
    if (key === this.lastOverlayKey) return
    this.lastOverlayKey = key
    this.overlay.classList.add('visible')

    const binds = loadKeyBindings()
    const bindRows = pauseActionsFor(help.kind)
      .filter((a) => BIND_ACTION_ORDER.includes(a))
      .map((a) => {
        const [k0, k1] = binds[a]
        const k0l = codeLabel(k0)
        const k1l = codeLabel(k1)
        const keyBtns = [
          k0l !== '—' ? `<span class="bind-key pause-key">${k0l}</span>` : '',
          k1l !== '—' ? `<span class="bind-key pause-key">${k1l}</span>` : '',
        ]
          .filter(Boolean)
          .join('')
        return `<div class="bind-row pause-bind-row">
          <div class="bind-row-label">
            <span class="bind-name">${t(`bind.${a}`)}</span>
          </div>
          ${keyBtns || `<span class="bind-key pause-key">—</span>`}
        </div>`
      })
      .join('')

    let trickBlock = ''
    if (isFsBoardKind(help.kind)) {
      const tricks = freestyleList(help.kind)
      const tb = loadTrickBindings()
      const cells = TRICK_LETTERS.map((ch) => {
        const def = tricks.find((tr) => tr.letter === ch)
        const name = def?.nameCs ?? ch
        return `<div class="bind-row bind-row-trick pause-bind-row">
          <div class="bind-row-label"><span class="bind-name">${name}</span></div>
          <span class="bind-key pause-key">${codeLabel(tb[ch] ?? null)}</span>
        </div>`
      }).join('')
      trickBlock = `
        <h3 class="bind-section-title">${t('pause.tricks')}</h3>
        <div class="pause-bind-list">${cells}</div>
      `
    }

    const immortalLabel = `${t('hud.immortal')}: ${immortalOn ? t('menu.ctrlOn') : t('menu.ctrlOff')}`
    const immortalBtn = help.allowImmortal
      ? `<button type="button" class="btn-ghost pause-exit-btn pause-immortal-btn ${immortalOn ? 'is-on' : ''}" id="btn-immortal">${immortalLabel}</button>
        <p class="bind-row-hint pause-action-hint">${t('pause.immortalHint')}</p>`
      : ''

    // Rychlý závod: jen odstoupit. Šamp: odstoupit + zrušit. MP: bez solo exitů.
    let exitBlock = ''
    if (!mp) {
      const retireHint = champ ? t('pause.retireHintChamp') : t('pause.retireHintSolo')
      exitBlock = `
        <button type="button" class="btn-ghost pause-exit-btn" id="btn-retire">${t('pause.retire')}</button>
        <p class="bind-row-hint pause-action-hint">${retireHint}</p>
        ${
          champ
            ? `<button type="button" class="btn-ghost pause-exit-btn" id="btn-menu">${t('pause.cancelRace')}</button>
        <p class="bind-row-hint pause-action-hint">${t('pause.cancelHint')}</p>`
            : ''
        }`
    }

    const escHint =
      escN >= 2
        ? t('pause.escHintQuit', { n: escN, left: 3 - escN })
        : t('pause.escHintSolo')

    this.overlay.innerHTML = `
      <div class="overlay-card pause-card">
        <header class="pause-card-head">
          <p class="pause-kicker">${t('hud.pause')}</p>
          <h2>${t('pause.controls')}</h2>
          <p class="overlay-hint pause-esc-hint">${escHint}</p>
        </header>
        <div class="pause-card-body">
          <div class="pause-bind-list bind-list">${bindRows}</div>
          ${trickBlock}
        </div>
        <div class="overlay-actions pause-actions">
          <button type="button" class="menu-start pause-resume-btn" id="btn-resume">${t('hud.resume')}</button>
          ${immortalBtn}
          ${exitBlock}
        </div>
      </div>
    `
  }
}

/** Jen ovládání, které daný peklostroj skutečně používá. */
function pauseActionsFor(kind: VehicleKind): BindAction[] {
  const actions: BindAction[] = ['throttle', 'brake', 'steerLeft', 'steerRight']
  if (isFsBoardKind(kind)) {
    actions.push('push', 'tab')
  } else if (
    kind === 'monster' ||
    kind === 'truck' ||
    kind === 'tank' ||
    kind === 'buggy' ||
    kind === 'humvee'
  ) {
    actions.push('push', 'tab')
  } else if (kind === 'moto' || kind === 'harley' || kind === 'kroska' || kind === 'naked' || kind === 'enduro') {
    actions.push('push')
  } else if (kind !== 'scooter') {
    actions.push('ebrake')
  }
  actions.push('camera', 'restart')
  return actions
}
