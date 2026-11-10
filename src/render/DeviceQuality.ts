import { GAME_STORAGE_NS } from '../input/KeyBindings'
import type { VisualQuality, VisualSettingsValues } from './VisualSettings'

const AUTO_FLAG = `${GAME_STORAGE_NS}.visual-auto-v1`
const SUGGEST_KEY = `${GAME_STORAGE_NS}.visual-suggest-v1`

function flagsFor(quality: VisualQuality): Pick<VisualSettingsValues, 'bloom' | 'shadows' | 'rearMirror'> {
  if (quality === 'perf') return { bloom: false, shadows: false, rearMirror: false }
  if (quality === 'balanced') return { bloom: true, shadows: true, rearMirror: false }
  return { bloom: true, shadows: true, rearMirror: true }
}

/**
 * Odhad kvality podle zařízení — nepreferuje zbytečně perf na silném telefonu.
 * Cinematic nikdy auto (jen ručně).
 */
export function suggestVisualQuality(): VisualQuality {
  const cores = navigator.hardwareConcurrency || 4
  const mem =
    typeof (navigator as Navigator & { deviceMemory?: number }).deviceMemory === 'number'
      ? (navigator as Navigator & { deviceMemory?: number }).deviceMemory!
      : 4
  const ua = navigator.userAgent
  const lowPhone = /Android [4-8]|iPhone (OS )?[6-9]_|iPhone10,/i.test(ua)
  let glScore = 1
  try {
    const c = document.createElement('canvas')
    const gl =
      (c.getContext('webgl2') as WebGL2RenderingContext | null) ||
      (c.getContext('webgl') as WebGLRenderingContext | null)
    if (gl) {
      const dbg = gl.getExtension('WEBGL_debug_renderer_info')
      const renderer = dbg
        ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || '')
        : ''
      const maxTex = Number(gl.getParameter(gl.MAX_TEXTURE_SIZE) || 0)
      if (maxTex >= 8192) glScore += 1
      if (maxTex >= 16384) glScore += 1
      if (/Adreno \(TM\) (6|7|8)|Mali-G7|Apple GPU|Apple A1[5-9]|Apple A[2-9]|GeForce|Radeon|Intel\(R\) Iris/i.test(renderer)) {
        glScore += 1
      }
      if (/SwiftShader|Microsoft Basic|llvmpipe/i.test(renderer)) glScore -= 2
    }
  } catch {
    /* ignore */
  }

  if (lowPhone || mem <= 2 || (cores <= 4 && glScore <= 1)) return 'perf'
  if (mem >= 6 && cores >= 6 && glScore >= 2) return 'balanced'
  if (glScore >= 2 || mem >= 4) return 'balanced'
  return 'perf'
}

export function suggestedVisualSettings(): VisualSettingsValues {
  const quality = suggestVisualQuality()
  return { quality, ...flagsFor(quality) }
}

export function hasAppliedAutoVisual(): boolean {
  try {
    return localStorage.getItem(AUTO_FLAG) === '1'
  } catch {
    return true
  }
}

export function markAutoVisualApplied(quality: VisualQuality): void {
  try {
    localStorage.setItem(AUTO_FLAG, '1')
    localStorage.setItem(SUGGEST_KEY, quality)
  } catch {
    /* ignore */
  }
}

export function lastSuggestedQuality(): VisualQuality | null {
  try {
    const q = localStorage.getItem(SUGGEST_KEY)
    if (q === 'perf' || q === 'balanced' || q === 'cinematic') return q
  } catch {
    /* ignore */
  }
  return null
}

/** Jednorázově při první instalaci nastav doporučenou kvalitu. */
export function applyAutoVisualOnce(
  current: VisualSettingsValues,
  save: (v: VisualSettingsValues) => void,
): VisualSettingsValues {
  if (hasAppliedAutoVisual()) return current
  const next = suggestedVisualSettings()
  save(next)
  markAutoVisualApplied(next.quality)
  return next
}
