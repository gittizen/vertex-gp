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
  /** Řízení jen šipky — WASD je defaultně na triky. */
  throttle: ['ArrowUp', null],
  brake: ['ArrowDown', null],
  push: ['ShiftLeft', 'ShiftRight'],
  /** Boost / Tab akce — default jen Alt (ne Tab). */
  tab: ['AltLeft', 'AltRight'],
  shiftUp: ['KeyE', null],
  shiftDown: ['KeyQ', null],
  clutch: ['ControlLeft', 'ControlRight'],
  ebrake: ['Space', null],
  restart: ['KeyR', null],
  menu: ['Escape', null],
  camera: ['KeyC', null],
}

const STORAGE_KEY = `${GAME_STORAGE_NS}.bindings`

/** CapsLock sem nepatří — wheelie/boost je Shift, plyn ↑/W. */
function scrubBadCode(code: string | null, action: BindAction): string | null {
  if (!code) return null
  if (code !== 'CapsLock') return code
  if (action === 'push') return 'ShiftLeft'
  if (action === 'throttle') return 'ArrowUp'
  return null
}

export function loadKeyBindings(): KeyBindingsMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return cloneBindings(DEFAULT_BINDINGS)
    const parsed = JSON.parse(raw) as Partial<KeyBindingsMap>
    const out = cloneBindings(DEFAULT_BINDINGS)
    for (const key of Object.keys(DEFAULT_BINDINGS) as BindAction[]) {
      const pair = parsed[key]
      if (Array.isArray(pair) && pair.length >= 1) {
        out[key] = [scrubBadCode(normCode(pair[0]), key), scrubBadCode(normCode(pair[1] ?? null), key)]
      }
    }
    // Wheelie/boost vždy aspoň jeden Shift (když někdo smazal oba)
    if (!out.push[0] && !out.push[1]) out.push = ['ShiftLeft', 'ShiftRight']
    // Jednorázově: starý Tab+Alt → jen Alt
    const tabFlag = `${GAME_STORAGE_NS}.v07-tab-alt-only`
    if (!localStorage.getItem(tabFlag)) {
      try {
        localStorage.setItem(tabFlag, '1')
      } catch {
        /* ignore */
      }
      if (out.tab[0] === 'Tab' || out.tab[1] === 'Tab') {
        out.tab = ['AltLeft', 'AltRight']
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(out))
        } catch {
          /* ignore */
        }
      }
    }
    // Jednorázově: WASD pryč z řízení (jdou na triky)
    const wasdDriveFlag = `${GAME_STORAGE_NS}.v08-wasd-tricks`
    if (!localStorage.getItem(wasdDriveFlag)) {
      try {
        localStorage.setItem(wasdDriveFlag, '1')
      } catch {
        /* ignore */
      }
      const scrubWasd = (pair: KeyPair): KeyPair => [
        pair[0] === 'KeyW' || pair[0] === 'KeyA' || pair[0] === 'KeyS' || pair[0] === 'KeyD'
          ? null
          : pair[0],
        pair[1] === 'KeyW' || pair[1] === 'KeyA' || pair[1] === 'KeyS' || pair[1] === 'KeyD'
          ? null
          : pair[1],
      ]
      out.throttle = scrubWasd(out.throttle)
      out.brake = scrubWasd(out.brake)
      out.steerLeft = scrubWasd(out.steerLeft)
      out.steerRight = scrubWasd(out.steerRight)
      if (!out.throttle[0] && !out.throttle[1]) out.throttle = ['ArrowUp', null]
      if (!out.brake[0] && !out.brake[1]) out.brake = ['ArrowDown', null]
      if (!out.steerLeft[0] && !out.steerLeft[1]) out.steerLeft = ['ArrowLeft', null]
      if (!out.steerRight[0] && !out.steerRight[1]) out.steerRight = ['ArrowRight', null]
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(out))
      } catch {
        /* ignore */
      }
    }
    if (!out.tab[0] && !out.tab[1]) out.tab = ['AltLeft', 'AltRight']
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
