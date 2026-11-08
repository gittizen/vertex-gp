import { GAME_STORAGE_NS } from '../input/KeyBindings'

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
  bloom: false,
  shadows: true,
  rearMirror: false,
}

export const VISUAL_QUALITIES: VisualQuality[] = ['perf', 'balanced', 'cinematic']

export function loadVisualSettings(): VisualSettingsValues {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_VISUAL }
    const p = JSON.parse(raw) as Partial<VisualSettingsValues>
    const quality = VISUAL_QUALITIES.includes(p.quality as VisualQuality)
      ? (p.quality as VisualQuality)
      : DEFAULT_VISUAL.quality
    return {
      quality,
      bloom: p.bloom !== undefined ? !!p.bloom : DEFAULT_VISUAL.bloom,
      shadows: p.shadows !== undefined ? !!p.shadows : DEFAULT_VISUAL.shadows,
      rearMirror: !!p.rearMirror,
    }
  } catch {
    return { ...DEFAULT_VISUAL }
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
  if (quality === 'cinematic') return 0.22
  if (quality === 'balanced') return 0.12
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
