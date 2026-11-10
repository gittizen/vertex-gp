import { GAME_STORAGE_NS } from '../input/KeyBindings'

const STORAGE_KEY = `${GAME_STORAGE_NS}.playerName`

const HANDLES = [
  'Jezdec',
  'Havran',
  'Komár',
  'Drak',
  'Tygr',
  'Vlk',
  'Sokol',
  'Blesk',
  'Asfalt',
  'Motor',
  'Serpent',
  'Plácek',
  'Klecák',
  'Nord',
  'Stratos',
]

function randomToken(len = 3): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let out = ''
  for (let i = 0; i < len; i++) {
    out += alphabet[(Math.random() * alphabet.length) | 0]!
  }
  return out
}

/** Náhodné jméno pro nového hráče (žebříček / lobby). */
export function generatePlayerName(): string {
  const handle = HANDLES[(Math.random() * HANDLES.length) | 0]!
  return `${handle}_${randomToken()}`.slice(0, 18)
}

export function loadPlayerName(): string | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (!v) return null
    const name = v.trim().slice(0, 18)
    return name || null
  } catch {
    return null
  }
}

export function savePlayerName(name: string): string {
  const cleaned = name.trim().slice(0, 18)
  const finalName = cleaned || generatePlayerName()
  try {
    localStorage.setItem(STORAGE_KEY, finalName)
  } catch {
    /* private mode */
  }
  return finalName
}

/** Načti uložené jméno, nebo vygeneruj a ulož nové. */
export function loadOrCreatePlayerName(): string {
  const existing = loadPlayerName()
  if (existing) return existing
  return savePlayerName(generatePlayerName())
}
