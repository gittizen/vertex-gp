/** Remap písmen freestyle triků → až 2 klávesy (obě můžou být prázdné = trik nepoužitý). */

import { RESERVED_TRICK_LETTERS } from '../freestyle/FreestyleTricks'
import { GAME_STORAGE_NS, type KeyPair } from './KeyBindings'

const ALL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
export const TRICK_LETTERS = ALL.split('').filter((ch) => !RESERVED_TRICK_LETTERS.has(ch))

/** letter → [primary, secondary]; null = slot volný. */
export type TrickBindingsMap = Record<string, KeyPair>

const STORAGE_KEY = `${GAME_STORAGE_NS}.trickBinds`

function pairOf(a: string | null, b: string | null = null): KeyPair {
  return [a, b]
}

export function defaultTrickBindings(): TrickBindingsMap {
  const out: TrickBindingsMap = {}
  for (const ch of TRICK_LETTERS) {
    // WASD = triky (písmena W/A/S/D); ostatní Key${letter}
    out[ch] = pairOf(`Key${ch}`)
  }
  return out
}

function normPair(raw: unknown): KeyPair | null {
  if (raw == null) return pairOf(null, null)
  if (typeof raw === 'string') {
    return pairOf(raw.length > 0 ? raw : null, null)
  }
  if (Array.isArray(raw)) {
    const a = typeof raw[0] === 'string' && raw[0].length > 0 ? raw[0] : null
    const b = typeof raw[1] === 'string' && raw[1].length > 0 ? raw[1] : null
    return pairOf(a, b)
  }
  return null
}

export function loadTrickBindings(): TrickBindingsMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultTrickBindings()
    const parsed = JSON.parse(raw) as Partial<Record<string, unknown>>
    const defaults = defaultTrickBindings()
    const out: TrickBindingsMap = {}
    const clearedFlag = `${GAME_STORAGE_NS}.v08-trick-pairs`
    const migrated = Boolean(localStorage.getItem(clearedFlag))
    for (const ch of TRICK_LETTERS) {
      if (Object.prototype.hasOwnProperty.call(parsed, ch)) {
        const p = normPair(parsed[ch])
        out[ch] = p ?? pairOf(null, null)
      } else {
        out[ch] = defaults[ch] ?? pairOf(null, null)
      }
    }
    if (!migrated) {
      try {
        localStorage.setItem(clearedFlag, '1')
        // Po migraci na páry + WASD triky: doplň defaulty kde chybí W/A/S/D
        for (const ch of ['W', 'A', 'S', 'D'] as const) {
          if (!TRICK_LETTERS.includes(ch)) continue
          if (!Object.prototype.hasOwnProperty.call(parsed, ch)) {
            out[ch] = pairOf(`Key${ch}`)
          }
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(out))
      } catch {
        /* ignore */
      }
    }
    return out
  } catch {
    return defaultTrickBindings()
  }
}

export function saveTrickBindings(map: TrickBindingsMap): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
}

/** code → letter (první shoda v obou slotech). */
export function codeToTrickLetter(map: TrickBindingsMap, code: string): string | null {
  for (const ch of TRICK_LETTERS) {
    const [a, b] = map[ch] ?? [null, null]
    if (a === code || b === code) return ch
  }
  return null
}
