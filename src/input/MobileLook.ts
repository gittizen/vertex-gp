/** Detekce telefonu / tabletu (dotyk + úzký viewport). */
export function isMobileClient(): boolean {
  const touch = navigator.maxTouchPoints > 0 || 'ontouchstart' in window
  const coarse = window.matchMedia('(pointer: coarse)').matches
  const narrow = Math.min(window.innerWidth, window.innerHeight) < 900
  const ua = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
  return touch && (coarse || ua || narrow)
}

/** Na telefonu oddálit look ~1.5× (PC = 1). */
export const MOBILE_LOOK_OUT = 1.5

export function mobileLookActive(): boolean {
  return isMobileClient()
}

/** Násobitel vzdálenosti kamery (1.5 na mobilu). */
export function mobileCamDist(): number {
  return mobileLookActive() ? MOBILE_LOOK_OUT : 1
}

/** UI zmenšení (1/1.5), ať text/HUD nejsou „v obličeji“. */
export function mobileUiFactor(): number {
  return mobileLookActive() ? 1 / MOBILE_LOOK_OUT : 1
}

/** CSS proměnné + třída na <html> pro menu / safe layout. */
export function applyMobileLookCss(): void {
  const root = document.documentElement
  const on = mobileLookActive()
  root.classList.toggle('mobile-look', on)
  root.style.setProperty('--mobile-look', on ? String(MOBILE_LOOK_OUT) : '1')
  root.style.setProperty('--mobile-ui', on ? String(1 / MOBILE_LOOK_OUT) : '1')
}

/**
 * visualViewport — layout pod adresním řádkem / in-app chrome.
 * Vrací cleanup.
 */
export function installVisualViewportSync(onChange?: () => void): () => void {
  const sync = () => {
    const vv = window.visualViewport
    const h = vv?.height ?? window.innerHeight
    const w = vv?.width ?? window.innerWidth
    const top = vv?.offsetTop ?? 0
    const left = vv?.offsetLeft ?? 0
    const root = document.documentElement
    root.style.setProperty('--vvh', `${Math.round(h)}px`)
    root.style.setProperty('--vvw', `${Math.round(w)}px`)
    root.style.setProperty('--vv-top', `${Math.round(top)}px`)
    root.style.setProperty('--vv-left', `${Math.round(left)}px`)
    onChange?.()
  }
  sync()
  const vv = window.visualViewport
  vv?.addEventListener('resize', sync)
  vv?.addEventListener('scroll', sync)
  window.addEventListener('resize', sync)
  window.addEventListener('orientationchange', sync)
  return () => {
    vv?.removeEventListener('resize', sync)
    vv?.removeEventListener('scroll', sync)
    window.removeEventListener('resize', sync)
    window.removeEventListener('orientationchange', sync)
  }
}
