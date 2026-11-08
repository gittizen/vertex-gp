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

/** Detekce telefonu / tabletu (dotyk + úzký viewport). */
export function isMobileClient(): boolean {
  const touch = navigator.maxTouchPoints > 0 || 'ontouchstart' in window
  const coarse = window.matchMedia('(pointer: coarse)').matches
  const narrow = Math.min(window.innerWidth, window.innerHeight) < 900
  const ua = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
  return touch && (coarse || ua || narrow)
}

/**
 * Klávesnice (remapovatelná) + na telefonu režimy řízení (pads / joystick / tilt / tap).
 * Na mobilu jen klasická jízda — bez freestyle triků; boost (Tab) přes tlačítko.
 */
export class Input {
  readonly keys = new Set<string>()
  private readonly justPressed = new Set<string>()
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

  constructor() {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return
      this.keys.add(e.code)
      this.justPressed.add(e.code)
      if (
        e.code.startsWith('Arrow') ||
        e.code === 'Space' ||
        e.code === 'Tab' ||
        e.code.startsWith('Alt') ||
        e.code.startsWith('Control')
      ) {
        e.preventDefault()
      }
    })
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code)
    })
    window.addEventListener('blur', () => {
      this.keys.clear()
      this.resetMobileAxes()
    })
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

  actionHeld(action: Parameters<typeof bindingActive>[1]): boolean {
    return bindingActive(this.bindings, action, this.keys)
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
    if (this.actionHeld('tab')) return 1
    if (this.mobileActive && this.btnBoost > 0) return 1
    return 0
  }

  /** Na mobilu vždy null — triky nejsou. */
  /** Krátký buffer — trik se nezkazí, když keydown přijde těsně před endFrame. */
  private trickLetterBuf: string | null = null
  private trickLetterFrames = 0

  get trickLetter(): string | null {
    if (this.mobile) return null
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
    root.innerHTML = this.schemeHtml(this.scheme)
    this.stickEl = root.querySelector('#mc-stick')
    this.knobEl = root.querySelector('#mc-knob')
    this.bindScheme(root)
  }

  private schemeHtml(scheme: MobileDriveScheme): string {
    const boost = `<button type="button" class="mc-btn mc-boost" id="mc-boost">${t('mobile.boost')}</button>`
    if (scheme === 'joystick') {
      return `
        <div class="mc-stick" id="mc-stick" aria-label="Joystick">
          <div class="mc-stick-knob" id="mc-knob"></div>
        </div>
        <div class="mc-buttons">
          <button type="button" class="mc-btn mc-brake" id="mc-brake">${t('mobile.brake')}</button>
          <button type="button" class="mc-btn mc-gas" id="mc-gas">${t('mobile.gas')}</button>
          ${boost}
        </div>`
    }
    if (scheme === 'tilt') {
      return `
        <div class="mc-tilt-hint" id="mc-tilt-status">${t('mobile.tiltHint')}</div>
        <div class="mc-buttons mc-buttons-tilt">
          <button type="button" class="mc-btn mc-brake mc-brake-wide" id="mc-brake">${t('mobile.brake')}</button>
          ${boost}
        </div>
        <button type="button" class="mc-tilt" id="mc-tilt">${t('mobile.tiltOn')}</button>`
    }
    if (scheme === 'tap') {
      return `
        <div class="mc-tap-layer" id="mc-tap-layer" aria-hidden="true">
          <div class="mc-tap-zone mc-tap-left" data-zone="left"><span>${t('mobile.tapLeft')}</span></div>
          <div class="mc-tap-zone mc-tap-brake" data-zone="brake"><span>${t('mobile.tapBrake')}</span></div>
          <div class="mc-tap-zone mc-tap-right" data-zone="right"><span>${t('mobile.tapRight')}</span></div>
        </div>
        <div class="mc-buttons mc-buttons-float">
          ${boost}
        </div>
        <p class="mc-tap-legend">${t('mobile.tapLegend')}</p>`
    }
    // pads — klasika z mobilních formulí: volant + plyn/brzda
    return `
      <div class="mc-wheel" id="mc-wheel" aria-label="${t('mobile.wheel')}">
        <div class="mc-wheel-track">
          <div class="mc-wheel-knob" id="mc-wheel-knob"></div>
        </div>
        <span class="mc-wheel-label">${t('mobile.wheel')}</span>
      </div>
      <div class="mc-buttons">
        <button type="button" class="mc-btn mc-brake" id="mc-brake">${t('mobile.brake')}</button>
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
        const gamma = e.gamma ?? 0
        if (this.tiltZeroGamma === null) this.tiltZeroGamma = gamma
        const delta = gamma - this.tiltZeroGamma
        this.tiltSteer = clamp(-delta / 28, -1, 1)
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
