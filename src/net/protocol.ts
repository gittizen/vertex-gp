export type NetPlayer = {
  id: string
  name: string
  color: number
  ready: boolean
}

export type NetRoom = {
  code: string
  hostId: string
  trackId: string
  phase: 'lobby' | 'countdown' | 'racing' | 'finished'
  players: NetPlayer[]
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
  | { type: 'start'; trackId: string; order: string[]; room: NetRoom }
  | { type: 'phase'; phase: NetRoom['phase'] }
  | CarStateMsg
  | { type: 'chat'; playerId: string; name?: string; text: string }
  | { type: 'error'; message: string }

export type ClientMessage =
  | { type: 'create'; name: string; color: number; trackId: string }
  | { type: 'join'; code: string; name: string; color: number }
  | { type: 'setTrack'; trackId: string }
  | { type: 'ready'; ready: boolean }
  | { type: 'start'; trackId: string }
  | { type: 'phase'; phase: NetRoom['phase'] }
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
