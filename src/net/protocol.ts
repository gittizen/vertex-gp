export type NetPlayer = {
  id: string
  name: string
  color: number
  ready: boolean
}

export type NetRoom = {
  code: string
  hostId: string
  hostName: string
  trackId: string
  laps: number
  phase: 'lobby' | 'countdown' | 'racing' | 'finished'
  players: NetPlayer[]
  maxPlayers: number
}

/** Veřejný přehled místnosti pro browser (bez nutnosti znát kód). */
export type RoomSummary = {
  code: string
  hostName: string
  trackId: string
  laps: number
  players: number
  maxPlayers: number
  phase: NetRoom['phase']
  joinable: boolean
}

export type PresenceSnapshot = {
  online: number
  rooms: RoomSummary[]
  browsing: string[]
}

export type CarStateMsg = {
  type: 'state'
  playerId: string
  x: number
  z: number
  heading: number
  speed: number
  lap: number
  raceDistance: number
  finished: boolean
  finishTime: number
}

export type ServerMessage =
  | { type: 'welcome'; playerId: string; room: NetRoom }
  | { type: 'room'; room: NetRoom }
  | { type: 'presence'; presence: PresenceSnapshot }
  | { type: 'start'; trackId: string; laps: number; order: string[]; room: NetRoom }
  | { type: 'phase'; phase: NetRoom['phase'] }
  | CarStateMsg
  | { type: 'chat'; playerId: string; name?: string; text: string }
  | { type: 'error'; message: string }
  | { type: 'left' }

export type ClientMessage =
  | { type: 'hello'; name?: string }
  | { type: 'create'; name: string; color: number; trackId: string; laps: number }
  | { type: 'join'; code: string; name: string; color: number }
  | { type: 'setTrack'; trackId: string }
  | { type: 'setLaps'; laps: number }
  | { type: 'ready'; ready: boolean }
  | { type: 'start'; trackId?: string; laps?: number }
  | { type: 'phase'; phase: NetRoom['phase'] }
  | { type: 'leave' }
  | {
      type: 'state'
      x: number
      z: number
      heading: number
      speed: number
      lap: number
      raceDistance: number
      finished: boolean
      finishTime: number
    }
