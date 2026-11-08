import { assetUrl } from '../ui/assetUrl'

export type FogLevel = 'low' | 'normal' | 'high'
export type DecorLevel = 'off' | 'simple' | 'rich'
/** Intenzita světel ve scéně (+ nádech menu). */
export type LightLevel = 'dim' | 'normal' | 'bright' | 'night'
/** Barevný styl UI — stejné rozložení, jiný nádech. */
export type MenuTone =
  | 'klecany'
  | 'cesko'
  | 'neon'
  | 'ember'
  | 'ice'
  | 'moss'
  | 'asphalt'
  | 'calendar'

/** Podstyly jen pro tone = calendar. */
export type CalendarPack = 'classic' | 'blonde' | 'redhead' | 'global'

export type AtmosphereSettingsValues = {
  fog: FogLevel
  /** off = bez dekorací, simple = řidší, rich = maximum */
  decor: DecorLevel
  light: LightLevel
  tone: MenuTone
  /** Jen když tone = calendar */
  calendarPack: CalendarPack
}

const STORAGE_KEY = 'klec-gp-atmosphere'

const LIGHT_LEVELS: LightLevel[] = ['dim', 'normal', 'bright', 'night']
const MENU_TONES: MenuTone[] = [
  'klecany',
  'cesko',
  'neon',
  'ember',
  'ice',
  'moss',
  'asphalt',
  'calendar',
]
export const CALENDAR_PACKS: CalendarPack[] = ['classic', 'blonde', 'redhead', 'global']

/** Staré tóny → nový výchozí / nejbližší. */
const TONE_MIGRATE: Record<string, MenuTone> = {
  steel: 'asphalt',
  violet: 'calendar',
}

/** Default: Klecany + bohaté dekorace. */
export const DEFAULT_ATMOSPHERE: AtmosphereSettingsValues = {
  fog: 'high',
  decor: 'rich',
  light: 'normal',
  tone: 'klecany',
  calendarPack: 'classic',
}

function migrateLight(raw: unknown): LightLevel {
  if (typeof raw !== 'string') return DEFAULT_ATMOSPHERE.light
  if (LIGHT_LEVELS.includes(raw as LightLevel)) return raw as LightLevel
  if (raw === 'soft') return 'normal'
  if (raw === 'stadium') return 'bright'
  return DEFAULT_ATMOSPHERE.light
}

function migrateTone(raw: unknown): MenuTone {
  if (typeof raw !== 'string') return DEFAULT_ATMOSPHERE.tone
  if (MENU_TONES.includes(raw as MenuTone)) return raw as MenuTone
  if (raw in TONE_MIGRATE) return TONE_MIGRATE[raw]!
  return DEFAULT_ATMOSPHERE.tone
}

function migrateCalendarPack(raw: unknown): CalendarPack {
  if (typeof raw === 'string' && CALENDAR_PACKS.includes(raw as CalendarPack)) {
    return raw as CalendarPack
  }
  return DEFAULT_ATMOSPHERE.calendarPack
}

export function loadAtmosphereSettings(): AtmosphereSettingsValues {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_ATMOSPHERE }
    const parsed = JSON.parse(raw) as Partial<AtmosphereSettingsValues> & {
      denseDecor?: boolean
    }
    const fog =
      parsed.fog === 'low' || parsed.fog === 'normal' || parsed.fog === 'high'
        ? parsed.fog
        : DEFAULT_ATMOSPHERE.fog
    let decor: DecorLevel = DEFAULT_ATMOSPHERE.decor
    if (parsed.decor === 'off' || parsed.decor === 'simple' || parsed.decor === 'rich') {
      decor = parsed.decor
    } else if (typeof parsed.denseDecor === 'boolean') {
      decor = parsed.denseDecor ? 'rich' : 'simple'
    }
    const light = migrateLight(parsed.light)
    const tone = migrateTone(parsed.tone)
    const calendarPack = migrateCalendarPack(parsed.calendarPack)
    return { fog, decor, light, tone, calendarPack }
  } catch {
    return { ...DEFAULT_ATMOSPHERE }
  }
}

export function saveAtmosphereSettings(vals: AtmosphereSettingsValues): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(vals))
}

/** Násobitel vzdálenosti fogu (větší = řidší mlha). */
export function fogDistanceScale(fog: FogLevel): number {
  if (fog === 'low') return 1.45
  if (fog === 'high') return 0.65
  return 1
}

/** Násobitel intenzity světel. */
export function lightIntensityScale(light: LightLevel): number {
  if (light === 'dim') return 0.55
  if (light === 'bright') return 1.28
  if (light === 'night') return 0.42
  return 1
}

function calendarArtSuffix(pack: CalendarPack): string {
  return `calendar-${pack}`
}

/** Pozadí / tile art podle stylu menu — každý slot má vlastní obrázek. */
export function menuArtForTone(
  tone: MenuTone,
  calendarPack: CalendarPack = DEFAULT_ATMOSPHERE.calendarPack,
): {
  bg: string
  race: string
  garage: string
  tracks: string
} {
  const key = tone === 'calendar' ? calendarArtSuffix(calendarPack) : tone
  return {
    bg: assetUrl(`menu/bg-${key}.jpg`),
    race: assetUrl(`menu/race-${key}.jpg`),
    garage: assetUrl(`menu/garage-${key}.jpg`),
    tracks: assetUrl(`menu/tracks-${key}.jpg`),
  }
}

/** Aplikuje tone + light (+ calendar pack) na #menu / #entry. */
export function applyUiAtmosphere(
  vals: Pick<AtmosphereSettingsValues, 'tone' | 'light' | 'calendarPack'>,
): void {
  const art = menuArtForTone(vals.tone, vals.calendarPack)
  for (const id of ['menu', 'entry'] as const) {
    const el = document.getElementById(id)
    if (!el) continue
    el.dataset.tone = vals.tone
    el.dataset.light = vals.light
    if (vals.tone === 'calendar') el.dataset.calendarPack = vals.calendarPack
    else delete el.dataset.calendarPack
    el.style.setProperty('--menu-photo', `url('${art.bg}')`)
  }
  document.documentElement.dataset.tone = vals.tone
  document.documentElement.dataset.light = vals.light
  if (vals.tone === 'calendar') {
    document.documentElement.dataset.calendarPack = vals.calendarPack
  } else {
    delete document.documentElement.dataset.calendarPack
  }
}
