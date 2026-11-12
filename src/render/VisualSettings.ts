import { GAME_STORAGE_NS } from '../input/KeyBindings'
import { applyAutoVisualOnce, suggestedVisualSettings } from './DeviceQuality'

/** Kvalita: default balanced = moderní look + plynulost. Cinematic = max post-FX. */
export type VisualQuality = 'perf' | 'balanced' | 'cinematic'

export type VisualSettingsValues = {
  quality: VisualQuality
  bloom: boolean
  shadows: boolean
  /** Funkční zpětné zrcátko (extra draw) — default vypnuto. */
  rearMirror: boolean
}

/** v3 — default balanced (dospělý look 2026). */
const STORAGE_KEY = `${GAME_STORAGE_NS}.visual-v3`

export const DEFAULT_VISUAL: VisualSettingsValues = {
  quality: 'balanced',
  bloom: true,
  shadows: true,
  rearMirror: false,
}

export const VISUAL_QUALITIES: VisualQuality[] = ['perf', 'balanced', 'cinematic']

/** Jednorázově vypni zrcátko, pokud ho dřív zapnula předvolba Cinematic. */
const MIRROR_OFF_FLAG = `${GAME_STORAGE_NS}.visual-mirror-default-off-v1`

export function loadVisualSettings(): VisualSettingsValues {
  const fallback = suggestedVisualSettings()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      // První start: ulož doporučení podle zařízení (ne vždy perf)
      const auto = applyAutoVisualOnce(fallback, saveVisualSettings)
      return auto
    }
    const p = JSON.parse(raw) as Partial<VisualSettingsValues>
    const quality = VISUAL_QUALITIES.includes(p.quality as VisualQuality)
      ? (p.quality as VisualQuality)
      : fallback.quality
    let rearMirror = !!p.rearMirror
    // Zrcátko není default — jednou vypni staré auto-zapnutí z Cinematic.
    if (!localStorage.getItem(MIRROR_OFF_FLAG)) {
      try {
        localStorage.setItem(MIRROR_OFF_FLAG, '1')
      } catch {
        /* ignore */
      }
      rearMirror = false
    }
    const out: VisualSettingsValues = {
      quality,
      bloom: p.bloom !== undefined ? !!p.bloom : fallback.bloom,
      shadows: p.shadows !== undefined ? !!p.shadows : fallback.shadows,
      rearMirror,
    }
    if (rearMirror !== !!p.rearMirror) saveVisualSettings(out)
    return out
  } catch {
    return fallback
  }
}

export function saveVisualSettings(vals: VisualSettingsValues): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(vals))
}

export function pixelRatioFor(quality: VisualQuality): number {
  const cap = quality === 'cinematic' ? 1.25 : quality === 'balanced' ? 1.1 : 1
  return Math.min(window.devicePixelRatio || 1, cap)
}

export function bloomStrengthFor(quality: VisualQuality): number {
  if (quality === 'cinematic') return 0.28
  if (quality === 'balanced') return 0.16
  return 0.08
}

export function shadowMapSizeFor(quality: VisualQuality): number {
  if (quality === 'cinematic') return 2048
  if (quality === 'balanced') return 1024
  return 512
}

/** Composer (bloom/grade) — balanced má lehký grade bez bloom, pokud bloom=false. */
export function usePostFx(vals: VisualSettingsValues): boolean {
  return vals.bloom || vals.quality === 'cinematic' || vals.quality === 'balanced'
}

export function useGradeOnly(vals: VisualSettingsValues): boolean {
  return vals.quality === 'balanced' && !vals.bloom
}

/** Auto-nastavení bloom / stínů / zrcátka podle předvolby kvality. */
export function visualFlagsForQuality(quality: VisualQuality): Pick<
  VisualSettingsValues,
  'bloom' | 'shadows' | 'rearMirror'
> {
  // Zrcátko nikdy automaticky — jen ručně v Atmosféře (extra draw / FPS).
  if (quality === 'perf') return { bloom: false, shadows: false, rearMirror: false }
  if (quality === 'balanced') return { bloom: true, shadows: true, rearMirror: false }
  return { bloom: true, shadows: true, rearMirror: false }
}
