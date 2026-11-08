/** Zamčení na šířku na telefonu / tabletu (default). */

let allowPortrait = false
let started = false
let gateEl: HTMLElement | null = null

/** Jen reálný telefon/tablet — ne úzký desktop panel. */
function isPhoneOrTablet(): boolean {
  const ua = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
  const iPadOs = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
  return ua || iPadOs
}

function isPortrait(): boolean {
  if (window.matchMedia('(orientation: portrait)').matches) return true
  return window.innerHeight > window.innerWidth
}

function ensureGate(): HTMLElement {
  if (gateEl) return gateEl
  const el = document.createElement('div')
  el.id = 'rotate-gate'
  el.className = 'rotate-gate'
  el.setAttribute('aria-live', 'polite')
  el.hidden = true
  el.innerHTML = `
    <div class="rotate-gate-card">
      <p class="rotate-gate-title" data-rotate-title></p>
      <p class="rotate-gate-blurb" data-rotate-blurb></p>
    </div>
  `
  document.body.appendChild(el)
  gateEl = el
  return el
}

function setGateCopy(): void {
  const el = ensureGate()
  const title = el.querySelector('[data-rotate-title]')
  const blurb = el.querySelector('[data-rotate-blurb]')
  // Lazy import avoided — Game/i18n sets via updateRotateGateCopy from outside when locale changes
  if (title && !title.textContent) title.textContent = 'Otoč zařízení na šířku'
  if (blurb && !blurb.textContent) {
    blurb.textContent = 'Klec GP běží jako na PC — landscape. Otáčení na výšku zapneš v Nastavení → Ovládání.'
  }
}

export function updateRotateGateCopy(title: string, blurb: string): void {
  const el = ensureGate()
  const t = el.querySelector('[data-rotate-title]')
  const b = el.querySelector('[data-rotate-blurb]')
  if (t) t.textContent = title
  if (b) b.textContent = blurb
}

async function tryLockLandscape(): Promise<void> {
  if (allowPortrait || !isPhoneOrTablet()) return
  const orient = screen.orientation as ScreenOrientation & {
    lock?: (orientation: string) => Promise<void>
  }
  if (!orient?.lock) return
  try {
    await orient.lock('landscape')
  } catch {
    /* prohlížeč často povolí lock jen po gesture / v PWA */
  }
}

export function syncOrientationLock(): void {
  const mobile = isPhoneOrTablet()
  const force = mobile && !allowPortrait
  document.documentElement.classList.toggle('force-landscape', force)
  document.body.classList.toggle('is-portrait', isPortrait())
  document.body.classList.toggle('is-landscape', !isPortrait())

  const el = ensureGate()
  setGateCopy()
  const block = force && isPortrait()
  el.hidden = !block
  document.documentElement.classList.toggle('portrait-blocked', block)

  if (force && !isPortrait()) {
    void tryLockLandscape()
  }
}

export function setAllowPortraitRotation(allow: boolean): void {
  allowPortrait = allow
  syncOrientationLock()
  if (!allow) void tryLockLandscape()
}

export function getAllowPortraitRotation(): boolean {
  return allowPortrait
}

/** Volat po user gesture (entry / první tap) — lock funguje spolehlivěji. */
export function requestLandscapeAfterGesture(): void {
  void tryLockLandscape()
  syncOrientationLock()
}

export function startOrientationWatch(opts: {
  allowPortrait: boolean
  onChange?: () => void
}): void {
  allowPortrait = opts.allowPortrait
  if (started) {
    syncOrientationLock()
    return
  }
  started = true
  ensureGate()
  syncOrientationLock()

  const bump = () => {
    syncOrientationLock()
    opts.onChange?.()
  }
  window.addEventListener('orientationchange', bump)
  window.addEventListener('resize', bump)
  screen.orientation?.addEventListener?.('change', bump)
}
