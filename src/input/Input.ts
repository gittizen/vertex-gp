import { t } from '../i18n/i18n'
import { bindingActive, bindingJustPressed, loadKeyBindings, type KeyBindingsMap } from './KeyBindings'
import {
  codeToTrickLetter,
  loadTrickBindings,
  type TrickBindingsMap,
} from './TrickBindings'

/** Detekce telefonu / tabletu (dotyk + úzký viewport). */
export function isMobileClient(): boolean {
  const touch = navigator.maxTouchPoints > 0 || 'ontouchstart' in window
  const coarse = window.matchMedia('(pointer: coarse)').matches
  const narrow = Math.min(window.innerWidth, window.innerHeight) < 900
  const ua = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
  return touch && (coarse || ua || narrow)
}

/**
 * Klávesnice (remapovatelná) + na telefonu joystick.
 * Základní řízení: šipky. Freestyle triky: písmena A–Z.
 */
export class Input {
  readonly keys = new Set<string>()
  private readonly justPressed = new Set<string>()
  bindings: KeyBindingsMap = loadKeyBindings()
  trickBindings: TrickBindingsMap = loadTrickBindings()

  readonly mobile = isMobileClient()
  private mobileActive = false

  private joySteer = 0
  private stickGas = 0
  private stickBrake = 0
  private btnGas = 0
  private btnBrake = 0
  private tiltSteer = 0
  private tiltEnabled = false
  private tiltZeroGamma: number | null = null

  private root: HTMLElement | null = null
  private stickEl: HTMLElement | null = null
  private knobEl: HTMLElement | null = null
  private pointerId: number | null = null
  private stickOrigin = { x: 0, y: 0 }

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
    root.innerHTML = `
      <div class="mc-stick" id="mc-stick" aria-label="Joystick">
        <div class="mc-stick-knob" id="mc-knob"></div>
      </div>
      <div class="mc-buttons">
        <button type="button" class="mc-btn mc-brake" id="mc-brake">${t('mobile.brake')}</button>
        <button type="button" class="mc-btn mc-gas" id="mc-gas">${t('mobile.gas')}</button>
      </div>
      <button type="button" class="mc-tilt" id="mc-tilt">${t('mobile.tiltOn')}</button>
    `
    this.stickEl = root.querySelector('#mc-stick')
    this.knobEl = root.querySelector('#mc-knob')
    this.bindJoystick()
    this.bindButtons(root.querySelector('#mc-gas')!, root.querySelector('#mc-brake')!)
    root.querySelector('#mc-tilt')?.addEventListener('click', () => {
      void this.enableTilt(root.querySelector('#mc-tilt') as HTMLButtonElement)
    })
    this.setMobileHud(false)
  }

  setMobileHud(visible: boolean): void {
    this.mobileActive = visible && this.mobile
    if (!this.root) return
    this.root.classList.toggle('mc-visible', this.mobileActive)
    if (!this.mobileActive) this.resetMobileAxes()
  }

  endFrame(): void {
    this.justPressed.clear()
  }

  pressed(code: string): boolean {
    return this.justPressed.has(code)
  }

  /** Libovolná právě stisknutá klávesa mimo výjimky (pauza → zpět do hry). */
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
    return Math.max(this.btnGas, this.stickGas)
  }

  get brake(): number {
    if (this.actionHeld('brake')) return 1
    if (!this.mobileActive) return 0
    return Math.max(this.btnBrake, this.stickBrake)
  }

  /** Citlivost / invert z nastavení ovládání. */
  steerSens = 1
  invertSteer = false

  get steer(): number {
    let s = 0
    if (this.actionHeld('steerLeft')) s += 1
    if (this.actionHeld('steerRight')) s -= 1
    if (this.mobileActive) {
      const m = clamp(this.joySteer + this.tiltSteer, -1, 1)
      if (s === 0) s = m
      else if (Math.abs(m) > Math.abs(s)) s = m
    }
    if (this.invertSteer) s = -s
    return clamp(s * this.steerSens, -1, 1)
  }

  get push(): number {
    return this.actionHeld('push') ? 1 : 0
  }

  get tab(): number {
    return this.actionHeld('tab') ? 1 : 0
  }

  /** První právě stisknutá remapovaná klávesa freestyle triku. */
  get trickLetter(): string | null {
    for (const code of this.justPressed) {
      const letter = codeToTrickLetter(this.trickBindings, code)
      if (letter) return letter
    }
    return null
  }

  /** Escape držen (pro hold-to-menu). */
  get escapeHeld(): boolean {
    return this.keys.has('Escape') || this.actionHeld('menu')
  }

  private resetMobileAxes(): void {
    this.joySteer = 0
    this.stickGas = 0
    this.stickBrake = 0
    this.btnGas = 0
    this.btnBrake = 0
    this.tiltSteer = 0
    this.pointerId = null
    if (this.knobEl) this.knobEl.style.transform = 'translate(-50%, -50%)'
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
    this.joySteer = clamp(-x / max, -1, 1)
    const vert = clamp(-y / max, -1, 1)
    this.stickGas = vert > 0.2 ? vert : 0
    this.stickBrake = vert < -0.2 ? -vert : 0
  }

  private bindButtons(gas: HTMLElement, brake: HTMLElement): void {
    const hold = (el: HTMLElement, on: () => void, off: () => void) => {
      const start = (e: PointerEvent) => {
        e.preventDefault()
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
    }
    hold(gas, () => { this.btnGas = 1 }, () => { this.btnGas = 0 })
    hold(brake, () => { this.btnBrake = 1 }, () => { this.btnBrake = 0 })
  }

  private async enableTilt(btn: HTMLButtonElement): Promise<void> {
    try {
      const DOE = DeviceOrientationEvent as unknown as {
        requestPermission?: () => Promise<PermissionState>
      }
      if (typeof DOE.requestPermission === 'function') {
        const state = await DOE.requestPermission()
        if (state !== 'granted') {
          btn.textContent = t('mobile.tiltDenied')
          return
        }
      }
      if (this.tiltEnabled) {
        this.tiltZeroGamma = null
        btn.textContent = t('mobile.tiltRecal')
        return
      }
      this.tiltEnabled = true
      btn.textContent = t('mobile.tiltActive')
      btn.classList.add('mc-active')
      window.addEventListener('deviceorientation', (e) => {
        if (!this.mobileActive || !this.tiltEnabled) return
        const gamma = e.gamma ?? 0
        if (this.tiltZeroGamma === null) this.tiltZeroGamma = gamma
        const delta = gamma - this.tiltZeroGamma
        this.tiltSteer = clamp(-delta / 28, -1, 1)
      })
    } catch {
      btn.textContent = t('mobile.tiltUnavailable')
    }
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}
