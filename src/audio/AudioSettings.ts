export type MusicId = 'techno' | 'rap' | 'classic'

export type AudioSettingsValues = {
  master: number
  music: number
  sfx: number
  /** Kliky / UI v menu (0–100) */
  menu: number
  track: MusicId
  /** Vypnout veškerý zvuk */
  muted: boolean
}

const STORAGE_KEY = 'klec-gp-audio'

export const MUSIC_TRACKS: { id: MusicId; labelKey: string }[] = [
  { id: 'techno', labelKey: 'audio.track.techno' },
  { id: 'rap', labelKey: 'audio.track.rap' },
  { id: 'classic', labelKey: 'audio.track.classic' },
]

/** Default tišší než systém — hra „šeptá“, dokud to uživatel nezvýší. */
export const DEFAULT_AUDIO: AudioSettingsValues = {
  master: 42,
  music: 28,
  sfx: 38,
  menu: 55,
  track: 'techno',
  muted: false,
}

export function loadAudioSettings(): AudioSettingsValues {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_AUDIO }
    const parsed = JSON.parse(raw) as Partial<AudioSettingsValues>
    const track = MUSIC_TRACKS.some((m) => m.id === parsed.track) ? (parsed.track as MusicId) : DEFAULT_AUDIO.track
    return {
      master: clampVol(parsed.master ?? DEFAULT_AUDIO.master),
      music: clampVol(parsed.music ?? DEFAULT_AUDIO.music),
      sfx: clampVol(parsed.sfx ?? DEFAULT_AUDIO.sfx),
      menu: clampVol(parsed.menu ?? DEFAULT_AUDIO.menu),
      track,
      muted: Boolean(parsed.muted),
    }
  } catch {
    return { ...DEFAULT_AUDIO }
  }
}

export function saveAudioSettings(vals: AudioSettingsValues): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(vals))
}

function clampVol(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)))
}
