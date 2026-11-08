import { GAME_STORAGE_NS } from './KeyBindings'

export type CamFollow = 'soft' | 'normal' | 'tight'

/** Režimy řízení na telefonu / tabletu (ve hrách formulí běžné). */
export type MobileDriveScheme = 'joystick' | 'tilt' | 'tap' | 'pads'

export type ControlFeelValues = {
  /** 0.55–1.45 — násobitel řízení */
  steerSens: number
  invertSteer: boolean
  camFollow: CamFollow
  /** Mírná pomoc při smyku (sníží boční smyk). */
  stabilityAssist: boolean
  /** Space e-brake drift (NFS styl) — platí na všech tratích, ne na mapě. */
  driftMode: boolean
  /** 0.75–1.35 — velikost HUD */
  hudScale: number
  /** Dotykové řízení — platí jen na telefonu / tabletu. */
  mobileScheme: MobileDriveScheme
}

const STORAGE_KEY = `${GAME_STORAGE_NS}.control-feel`

export const DEFAULT_CONTROL_FEEL: ControlFeelValues = {
  steerSens: 1,
  invertSteer: false,
  camFollow: 'normal',
  stabilityAssist: false,
  driftMode: false,
  hudScale: 1,
  mobileScheme: 'pads',
}

const CAM_FOLLOWS: CamFollow[] = ['soft', 'normal', 'tight']
export const MOBILE_DRIVE_SCHEMES: MobileDriveScheme[] = ['pads', 'joystick', 'tilt', 'tap']

function migrateMobileScheme(raw: unknown): MobileDriveScheme {
  if (typeof raw === 'string' && MOBILE_DRIVE_SCHEMES.includes(raw as MobileDriveScheme)) {
    return raw as MobileDriveScheme
  }
  return DEFAULT_CONTROL_FEEL.mobileScheme
}

export function loadControlFeel(): ControlFeelValues {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_CONTROL_FEEL }
    const p = JSON.parse(raw) as Partial<ControlFeelValues>
    const steerSens =
      typeof p.steerSens === 'number' && Number.isFinite(p.steerSens)
        ? Math.max(0.55, Math.min(1.45, p.steerSens))
        : DEFAULT_CONTROL_FEEL.steerSens
    const hudScale =
      typeof p.hudScale === 'number' && Number.isFinite(p.hudScale)
        ? Math.max(0.75, Math.min(1.35, p.hudScale))
        : DEFAULT_CONTROL_FEEL.hudScale
    return {
      steerSens,
      invertSteer: !!p.invertSteer,
      camFollow: CAM_FOLLOWS.includes(p.camFollow as CamFollow)
        ? (p.camFollow as CamFollow)
        : DEFAULT_CONTROL_FEEL.camFollow,
      stabilityAssist: !!p.stabilityAssist,
      driftMode: !!p.driftMode,
      hudScale,
      mobileScheme: migrateMobileScheme(p.mobileScheme),
    }
  } catch {
    return { ...DEFAULT_CONTROL_FEEL }
  }
}

export function saveControlFeel(vals: ControlFeelValues): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(vals))
}

export function camFollowRate(follow: CamFollow): number {
  if (follow === 'soft') return 4.5
  if (follow === 'tight') return 14
  return 8
}

export function applyHudScale(scale: number): void {
  const el = document.getElementById('hud')
  if (!el) return
  const s = Math.max(0.75, Math.min(1.35, scale))
  el.style.setProperty('--hud-scale', String(s))
}
