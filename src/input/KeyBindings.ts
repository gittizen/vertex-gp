/** Remap kláves — max 2 kódy na akci. Doména úložiště: klecgp. */

export const GAME_STORAGE_NS = 'klecgp'

export type BindAction =
  | 'steerLeft'
  | 'steerRight'
  | 'throttle'
  | 'brake'
  | 'push'
  | 'tab'
  | 'shiftUp'
  | 'shiftDown'
  | 'clutch'
  | 'ebrake'
  | 'restart'
  | 'menu'
  | 'camera'

export type KeyPair = [string | null, string | null]

export type KeyBindingsMap = Record<BindAction, KeyPair>

export const DEFAULT_BINDINGS: KeyBindingsMap = {
  steerLeft: ['ArrowLeft', null],
  steerRight: ['ArrowRight', null],
  throttle: ['ArrowUp', null],
  brake: ['ArrowDown', null],
  push: ['ShiftLeft', 'ShiftRight'],
  tab: ['Tab', null],
  shiftUp: ['KeyE', null],
  shiftDown: ['KeyQ', null],
  clutch: ['ControlLeft', 'ControlRight'],
  ebrake: ['Space', null],
  restart: ['KeyR', null],
  menu: ['Escape', null],
  camera: ['KeyC', null],
}

const STORAGE_KEY = `${GAME_STORAGE_NS}.bindings`

export function loadKeyBindings(): KeyBindingsMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return cloneBindings(DEFAULT_BINDINGS)
    const parsed = JSON.parse(raw) as Partial<KeyBindingsMap>
    const out = cloneBindings(DEFAULT_BINDINGS)
    for (const key of Object.keys(DEFAULT_BINDINGS) as BindAction[]) {
      const pair = parsed[key]
      if (Array.isArray(pair) && pair.length >= 1) {
        out[key] = [normCode(pair[0]), normCode(pair[1] ?? null)]
      }
    }
    return out
  } catch {
    return cloneBindings(DEFAULT_BINDINGS)
  }
}

export function saveKeyBindings(map: KeyBindingsMap): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
}

export function cloneBindings(src: KeyBindingsMap): KeyBindingsMap {
  const out = {} as KeyBindingsMap
  for (const k of Object.keys(src) as BindAction[]) {
    out[k] = [src[k][0], src[k][1]]
  }
  return out
}

function normCode(c: string | null | undefined): string | null {
  if (!c || typeof c !== 'string') return null
  return c
}

export function bindingActive(map: KeyBindingsMap, action: BindAction, keys: Set<string>): boolean {
  const [a, b] = map[action]
  if (a && keys.has(a)) return true
  if (b && keys.has(b)) return true
  return false
}

export function bindingJustPressed(
  map: KeyBindingsMap,
  action: BindAction,
  just: Set<string>,
): boolean {
  const [a, b] = map[action]
  if (a && just.has(a)) return true
  if (b && just.has(b)) return true
  return false
}

export function codeLabel(code: string | null): string {
  if (!code) return '—'
  if (code.startsWith('Key') && code.length === 4) return code.slice(3)
  if (code.startsWith('Digit')) return code.slice(5)
  const map: Record<string, string> = {
    ArrowUp: '↑',
    ArrowDown: '↓',
    ArrowLeft: '←',
    ArrowRight: '→',
    ShiftLeft: 'Shift',
    ShiftRight: 'Shift',
    ControlLeft: 'Ctrl',
    ControlRight: 'Ctrl',
    AltLeft: 'Alt',
    AltRight: 'Alt',
    Space: 'Space',
    Escape: 'Esc',
    Tab: 'Tab',
  }
  return map[code] ?? code
}

export const BIND_ACTION_ORDER: BindAction[] = [
  'throttle',
  'brake',
  'steerLeft',
  'steerRight',
  'push',
  'tab',
  'shiftUp',
  'shiftDown',
  'clutch',
  'ebrake',
  'camera',
  'restart',
  'menu',
]
