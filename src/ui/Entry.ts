import { TRACKS } from '../track/TrackDefs'
import { bindLangToggle, langToggleHtml, t } from '../i18n/i18n'
import {
  applyWatermarkTo,
  pickWatermarkTrack,
  trackWatermarkHtml,
} from './TrackWatermark'
import { brandLockupHtml } from './Brand'
import { GAME_VERSION_SHORT } from './GameVersion'
import { assetUrl } from './assetUrl'

/** Úvodní obrazovka — libovolná klávesa / tap → menu. */
export class Entry {
  private readonly root: HTMLElement
  private onEnter: (() => void) | null = null
  private keyHandler: ((e: KeyboardEvent) => void) | null = null
  private pointerHandler: ((e: PointerEvent) => void) | null = null
  private watermarkTimer: number | null = null
  /** Poslední 2 watermark tratě — další nesmí být z nich. */
  private recentTrackIds: string[] = []
  private currentTrackId = TRACKS[0]!.id

  constructor(root: HTMLElement) {
    this.root = root
  }

  setOnEnter(cb: () => void): void {
    this.onEnter = cb
  }

  show(): void {
    this.root.classList.add('entry-visible')
    this.recentTrackIds = []
    const first = pickWatermarkTrack()
    this.currentTrackId = first.id
    this.recentTrackIds = [first.id]
    this.render()
    this.startWatermarkRotation()
    this.unbind()
    this.keyHandler = (e) => {
      if ((e.target as HTMLElement | null)?.closest?.('.lang-toggle')) return
      this.enter()
    }
    this.pointerHandler = (e) => {
      if ((e.target as HTMLElement | null)?.closest?.('.lang-toggle')) return
      this.enter()
    }
    window.addEventListener('keydown', this.keyHandler)
    this.root.addEventListener('pointerdown', this.pointerHandler)
  }

  hide(): void {
    this.stopWatermarkRotation()
    this.unbind()
    this.root.classList.remove('entry-visible')
    this.root.innerHTML = ''
  }

  private render(): void {
    const def = TRACKS.find((t) => t.id === this.currentTrackId) ?? pickWatermarkTrack()
    this.root.innerHTML = `
      <img class="entry-bg" src="${assetUrl('brand/entry-bg-klec.jpg')}?v=light" alt="" decoding="async" />
      <div class="entry-bg-shade" aria-hidden="true"></div>
      ${trackWatermarkHtml(def)}
      ${langToggleHtml()}
      <div class="entry-shell">
        ${brandLockupHtml({ size: 'entry' })}
        <p class="entry-version">v${GAME_VERSION_SHORT}</p>
        <p class="entry-prompt">${t('entry.prompt')}</p>
      </div>
      <p class="entry-content-warn">${t('entry.contentWarn')}</p>
    `
    bindLangToggle(this.root, () => this.render())
  }

  private startWatermarkRotation(): void {
    this.stopWatermarkRotation()
    const holdMs = 8000
    const fadeMs = 2000
    this.watermarkTimer = window.setInterval(() => {
      const next = pickWatermarkTrack(this.recentTrackIds.slice(-2))
      this.currentTrackId = next.id
      this.recentTrackIds = [...this.recentTrackIds, next.id].slice(-2)
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

  private unbind(): void {
    if (this.keyHandler) {
      window.removeEventListener('keydown', this.keyHandler)
      this.keyHandler = null
    }
    if (this.pointerHandler) {
      this.root.removeEventListener('pointerdown', this.pointerHandler)
      this.pointerHandler = null
    }
  }

  private enter(): void {
    this.hide()
    this.onEnter?.()
  }
}
