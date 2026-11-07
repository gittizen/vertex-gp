import type { CameraController } from '../camera/CameraController'
import type { RaceManager } from '../race/RaceManager'
import { formatTime } from '../race/RaceManager'
import type { Vehicle } from '../vehicle/Vehicle'

/** HUD bez přepisování celého DOM každý frame. */
export class Hud {
  private readonly root: HTMLElement
  private readonly overlay: HTMLElement
  private trackName = 'Nordring'
  private onMenuRequest: (() => void) | null = null
  private onRestartRequest: (() => void) | null = null
  private built = false
  private elPlace: HTMLElement | null = null
  private elLap: HTMLElement | null = null
  private elLapTime: HTMLElement | null = null
  private elBest: HTMLElement | null = null
  private elCam: HTMLElement | null = null
  private elSpeed: HTMLElement | null = null
  private elGear: HTMLElement | null = null
  private lastOverlayKey = ''
  private hudAcc = 0

  constructor(root: HTMLElement, overlay: HTMLElement) {
    this.root = root
    this.overlay = overlay
  }

  setTrackName(name: string): void {
    this.trackName = name
  }

  setOnMenuRequest(cb: () => void): void {
    this.onMenuRequest = cb
  }

  setOnRestartRequest(cb: () => void): void {
    this.onRestartRequest = cb
  }

  update(
    player: Vehicle,
    race: RaceManager,
    camera: CameraController,
    showHud: boolean,
  ): void {
    if (!showHud) {
      this.root.innerHTML = ''
      this.built = false
      this.overlay.classList.remove('visible')
      this.overlay.innerHTML = ''
      this.lastOverlayKey = ''
      return
    }

    if (!this.built) this.buildShell()

    // Text/pozice stačí ~10×/s — méně layout thrashing
    this.hudAcc++
    if (this.hudAcc >= 3 || race.phase !== 'racing') {
      this.hudAcc = 0
      const place = race.playerPlace()
      const lap = race.displayLap(player)
      const lapTime =
        race.phase === 'racing' || race.phase === 'finished'
          ? race.raceTimeMs - player.currentLapStart
          : 0
      if (this.elPlace) this.elPlace.textContent = `${place}/${race.standings.length || 4}`
      if (this.elLap) this.elLap.textContent = `${lap}/${race.totalLaps}`
      if (this.elLapTime) this.elLapTime.textContent = formatTime(lapTime)
      if (this.elBest) this.elBest.textContent = formatTime(player.bestLapMs)
      if (this.elCam) this.elCam.textContent = camera.modeLabel
      if (this.elGear) {
        this.elGear.textContent = `Převod: ${player.physics.gear < 0 ? 'R' : player.physics.gear} (automat)`
      }
    }

    if (this.elSpeed) {
      this.elSpeed.innerHTML = `${Math.round(player.physics.speedKmh)}<span>km/h</span>`
    }

    this.renderOverlay(race)
  }

  private buildShell(): void {
    this.root.innerHTML = `
      <div class="hud-top">
        <div><span class="label">Pozice</span><span data-h="place">-</span></div>
        <div><span class="label">Kolo</span><span data-h="lap">-</span></div>
        <div><span class="label">Čas kola</span><span data-h="lapTime">-</span></div>
        <div><span class="label">Nejlepší</span><span data-h="best">-</span></div>
        <div><span class="label">Kamera</span><span data-h="cam">2.5D</span></div>
      </div>
      <div class="hud-bottom">
        <div class="hud-speed" data-h="speed">0<span>km/h</span></div>
        <div class="hud-gear" data-h="gear">Převod: 1 (automat)</div>
      </div>
      <div class="hud-help">
        Šipky / WASD — řízení<br/>
        Pohled 2.5D<br/>
        R — restart (solo) · Esc — menu
      </div>
    `
    this.elPlace = this.root.querySelector('[data-h="place"]')
    this.elLap = this.root.querySelector('[data-h="lap"]')
    this.elLapTime = this.root.querySelector('[data-h="lapTime"]')
    this.elBest = this.root.querySelector('[data-h="best"]')
    this.elCam = this.root.querySelector('[data-h="cam"]')
    this.elSpeed = this.root.querySelector('[data-h="speed"]')
    this.elGear = this.root.querySelector('[data-h="gear"]')
    this.built = true
  }

  private renderOverlay(race: RaceManager): void {
    if (race.phase === 'countdown') {
      const text = race.countdown > 0 ? String(race.countdown) : 'START'
      const key = `cd:${text}`
      if (key === this.lastOverlayKey) return
      this.lastOverlayKey = key
      this.overlay.classList.add('visible')
      this.overlay.innerHTML = `
        <div class="overlay-card">
          <h1>${text}</h1>
          <p>Vertex GP — ${this.trackName}</p>
        </div>
      `
      return
    }

    if (race.phase === 'finished') {
      const key = `fin:${race.playerPlace()}:${race.standings.map((s) => s.vehicle.finishTime).join(',')}`
      if (key === this.lastOverlayKey) return
      this.lastOverlayKey = key
      this.overlay.classList.add('visible')
      const rows = race.standings
        .map((s) => {
          const cls = s.vehicle.info.isPlayer ? 'player-row' : ''
          const time = formatTime(s.vehicle.finishTime)
          return `<li class="${cls}">${s.place}. ${s.vehicle.info.name} (${s.vehicle.info.team}) — ${time}</li>`
        })
        .join('')
      this.overlay.innerHTML = `
        <div class="overlay-card">
          <h2>Výsledky</h2>
          <p>Dojel jsi na ${race.playerPlace()}. místě · ${this.trackName}</p>
          <ol>${rows}</ol>
          <div class="overlay-actions">
            <button type="button" class="menu-start" id="btn-restart">Znovu (R)</button>
            <button type="button" class="btn-ghost" id="btn-menu">Menu (Esc)</button>
          </div>
        </div>
      `
      this.overlay.querySelector('#btn-menu')?.addEventListener('click', () => this.onMenuRequest?.())
      this.overlay.querySelector('#btn-restart')?.addEventListener('click', () => this.onRestartRequest?.())
      return
    }

    if (this.lastOverlayKey !== 'race') {
      this.lastOverlayKey = 'race'
      this.overlay.classList.remove('visible')
      this.overlay.innerHTML = ''
    }
  }
}
