import { t } from '../i18n/i18n'
import {
  bindingActive,
  bindingJustPressed,
  loadKeyBindings,
  type KeyBindingsMap,
} from './KeyBindings'
import {
  codeToTrickLetter,
  loadTrickBindings,
  type TrickBindingsMap,
} from './TrickBindings'
import {
  DEFAULT_CONTROL_FEEL,
  type MobileDriveScheme,
} from './ControlFeel'
import { isMobileClient } from './MobileLook'

export { isMobileClient } from './MobileLook'

/**
 * Klávesnice (remapovatelná) + na telefonu režimy řízení (pads / joystick / tilt / tap).
 * Na mobilu jen klasická jízda — bez freestyle triků; boost (Tab) přes tlačítko.
 */
export class Input {
  readonly keys = new Set<string>()
  private readonly justPressed = new Set<string>()
  /**
   * Tab/Alt boost — odděleně od `keys`, protože Alt často spustí blur
   * okna a `keys.clear()` by boost hned zrušil (cyklista „nejede“).
   */
  private readonly tabBoostCodes = new Set<string>()
  /** QA / sticky — nepustí boost ani při syntetickém keyup po Alt. */
  private tabBoostForce = false
  /** QA — vynucený Space e-brake. */
  private ebrakeForce = false
  bindings: KeyBindingsMap = loadKeyBindings()
  trickBindings: TrickBindingsMap = loadTrickBindings()

  readonly mobile = isMobileClient()
  private mobileActive = false
  private scheme: MobileDriveScheme = DEFAULT_CONTROL_FEEL.mobileScheme

  private joySteer = 0
  private stickGas = 0
  private stickBrake = 0
  private btnGas = 0
  private btnBrake = 0
  private btnBoost = 0
  private tiltSteer = 0
  private tiltEnabled = false
  private tiltZeroGamma: number | null = null
  private tiltListener: ((e: DeviceOrientationEvent) => void) | null = null
  private autoGas = false

  private root: HTMLElement | null = null
  private stickEl: HTMLElement | null = null
  private knobEl: HTMLElement | null = null
  private pointerId: number | null = null
  private stickOrigin = { x: 0, y: 0 }
  private wheelPointerId: number | null = null
  private tapPointers = new Map<number, 'left' | 'right' | 'brake'>()
  /** Boost tlačítko jen u vozidel se Shift/turbo special. */
  private boostAllowed = false
  /** 4 FS triky na telefonu (portrait skate/bike). */
  private fsPadOn = false
  private fsPadKind: 'skate' | 'bike' = 'skate'
  private fsPadLetter: string | null = null

  constructor() {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return
      this.keys.add(e.code)
      this.justPressed.add(e.code)
      if (this.isTabBoostCode(e.code)) this.tabBoostCodes.add(e.code)
      if (
        e.code.startsWith('Arrow') ||
        e.code === 'Space' ||
        e.code === 'Tab' ||
        e.code === 'AltLeft' ||
        e.code === 'AltRight' ||
        e.code.startsWith('Control')
      ) {
        e.preventDefault()
      }
    })
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code)
      // Alt menu často pošle keyup i když hráč pořád drží / blur — neber to, dokud nemá focus
      if (this.isTabBoostCode(e.code) && !document.hasFocus()) return
      this.tabBoostCodes.delete(e.code)
    })
    window.addEventListener('blur', () => {
      // Nech Tab/Alt boost kódy — Alt blur ≠ puštění klávesy
      this.keys.clear()
      this.resetMobileAxes()
    })
  }

  private isTabBoostCode(code: string): boolean {
    // Default boost = Alt; Tab jen když je explicitně v remap
    if (code === 'AltLeft' || code === 'AltRight') return true
    const slots = this.bindings.tab
    return !!slots && (slots[0] === code || slots[1] === code)
  }

  reloadBindings(): void {
    this.bindings = loadKeyBindings()
    this.trickBindings = loadTrickBindings()
  }

  attachMobileUi(root: HTMLElement): void {
    if (!this.mobile) {
      root.hidden = true
      return
    }
    this.root = root
    this.rebuildMobileUi()
    this.setMobileHud(false)
  }

  /** Přepnutí režimu z nastavení Ovládání. */
  setMobileScheme(scheme: MobileDriveScheme): void {
    if (this.scheme === scheme && this.root?.dataset.scheme === scheme) return
    this.scheme = scheme
    if (!this.root || !this.mobile) return
    const wasVisible = this.mobileActive
    this.teardownTilt()
    this.resetMobileAxes()
    this.rebuildMobileUi()
    this.setMobileHud(wasVisible)
  }

  getMobileScheme(): MobileDriveScheme {
    return this.scheme
  }

  /** Zapne/vypne Boost v mobilním HUD podle peklostroje. */
  setMobileBoostAllowed(on: boolean): void {
    if (this.boostAllowed === on) return
    this.boostAllowed = on
    if (!on) this.btnBoost = 0
    if (this.root && this.mobile) {
      const wasVisible = this.mobileActive
      this.rebuildMobileUi()
      this.setMobileHud(wasVisible)
    }
  }

  /** Zapne 4 FS tlačítka (jen mobil + board). */
  setMobileFsPad(on: boolean, kind: 'skate' | 'bike' = 'skate'): void {
    const next = !!on && this.mobile
    if (this.fsPadOn === next && this.fsPadKind === kind) return
    this.fsPadOn = next
    this.fsPadKind = kind
    if (!next) this.fsPadLetter = null
    if (this.root && this.mobile) {
      const wasVisible = this.mobileActive
      this.rebuildMobileUi()
      this.setMobileHud(wasVisible)
    }
  }

  setMobileHud(visible: boolean): void {
    this.mobileActive = visible && this.mobile
    if (!this.root) return
    this.root.classList.toggle('mc-visible', this.mobileActive)
    this.root.dataset.scheme = this.scheme
    if (!this.mobileActive) {
      this.resetMobileAxes()
      return
    }
    if (this.scheme === 'tilt') void this.ensureTilt()
  }

  endFrame(): void {
    this.justPressed.clear()
  }

  pressed(code: string): boolean {
    return this.justPressed.has(code)
  }

  anyPressedExcept(...exclude: string[]): boolean {
    for (const code of this.justPressed) {
      if (!exclude.includes(code)) return true
    }
    return false
  }

  actionPressed(action: Parameters<typeof bindingJustPressed>[1]): boolean {
    return bindingJustPressed(this.bindings, action, this.justPressed)
  }

  get throttle(): number {
    if (this.actionHeld('throttle')) return 1
    if (!this.mobileActive) return 0
    if (this.autoGas && this.btnBrake < 0.5) return Math.max(0.85, this.btnGas, this.stickGas)
    return Math.max(this.btnGas, this.stickGas)
  }

  get brake(): number {
    if (this.actionHeld('brake')) return 1
    if (!this.mobileActive) return 0
    return Math.max(this.btnBrake, this.stickBrake)
  }

  steerSens = 1
  invertSteer = false

  get steer(): number {
    let s = 0
    if (this.actionHeld('steerLeft')) s += 1
    if (this.actionHeld('steerRight')) s -= 1
    if (this.mobileActive) {
      const m = clamp(this.joySteer + this.tiltSteer + this.tapSteer(), -1, 1)
      if (s === 0) s = m
      else if (Math.abs(m) > Math.abs(s)) s = m
    }
    if (this.invertSteer) s = -s
    return clamp(s * this.steerSens, -1, 1)
  }

  get push(): number {
    if (this.actionHeld('push')) return 1
    if (this.mobileActive && this.btnBoost > 0) return 1
    return 0
  }

  get tab(): number {
    if (this.tabBoostForce || this.tabBoostCodes.size > 0) return 1
    if (this.actionHeld('tab')) return 1
    // Alt L/R vždy = Tab boost (i když remap druhý slot přepsal AltLeft)
    if (this.keys.has('AltLeft') || this.keys.has('AltRight')) return 1
    if (this.mobileActive && this.btnBoost > 0) return 1
    return 0
  }

  /** QA / menu — vynutit nebo zrušit Tab·Alt boost bez reálné klávesy. */
  setTabBoostHeld(on: boolean, code = 'AltLeft'): void {
    this.tabBoostForce = !!on
    if (on) this.tabBoostCodes.add(code)
    else this.tabBoostCodes.clear()
  }

  /** QA — vynutit Space e-brake (drift). */
  setEbrakeHeld(on: boolean): void {
    this.ebrakeForce = !!on
    if (on) this.keys.add('Space')
    else this.keys.delete('Space')
  }

  /** QA — držet konkrétní kódy (řízení při drift testu). */
  setKeysHeld(codes: string[], on: boolean): void {
    for (const code of codes) {
      if (on) this.keys.add(code)
      else this.keys.delete(code)
    }
  }

  actionHeld(action: Parameters<typeof bindingActive>[1]): boolean {
    if (action === 'ebrake' && this.ebrakeForce) return true
    return bindingActive(this.bindings, action, this.keys)
  }

  /** Krátký buffer — trik se nezkazí, když keydown přijde těsně před endFrame. */
  private trickLetterBuf: string | null = null
  private trickLetterFrames = 0

  get trickLetter(): string | null {
    if (this.mobile) {
      if (this.fsPadLetter) {
        const L = this.fsPadLetter
        this.fsPadLetter = null
        return L
      }
      return null
    }
    for (const code of this.justPressed) {
      const letter = codeToTrickLetter(this.trickBindings, code)
      if (letter) {
        this.trickLetterBuf = letter
        this.trickLetterFrames = 3
        return letter
      }
    }
    if (this.trickLetterFrames > 0) {
      this.trickLetterFrames -= 1
      return this.trickLetterBuf
    }
    this.trickLetterBuf = null
    return null
  }

  get escapeHeld(): boolean {
    return this.keys.has('Escape') || this.actionHeld('menu')
  }

  /** Esc / Backspace / remap Menu — pauza ↔ nápověda ↔ menu. */
  get menuNavHeld(): boolean {
    return this.escapeHeld || this.keys.has('Backspace')
  }

  private tapSteer(): number {
    let s = 0
    for (const zone of this.tapPointers.values()) {
      if (zone === 'left') s += 1
      if (zone === 'right') s -= 1
    }
    return clamp(s, -1, 1)
  }

  private rebuildMobileUi(): void {
    const root = this.root
    if (!root) return
    this.autoGas = this.scheme === 'tilt' || this.scheme === 'tap'
    root.dataset.scheme = this.scheme
    root.dataset.fs = this.fsPadOn ? '1' : '0'
    root.innerHTML = this.schemeHtml(this.scheme) + this.fsPadHtml()
    this.stickEl = root.querySelector('#mc-stick')
    this.knobEl = root.querySelector('#mc-knob')
    this.bindScheme(root)
    this.bindFsPad(root)
  }

  private fsPadHtml(): string {
    if (!this.fsPadOn) return ''
    // Skate: Ollie / Kickflip / Heelflip / Tre · Bike: Bunny / Whip / Table / Barspin
    const slots =
      this.fsPadKind === 'bike'
        ? [
            { letter: 'A', label: 'Bunny' },
            { letter: 'H', label: 'Whip' },
            { letter: 'F', label: 'Table' },
            { letter: 'D', label: 'Spin' },
          ]
        : [
            { letter: 'A', label: 'Ollie' },
            { letter: 'F', label: 'Kick' },
            { letter: 'G', label: 'Heel' },
            { letter: 'K', label: 'Tre' },
          ]
    return `<div class="mc-fs-pad" id="mc-fs-pad" aria-label="Freestyle">
      ${slots
        .map(
          (s) =>
            `<button type="button" class="mc-fs-btn" data-fs-letter="${s.letter}"><span>${s.label}</span><small>${s.letter}</small></button>`,
        )
        .join('')}
    </div>`
  }

  private bindFsPad(root: HTMLElement): void {
    root.querySelectorAll<HTMLButtonElement>('[data-fs-letter]').forEach((btn) => {
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault()
        e.stopPropagation()
        const letter = btn.dataset.fsLetter
        if (letter) this.fsPadLetter = letter
        btn.classList.add('mc-active')
      })
      const end = () => btn.classList.remove('mc-active')
      btn.addEventListener('pointerup', end)
      btn.addEventListener('pointercancel', end)
      btn.addEventListener('pointerleave', end)
    })
  }

  private schemeHtml(scheme: MobileDriveScheme): string {
    const boost = this.boostAllowed
      ? `<button type="button" class="mc-btn mc-boost" id="mc-boost">${t('mobile.boost')}</button>`
      : ''
    const brakeCenter = `<button type="button" class="mc-btn mc-brake mc-brake-center" id="mc-brake">${t('mobile.brake')}</button>`
    if (scheme === 'joystick') {
      return `
        <div class="mc-stick" id="mc-stick" aria-label="Joystick">
          <div class="mc-stick-knob" id="mc-knob"></div>
        </div>
        ${brakeCenter}
        <div class="mc-buttons mc-buttons-right">
          <button type="button" class="mc-btn mc-gas" id="mc-gas">${t('mobile.gas')}</button>
          ${boost}
        </div>`
    }
    if (scheme === 'tilt') {
      return `
        <div class="mc-tilt-hint" id="mc-tilt-status">${t('mobile.tiltHint')}</div>
        ${brakeCenter}
        ${
          boost
            ? `<div class="mc-buttons mc-buttons-right mc-buttons-tilt">${boost}</div>`
            : ''
        }
        <button type="button" class="mc-tilt" id="mc-tilt">${t('mobile.tiltOn')}</button>`
    }
    if (scheme === 'tap') {
      const legend = this.boostAllowed ? t('mobile.tapLegend') : t('mobile.tapLegendNoBoost')
      return `
        <div class="mc-tap-layer" id="mc-tap-layer" aria-hidden="true">
          <div class="mc-tap-zone mc-tap-left" data-zone="left"><span>${t('mobile.tapLeft')}</span></div>
          <div class="mc-tap-zone mc-tap-brake" data-zone="brake"><span>${t('mobile.tapBrake')}</span></div>
          <div class="mc-tap-zone mc-tap-right" data-zone="right"><span>${t('mobile.tapRight')}</span></div>
        </div>
        ${boost ? `<div class="mc-buttons mc-buttons-float">${boost}</div>` : ''}
        <p class="mc-tap-legend">${legend}</p>`
    }
    // pads — volant vlevo, brzda střed, plyn/boost vpravo
    return `
      <div class="mc-wheel" id="mc-wheel" aria-label="${t('mobile.wheel')}">
        <div class="mc-wheel-track">
          <div class="mc-wheel-knob" id="mc-wheel-knob"></div>
        </div>
        <span class="mc-wheel-label">${t('mobile.wheel')}</span>
      </div>
      ${brakeCenter}
      <div class="mc-buttons mc-buttons-right">
        <button type="button" class="mc-btn mc-gas" id="mc-gas">${t('mobile.gas')}</button>
        ${boost}
      </div>`
  }

  private bindScheme(root: HTMLElement): void {
    const scheme = this.scheme
    if (scheme === 'joystick') {
      this.bindJoystick()
      this.bindHoldButton(root.querySelector('#mc-gas'), () => { this.btnGas = 1 }, () => { this.btnGas = 0 })
      this.bindHoldButton(root.querySelector('#mc-brake'), () => { this.btnBrake = 1 }, () => { this.btnBrake = 0 })
    } else if (scheme === 'tilt') {
      this.bindHoldButton(root.querySelector('#mc-brake'), () => { this.btnBrake = 1 }, () => { this.btnBrake = 0 })
      root.querySelector('#mc-tilt')?.addEventListener('click', () => {
        void this.ensureTilt(root.querySelector('#mc-tilt') as HTMLButtonElement | null)
      })
    } else if (scheme === 'tap') {
      this.bindTapZones(root.querySelector('#mc-tap-layer'))
    } else {
      this.bindWheel(root.querySelector('#mc-wheel'), root.querySelector('#mc-wheel-knob'))
      this.bindHoldButton(root.querySelector('#mc-gas'), () => { this.btnGas = 1 }, () => { this.btnGas = 0 })
      this.bindHoldButton(root.querySelector('#mc-brake'), () => { this.btnBrake = 1 }, () => { this.btnBrake = 0 })
    }
    this.bindHoldButton(root.querySelector('#mc-boost'), () => { this.btnBoost = 1 }, () => { this.btnBoost = 0 })
  }

  private bindHoldButton(
    el: Element | null,
    on: () => void,
    off: () => void,
  ): void {
    if (!(el instanceof HTMLElement)) return
    const start = (e: PointerEvent) => {
      e.preventDefault()
      e.stopPropagation()
      el.setPointerCapture(e.pointerId)
      el.classList.add('mc-active')
      on()
    }
    const end = () => {
      el.classList.remove('mc-active')
      off()
    }
    el.addEventListener('pointerdown', start)
    el.addEventListener('pointerup', end)
    el.addEventListener('pointercancel', end)
    el.addEventListener('pointerleave', end)
  }

  private resetMobileAxes(): void {
    this.joySteer = 0
    this.stickGas = 0
    this.stickBrake = 0
    this.btnGas = 0
    this.btnBrake = 0
    this.btnBoost = 0
    this.tiltSteer = 0
    this.pointerId = null
    this.wheelPointerId = null
    this.tapPointers.clear()
    if (this.knobEl) this.knobEl.style.transform = 'translate(-50%, -50%)'
    const wk = this.root?.querySelector<HTMLElement>('#mc-wheel-knob')
    if (wk) wk.style.transform = 'translate(-50%, -50%)'
  }

  private bindJoystick(): void {
    const stick = this.stickEl
    const knob = this.knobEl
    if (!stick || !knob) return

    const onDown = (e: PointerEvent) => {
      if (this.pointerId !== null) return
      e.preventDefault()
      this.pointerId = e.pointerId
      stick.setPointerCapture(e.pointerId)
      const r = stick.getBoundingClientRect()
      this.stickOrigin = { x: r.left + r.width / 2, y: r.top + r.height / 2 }
      this.applyStick(e.clientX, e.clientY, r.width / 2)
    }
    const onMove = (e: PointerEvent) => {
      if (e.pointerId !== this.pointerId) return
      e.preventDefault()
      const r = stick.getBoundingClientRect()
      this.applyStick(e.clientX, e.clientY, r.width / 2)
    }
    const onUp = (e: PointerEvent) => {
      if (e.pointerId !== this.pointerId) return
      this.pointerId = null
      this.joySteer = 0
      this.stickGas = 0
      this.stickBrake = 0
      knob.style.transform = 'translate(-50%, -50%)'
    }

    stick.addEventListener('pointerdown', onDown)
    stick.addEventListener('pointermove', onMove)
    stick.addEventListener('pointerup', onUp)
    stick.addEventListener('pointercancel', onUp)
  }

  private applyStick(clientX: number, clientY: number, radius: number): void {
    const dx = clientX - this.stickOrigin.x
    const dy = clientY - this.stickOrigin.y
    const max = Math.max(24, radius - 18)
    const dist = Math.hypot(dx, dy)
    const scale = dist > max ? max / dist : 1
    const x = dx * scale
    const y = dy * scale
    if (this.knobEl) {
      this.knobEl.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`
    }
    // Joystick = hlavně řízení; svisle jemný plyn/brzda jako bonus
    this.joySteer = clamp(-x / max, -1, 1)
    const vert = clamp(-y / max, -1, 1)
    this.stickGas = vert > 0.35 ? vert : 0
    this.stickBrake = vert < -0.35 ? -vert : 0
  }

  private bindWheel(wheel: Element | null, knob: Element | null): void {
    if (!(wheel instanceof HTMLElement) || !(knob instanceof HTMLElement)) return
    const apply = (clientX: number) => {
      const r = wheel.getBoundingClientRect()
      const mid = r.left + r.width / 2
      const half = Math.max(40, r.width / 2 - 12)
      const x = clamp(clientX - mid, -half, half)
      knob.style.transform = `translate(calc(-50% + ${x}px), -50%)`
      this.joySteer = clamp(-x / half, -1, 1)
    }
    wheel.addEventListener('pointerdown', (e) => {
      if (this.wheelPointerId !== null) return
      e.preventDefault()
      this.wheelPointerId = e.pointerId
      wheel.setPointerCapture(e.pointerId)
      apply(e.clientX)
    })
    wheel.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.wheelPointerId) return
      e.preventDefault()
      apply(e.clientX)
    })
    const end = (e: PointerEvent) => {
      if (e.pointerId !== this.wheelPointerId) return
      this.wheelPointerId = null
      this.joySteer = 0
      knob.style.transform = 'translate(-50%, -50%)'
    }
    wheel.addEventListener('pointerup', end)
    wheel.addEventListener('pointercancel', end)
  }

  private bindTapZones(layer: Element | null): void {
    if (!(layer instanceof HTMLElement)) return
    const zoneOf = (el: EventTarget | null): 'left' | 'right' | 'brake' | null => {
      const z = (el as HTMLElement | null)?.closest?.('[data-zone]') as HTMLElement | null
      const v = z?.dataset.zone
      if (v === 'left' || v === 'right' || v === 'brake') return v
      return null
    }
    layer.addEventListener('pointerdown', (e) => {
      const z = zoneOf(e.target)
      if (!z) return
      e.preventDefault()
      layer.setPointerCapture(e.pointerId)
      this.tapPointers.set(e.pointerId, z)
      if (z === 'brake') this.btnBrake = 1
      ;(e.target as HTMLElement).closest('.mc-tap-zone')?.classList.add('mc-active')
    })
    const clear = (e: PointerEvent) => {
      const z = this.tapPointers.get(e.pointerId)
      if (!z) return
      this.tapPointers.delete(e.pointerId)
      if (z === 'brake') {
        let still = false
        for (const v of this.tapPointers.values()) if (v === 'brake') still = true
        if (!still) this.btnBrake = 0
      }
      layer.querySelectorAll('.mc-tap-zone.mc-active').forEach((n) => {
        const id = (n as HTMLElement).dataset.zone
        let keep = false
        for (const v of this.tapPointers.values()) if (v === id) keep = true
        if (!keep) n.classList.remove('mc-active')
      })
    }
    layer.addEventListener('pointerup', clear)
    layer.addEventListener('pointercancel', clear)
  }

  private teardownTilt(): void {
    if (this.tiltListener) {
      window.removeEventListener('deviceorientation', this.tiltListener)
      this.tiltListener = null
    }
    this.tiltEnabled = false
    this.tiltZeroGamma = null
    this.tiltSteer = 0
  }

  /** Po otočení telefonu srovnej nulu (gamma/beta se prohodí). */
  recenterTilt(): void {
    if (!this.tiltEnabled) return
    this.tiltZeroGamma = null
    this.tiltSteer = 0
  }

  private portraitScreen(): boolean {
    return window.matchMedia('(orientation: portrait)').matches
  }

  private async ensureTilt(btn?: HTMLButtonElement | null): Promise<void> {
    const status = this.root?.querySelector('#mc-tilt-status')
    const label = btn ?? this.root?.querySelector('#mc-tilt')
    try {
      const DOE = DeviceOrientationEvent as unknown as {
        requestPermission?: () => Promise<PermissionState>
      }
      if (typeof DOE.requestPermission === 'function') {
        const state = await DOE.requestPermission()
        if (state !== 'granted') {
          if (label) label.textContent = t('mobile.tiltDenied')
          if (status) status.textContent = t('mobile.tiltDenied')
          return
        }
      }
      if (this.tiltEnabled) {
        this.tiltZeroGamma = null
        if (label) label.textContent = t('mobile.tiltRecal')
        if (status) status.textContent = t('mobile.tiltRecal')
        return
      }
      this.teardownTilt()
      this.tiltEnabled = true
      if (label) {
        label.textContent = t('mobile.tiltActive')
        label.classList.add('mc-active')
      }
      if (status) status.textContent = t('mobile.tiltActive')
      this.tiltListener = (e: DeviceOrientationEvent) => {
        if (!this.mobileActive || !this.tiltEnabled) return
        // Portrait: beta (předozadní náklon při držení na výšku) · landscape: gamma
        const portrait = this.portraitScreen()
        const raw = portrait ? (e.beta ?? 0) : (e.gamma ?? 0)
        if (this.tiltZeroGamma === null) this.tiltZeroGamma = raw
        const delta = raw - this.tiltZeroGamma
        const sens = portrait ? 34 : 28
        this.tiltSteer = clamp(-delta / sens, -1, 1)
      }
      window.addEventListener('deviceorientation', this.tiltListener)
    } catch {
      if (label) label.textContent = t('mobile.tiltUnavailable')
      if (status) status.textContent = t('mobile.tiltUnavailable')
    }
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}
