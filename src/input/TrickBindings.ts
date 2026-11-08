/** Remap písmen freestyle triků A–Z → KeyboardEvent.code */

import { GAME_STORAGE_NS } from './KeyBindings'

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

export type TrickBindingsMap = Record<string, string>

const STORAGE_KEY = `${GAME_STORAGE_NS}.trickBinds`

export function defaultTrickBindings(): TrickBindingsMap {
  const out: TrickBindingsMap = {}
  for (const ch of LETTERS) out[ch] = `Key${ch}`
  return out
}

export function loadTrickBindings(): TrickBindingsMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultTrickBindings()
    const parsed = JSON.parse(raw) as Partial<TrickBindingsMap>
    const out = defaultTrickBindings()
    for (const ch of LETTERS) {
      const code = parsed[ch]
      if (typeof code === 'string' && code.length > 0) out[ch] = code
    }
    return out
  } catch {
    return defaultTrickBindings()
  }
}

export function saveTrickBindings(map: TrickBindingsMap): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
}

/** code → letter (první shoda). */
export function codeToTrickLetter(map: TrickBindingsMap, code: string): string | null {
  for (const ch of LETTERS) {
    if (map[ch] === code) return ch
  }
  return null
}

export const TRICK_LETTERS = LETTERS.split('')
