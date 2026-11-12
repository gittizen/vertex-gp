import { GAME_STORAGE_NS } from './KeyBindings'

export type CamFollow = 'soft' | 'normal' | 'tight'

/** Skate: Regular = levá noha vpředu, Goofy = pravá. */
export type SkateStance = 'regular' | 'goofy'

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
  /** Povolit portrait na telefonu/tabletu. Default false = jen šířka. */
  allowPortraitRotation: boolean
  /** Solo: bez pádu / bouračky. Na žebříčku s duchem; online ignorovat. */
  immortality: boolean
  /** Skate stance — Regular / Goofy (natočení ~45° + zrcadlení). */
  skateStance: SkateStance
}

const STORAGE_KEY = `${GAME_STORAGE_NS}.control-feel`

export const DEFAULT_CONTROL_FEEL: ControlFeelValues = {
  steerSens: 1,
  invertSteer: false,
  camFollow: 'normal',
  stabilityAssist: false,
  /** 0.7: Space = e-brake u aut/moto (ne skate/kolo). */
  driftMode: true,
  hudScale: 1,
  /** Default telefon: ťukání stran. */
  mobileScheme: 'tap',
  /** Otáčení volné — landscape doporučený, portrait OK (Messenger/in-app). */
  allowPortraitRotation: true,
  immortality: false,
  skateStance: 'regular',
}

const CAM_FOLLOWS: CamFollow[] = ['soft', 'normal', 'tight']
export const SKATE_STANCES: SkateStance[] = ['regular', 'goofy']
/** Pořadí v UI: ťukání → joystick → náklon → volant. */
export const MOBILE_DRIVE_SCHEMES: MobileDriveScheme[] = ['tap', 'joystick', 'tilt', 'pads']

function migrateMobileScheme(raw: unknown): MobileDriveScheme {
  // Jednorázově: staré defaulty → tap
  const flag = `${GAME_STORAGE_NS}.v07-mobile-tap-default`
  if (!localStorage.getItem(flag)) {
    try {
      localStorage.setItem(flag, '1')
    } catch {
      /* ignore */
    }
    return 'tap'
  }
  if (typeof raw === 'string' && MOBILE_DRIVE_SCHEMES.includes(raw as MobileDriveScheme)) {
    return raw as MobileDriveScheme
  }
  return DEFAULT_CONTROL_FEEL.mobileScheme
}

/** Jednorázově zapni Space e-brake (dřív default false → „nefunguje drift“). */
function migrateDriftMode(raw: unknown): boolean {
  const flag = `${GAME_STORAGE_NS}.v07-drift-on`
  if (!localStorage.getItem(flag)) {
    try {
      localStorage.setItem(flag, '1')
    } catch {
      /* ignore */
    }
    return true
  }
  return typeof raw === 'boolean' ? raw : DEFAULT_CONTROL_FEEL.driftMode
}

/** Jednorázově povol portrait (dřív default false = jen landscape brána). */
function migrateAllowPortrait(raw: unknown): boolean {
  const flag = `${GAME_STORAGE_NS}.v07-portrait-on`
  if (!localStorage.getItem(flag)) {
    try {
      localStorage.setItem(flag, '1')
    } catch {
      /* ignore */
    }
    return true
  }
  return typeof raw === 'boolean' ? raw : DEFAULT_CONTROL_FEEL.allowPortraitRotation
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
      driftMode: migrateDriftMode(p.driftMode),
      hudScale,
      mobileScheme: migrateMobileScheme(p.mobileScheme),
      allowPortraitRotation: migrateAllowPortrait(p.allowPortraitRotation),
      immortality: typeof p.immortality === 'boolean' ? p.immortality : DEFAULT_CONTROL_FEEL.immortality,
      skateStance: SKATE_STANCES.includes(p.skateStance as SkateStance)
        ? (p.skateStance as SkateStance)
        : DEFAULT_CONTROL_FEEL.skateStance,
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

export function applyHudScale(scale: number, mobileUi = 1): void {
  const el = document.getElementById('hud')
  if (!el) return
  const base = Math.max(0.75, Math.min(1.35, scale))
  const s = Math.max(0.5, Math.min(1.35, base * mobileUi))
  el.style.setProperty('--hud-scale', String(s))
}
