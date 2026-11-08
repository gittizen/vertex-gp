import { GAME_STORAGE_NS } from '../input/KeyBindings'

/** Kvalita: default = plynulost. Cinematic = volitelný post-FX (seká na slabších PC). */
export type VisualQuality = 'perf' | 'balanced' | 'cinematic'

export type VisualSettingsValues = {
  quality: VisualQuality
  bloom: boolean
  shadows: boolean
  /** Funkční zpětné zrcátko (extra draw) — default vypnuto. */
  rearMirror: boolean
}

/** v2 — starý cinematic default zahodit kvůli FPS. */
const STORAGE_KEY = `${GAME_STORAGE_NS}.visual-v2`

export const DEFAULT_VISUAL: VisualSettingsValues = {
  quality: 'perf',
  bloom: false,
  shadows: false,
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
      bloom: !!p.bloom,
      shadows: !!p.shadows,
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
  // Max 1.25 i na cinematic — víc pixelů = stutter, ne hezčí tvary
  const cap = quality === 'cinematic' ? 1.25 : quality === 'balanced' ? 1.1 : 1
  return Math.min(window.devicePixelRatio || 1, cap)
}

export function bloomStrengthFor(quality: VisualQuality): number {
  if (quality === 'cinematic') return 0.28
  if (quality === 'balanced') return 0.18
  return 0.1
}

export function shadowMapSizeFor(quality: VisualQuality): number {
  if (quality === 'cinematic') return 1024
  if (quality === 'balanced') return 512
  return 256
}

/** Composer (bloom/grade) jen když uživatel opravdu chce. */
export function usePostFx(vals: VisualSettingsValues): boolean {
  return vals.bloom || vals.quality === 'cinematic'
}
