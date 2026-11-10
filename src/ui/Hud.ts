import type { CameraController } from '../camera/CameraController'
import { t } from '../i18n/i18n'
import type { RaceManager } from '../race/RaceManager'
import { formatTime } from '../race/RaceManager'
import type { Vehicle } from '../vehicle/Vehicle'
import type { VehicleKind } from '../track/TrackDefs'
import { freestyleList, placePoints } from '../freestyle/FreestyleTricks'
import {
  BIND_ACTION_ORDER,
  codeLabel,
  loadKeyBindings,
  type BindAction,
} from '../input/KeyBindings'
import { loadTrickBindings, TRICK_LETTERS } from '../input/TrickBindings'
import type { CompetitionId } from '../render/CompetitionSettings'

export type PauseHelp = {
  kind: VehicleKind
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
  private champResult: {
    points: number
    progress: string
    done: boolean
    lastPts: number
  } | null = null
  private built = false
  private elRaceMeta: HTMLElement | null = null
  private elRaceClock: HTMLElement | null = null
  private elRaceGap: HTMLElement | null = null
  private elSpeed: HTMLElement | null = null
  private elGear: HTMLElement | null = null
  private elFps: HTMLElement | null = null
  private lastOverlayKey = ''
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

  constructor(root: HTMLElement, overlay: HTMLElement) {
    this.root = root
    this.overlay = overlay
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
        if (el.id === 'btn-resume') {
          e.preventDefault()
          e.stopPropagation()
          this.onResumeRequest?.()
          return
        }
        if (el.id === 'btn-hud-pause') {
          e.preventDefault()
          e.stopPropagation()
          this.onPauseRequest?.()
        }
      },
      { capture: true },
    )
    // Pause FAB je v #hud (ne overlay) — pointerdown na root
    this.root.addEventListener(
      'pointerdown',
      (e) => {
        const el = (e.target as HTMLElement | null)?.closest?.('#btn-hud-pause')
        if (!el) return
        e.preventDefault()
        e.stopPropagation()
        this.onPauseRequest?.()
      },
      { capture: true },
    )
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
    result: { points: number; progress: string; done: boolean; lastPts: number } | null,
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
      this.overlay.classList.remove('visible')
      this.overlay.innerHTML = ''
      this.lastOverlayKey = ''
      this.setMirrorFrame(false)
      return
    }

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
          this.elRaceMeta.textContent = `FS ${player.trickPoints}`
        } else if (loopRace) {
          const place = race.playerPlace()
          const lap = race.displayLap(player)
          this.elRaceMeta.textContent = `${t('hud.lapShort')} ${lap}/${race.totalLaps} · P${place}`
        } else {
          const place = race.playerPlace()
          this.elRaceMeta.textContent = `P${place}`
        }
      }
      if (this.elRaceClock) {
        if (race.isSandbox || race.phase === 'countdown') {
          this.elRaceClock.textContent = '—'
        } else {
          const clockMs =
            race.phase === 'finished'
              ? player.finishTime || race.raceTimeMs
              : race.raceTimeMs
          this.elRaceClock.textContent = formatTime(clockMs)
        }
      }
      if (this.elRaceGap) {
        const gap = race.playerGap()
        if (!gap || race.isSandbox || race.phase === 'countdown') {
          this.elRaceGap.hidden = true
        } else {
          this.elRaceGap.hidden = false
          const sec = (gap.ms / 1000).toFixed(1)
          const sign = gap.ahead ? '+' : '−'
          const label = gap.ahead ? t('hud.gapLead') : t('hud.gapBehind')
          this.elRaceGap.textContent = `${label} ${gap.name} ${sign}${sec}s`
          this.elRaceGap.classList.toggle('gap-lead', gap.ahead)
          this.elRaceGap.classList.toggle('gap-behind', !gap.ahead)
        }
      }
      if (this.elGear) {
        const gear = player.physics.gear < 0 ? 'R' : String(player.physics.gear)
        const tx = player.physics.transmission
        const txLabel =
          tx === 'clutch' ? t('hud.clutch') : tx === 'manual' ? t('hud.manual') : t('hud.auto')
        this.elGear.textContent = `${t('hud.gear')}: ${gear} (${txLabel})`
      }
    }

    if (this.elSpeed) {
      this.elSpeed.innerHTML = `${player.displaySpeedKmh}<span>km/h</span>`
    }

    const boosting =
      (player.isMonsterFamily() && player.turboAmount > 0.25) ||
      player.pushAmount > 0.2 ||
      player.tabBoostAmount > 0.25
    this.root.classList.toggle('hud-boost', boosting)
    this.root.classList.toggle('hud-fallen', player.fallen)
    const pushEl = this.root.querySelector('[data-h="push"]')
    if (pushEl instanceof HTMLElement) {
      if (player.fallen) {
        pushEl.hidden = false
        pushEl.textContent = t(player.crashBurst ? 'hud.crash' : 'hud.remount')
      } else if (player.wheelie) {
        pushEl.hidden = false
        pushEl.textContent = t('hud.wheelie')
      } else if (player.isMonsterFamily() && player.turboAmount > 0.2) {
        pushEl.hidden = false
        pushEl.textContent = 'TURBO'
      } else if (player.tabBoostAmount > 0.25) {
        pushEl.hidden = false
        pushEl.textContent = 'BOOST'
      } else if (player.freestyleOn && player.lastTrickLabel && player.trickLocked) {
        pushEl.hidden = false
        pushEl.textContent = player.lastTrickLabel
      } else if (player.physics.driftMode && player.driftPoints > 0) {
        pushEl.hidden = false
        pushEl.textContent = player.physics.driftActive
          ? `${t('hud.drift')} ${player.driftPoints}`
          : `${t('hud.driftScore')} ${player.driftPoints}`
      } else if (player.freestyleOn && player.trickPoints > 0) {
        pushEl.hidden = false
        pushEl.textContent = `FS ${player.trickPoints}`
      } else if (player.kind === 'bike' && player.pushAmount > 0.15) {
        pushEl.hidden = false
        pushEl.textContent = t('hud.pedal')
      } else if (player.kind === 'skate' && player.pushAmount > 0.15) {
        pushEl.hidden = false
        pushEl.textContent = t('hud.push')
      } else {
        pushEl.hidden = true
      }
    }

    this.renderOverlay(race)
  }

  private buildShell(kind: VehicleKind, sandbox = false, loopRace = false): void {
    const keepMirror = this.mirrorEl
    this.root.innerHTML = `
      <div class="hud-fps" data-h="fps" aria-hidden="true">— FPS</div>
      <button type="button" class="hud-pause-btn" id="btn-hud-pause" aria-label="${t('hud.pause')}">${t('hud.pause')}</button>
      <div class="hud-bottom">
        <div class="hud-speed-row">
          <div class="hud-speed" data-h="speed">0<span>km/h</span></div>
          <div class="hud-race-meta" data-h="raceMeta">—</div>
        </div>
        <div class="hud-race-clock" data-h="raceClock">0:00.00</div>
        <div class="hud-race-gap" data-h="raceGap" hidden></div>
        <div class="hud-gear" data-h="gear">${t('hud.gear')}: 1 (${t('hud.auto')})</div>
        <div class="hud-push" data-h="push" hidden>${t('hud.push')}</div>
      </div>
      <div class="hud-boost-flash" aria-hidden="true"></div>
    `
    if (keepMirror) {
      this.root.appendChild(keepMirror)
      keepMirror.classList.toggle('visible', this.mirrorFrame)
    } else if (this.mirrorFrame) {
      this.setMirrorFrame(true)
    }
    this.elRaceMeta = this.root.querySelector('[data-h="raceMeta"]')
    this.elRaceClock = this.root.querySelector('[data-h="raceClock"]')
    this.elRaceGap = this.root.querySelector('[data-h="raceGap"]')
    this.elSpeed = this.root.querySelector('[data-h="speed"]')
    this.elGear = this.root.querySelector('[data-h="gear"]')
    this.elFps = this.root.querySelector('[data-h="fps"]')
    this.helpKind = kind
    this.shellSandbox = sandbox
    this.shellLoop = loopRace
    this.built = true
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
        const total = driftComp ? driftPts : placePts + trickPts
        return { s, placePts, trickPts, driftPts, total }
      })
      if (fs || driftComp) scored.sort((a, b) => b.total - a.total || a.s.place - b.s.place)
      const champ = this.champResult
      const key = `fin:${race.playerPlace()}:${scored.map((x) => x.total).join(',')}:${fs ? 1 : 0}:${driftComp ? 1 : 0}:${champ?.progress ?? ''}:${champ?.done ? 1 : 0}`
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
            ? ` · FS ${row.total} (umístění ${row.placePts} + triky ${row.trickPts})`
            : driftComp
              ? ` · ${t('hud.driftScore')} ${row.driftPts}`
              : s.vehicle.driftPoints > 0
                ? ` · ${t('hud.drift')} ${s.vehicle.driftPoints}`
                : ''
          return `<li class="${cls}">${i + 1}. ${s.vehicle.info.name}${tag} — ${time}${fsLine}</li>`
        })
        .join('')
      const champLine = champ
        ? `<p class="overlay-hint">${t('hud.champRound', {
            progress: champ.progress,
            pts: champ.lastPts,
            total: champ.points,
          })}</p>`
        : ''
      const player = race.standings.find((s) => s.vehicle.info.isPlayer)
      const timeStr =
        player?.vehicle.finished ? formatTime(player.vehicle.finishTime) : '—'
      const scoreBit = fs
        ? scored.find((r) => r.s.vehicle.info.isPlayer)
        : driftComp
          ? scored.find((r) => r.s.vehicle.info.isPlayer)
          : null
      const extra =
        fs && scoreBit
          ? ` · FS ${scoreBit.total}`
          : driftComp && scoreBit
            ? ` · drift ${scoreBit.driftPts}`
            : ''
      this.shareText = `KlecMania · ${this.trackName} · P${place} · ${timeStr}${extra}`
      const shareBtn = `<button type="button" class="btn-ghost" id="btn-share"><span>${t('hud.share')}</span></button>`
      const actions = this.onlineRace
        ? `<button type="button" class="menu-start" id="btn-menu">${t('menu.onlineAfterRace')}</button>${shareBtn}`
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
      this.overlay.innerHTML = `
        <div class="overlay-card">
          <p class="overlay-winner">${t(placeKey)}</p>
          <h2>${t('hud.results')}${fs ? ' · Freestyle' : driftComp ? ` · ${t('hud.drift')}` : champ ? ` · ${t('comp.championship')}` : ''}</h2>
          <p>${this.trackName}</p>
          ${champLine}
          <ol>${rows}</ol>
          <div class="overlay-actions">${actions}</div>
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
    const key = `pause:${help.kind}`
    if (key === this.lastOverlayKey) return
    this.lastOverlayKey = key
    this.overlay.classList.add('visible')

    const binds = loadKeyBindings()
    const bindRows = pauseActionsFor(help.kind)
      .filter((a) => BIND_ACTION_ORDER.includes(a))
      .map((a) => {
        const [k0, k1] = binds[a]
        const keys = [codeLabel(k0), codeLabel(k1)].filter((x) => x !== '—').join(' / ')
        return `<li><strong>${t(`bind.${a}`)}</strong> — ${keys || '—'}</li>`
      })
      .join('')

    let trickBlock = ''
    if (help.kind === 'skate' || help.kind === 'bike') {
      const tricks = freestyleList(help.kind)
      const tb = loadTrickBindings()
      const cells = TRICK_LETTERS.map((ch) => {
        const def = tricks.find((tr) => tr.letter === ch)
        const name = def?.nameCs ?? ch
        return `<span class="pause-trick"><kbd>${codeLabel(tb[ch] ?? null)}</kbd> ${name}</span>`
      }).join('')
      trickBlock = `
        <h3>${t('pause.tricks')}</h3>
        <div class="pause-trick-grid">${cells}</div>
      `
    }

    this.overlay.innerHTML = `
      <div class="overlay-card pause-card">
        <h2>${t('pause.controls')}</h2>
        <p class="overlay-hint">${t('pause.escHint')}</p>
        <ul class="pause-binds">${bindRows}</ul>
        ${trickBlock}
        <div class="overlay-actions pause-actions">
          <button type="button" class="menu-start" id="btn-resume">${t('hud.resume')}</button>
          <button type="button" class="btn-ghost" id="btn-menu">${t('hud.menu')}</button>
        </div>
      </div>
    `
  }
}

/** Jen ovládání, které daný peklostroj skutečně používá. */
function pauseActionsFor(kind: VehicleKind): BindAction[] {
  const actions: BindAction[] = ['throttle', 'brake', 'steerLeft', 'steerRight']
  if (kind === 'skate') {
    actions.push('push', 'tab')
  } else if (kind === 'monster' || kind === 'truck' || kind === 'tank') {
    actions.push('push', 'tab')
  } else if (kind !== 'bike' && kind !== 'scooter') {
    actions.push('ebrake')
  }
  actions.push('camera', 'restart')
  return actions
}
