import { assetUrl } from '../ui/assetUrl'

type FogLevel = 'low' | 'normal' | 'high'
export type DecorLevel = 'off' | 'simple' | 'rich'
/** Intenzita světel ve scéně (+ nádech menu). */
type LightLevel = 'dim' | 'normal' | 'bright' | 'night'
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
  fog: 'normal',
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

/** Pořadí jezdce jasu: noc → tlumené → normální → jasné. */
const LIGHT_SLIDER: LightLevel[] = ['night', 'dim', 'normal', 'bright']
const FOG_SLIDER: FogLevel[] = ['low', 'normal', 'high']
const DECOR_SLIDER: DecorLevel[] = ['off', 'simple', 'rich']

export function lightIndex(light: LightLevel): number {
  return Math.max(0, LIGHT_SLIDER.indexOf(light))
}

export function fogIndex(fog: FogLevel): number {
  return Math.max(0, FOG_SLIDER.indexOf(fog))
}

export function decorIndex(decor: DecorLevel): number {
  return Math.max(0, DECOR_SLIDER.indexOf(decor))
}

export function lightFromIndex(i: number): LightLevel {
  return LIGHT_SLIDER[Math.max(0, Math.min(LIGHT_SLIDER.length - 1, Math.round(i)))]!
}

export function fogFromIndex(i: number): FogLevel {
  return FOG_SLIDER[Math.max(0, Math.min(FOG_SLIDER.length - 1, Math.round(i)))]!
}

export function decorFromIndex(i: number): DecorLevel {
  return DECOR_SLIDER[Math.max(0, Math.min(DECOR_SLIDER.length - 1, Math.round(i)))]!
}

/** Scéna (mlha / dekor / světlo) podle předvolby renderu. */
export function sceneForVisualQuality(
  quality: 'perf' | 'balanced' | 'cinematic',
): Pick<AtmosphereSettingsValues, 'fog' | 'decor' | 'light'> {
  if (quality === 'perf') return { fog: 'low', decor: 'simple', light: 'normal' }
  if (quality === 'balanced') return { fog: 'normal', decor: 'rich', light: 'normal' }
  return { fog: 'normal', decor: 'rich', light: 'bright' }
}

function calendarArtSuffix(pack: CalendarPack): string {
  return `calendar-${pack}`
}

/** Pozadí / tile art podle stylu menu — každý slot má vlastní obrázek (žádné duplicity). */
export function menuArtForTone(
  tone: MenuTone,
  calendarPack: CalendarPack = DEFAULT_ATMOSPHERE.calendarPack,
): {
  bg: string
  race: string
  garage: string
  tracks: string
  /** Dlaždice Nastavení */
  settings: string
  /** Dlaždice Žebříček */
  board: string
  /** Domů → Šampionát */
  championship: string
  /** Setup: Jet */
  jet: string
  /** Setup: Multiplayer */
  multi: string
  /** Setup: Join */
  join: string
} {
  const key = tone === 'calendar' ? calendarArtSuffix(calendarPack) : tone
  // WebP menu arty (menší decode); JPG zůstávají jako zdroj / fallback soubory.
  const art = (p: string) => assetUrl(p.replace(/\.jpe?g$/i, '.webp'))
  return {
    bg: art(`menu/bg-${key}.jpg`),
    // Domů → Závod: jen quick-race (šamp Jet má vlastní champ-tile-jet-*).
    race: art('menu/race-klecmania-road.jpg'),
    garage: art(`menu/garage-${key}.jpg`),
    tracks: art(`menu/tracks-${key}.jpg`),
    settings: art(`menu/settings-${key}.jpg`),
    // Klecany žebříček: starší (prev) fotka — aktuální board-klecany je moc tmavá/hutná
    board: art(key === 'klecany' ? 'menu/board-klecany-prev.jpg' : `menu/board-${key}.jpg`),
    // Domů → Šampionát dlaždice (≠ liga v briefu auto)
    championship: art('menu/champ-tile-featured.jpg'),
    // Setup Jet (≠ šamp auto Jet)
    jet: art('menu/tile-jet-start.jpg'),
    multi: art('menu/tile-multi-grid.jpg'),
    join: art('menu/tile-join-lobby.jpg'),
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
