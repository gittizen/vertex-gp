import { createServer } from 'node:http'
import { WebSocketServer } from 'ws'
import { randomBytes } from 'node:crypto'

const PORT = Number(process.env.PORT || 8787)
const MAX_PLAYERS = 4

/** @typedef {{ id: string, name: string, color: number, ready: boolean }} Player */
/** @typedef {{ code: string, hostId: string, trackId: string, phase: 'lobby'|'countdown'|'racing'|'finished', players: Map<string, Player>, sockets: Map<string, import('ws').WebSocket> }} Room */

/** @type {Map<string, Room>} */
const rooms = new Map()

function code() {
  return randomBytes(2).toString('hex').toUpperCase()
}

function publicRoom(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    trackId: room.trackId,
    phase: room.phase,
    players: [...room.players.values()],
  }
}

function send(ws, msg) {
  if (ws.readyState === 1) ws.send(JSON.stringify(msg))
}

function broadcast(room, msg, exceptId) {
  for (const [id, ws] of room.sockets) {
    if (exceptId && id === exceptId) continue
    send(ws, msg)
  }
}

function destroyRoom(code) {
  rooms.delete(code)
}

function leaveRoom(playerId) {
  for (const room of rooms.values()) {
    if (!room.sockets.has(playerId)) continue
    room.sockets.delete(playerId)
    room.players.delete(playerId)
    if (room.players.size === 0) {
      destroyRoom(room.code)
      return
    }
    if (room.hostId === playerId) {
      room.hostId = [...room.players.keys()][0]
    }
    broadcast(room, { type: 'room', room: publicRoom(room) })
    return
  }
}

const server = createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
  res.end('Vertex GP multiplayer server OK\n')
})

const wss = new WebSocketServer({ server })

wss.on('connection', (ws) => {
  /** @type {string|null} */
  let playerId = null

  ws.on('message', (raw) => {
    let msg
    try {
      msg = JSON.parse(String(raw))
    } catch {
      return
    }

    if (msg.type === 'create') {
      playerId = randomBytes(4).toString('hex')
      const roomCode = code()
      /** @type {Room} */
      const room = {
        code: roomCode,
        hostId: playerId,
        trackId: msg.trackId || 'nordring',
        phase: 'lobby',
        players: new Map(),
        sockets: new Map(),
      }
      room.players.set(playerId, {
        id: playerId,
        name: String(msg.name || 'Hráč').slice(0, 18),
        color: Number(msg.color) || 0xe8b923,
        ready: false,
      })
      room.sockets.set(playerId, ws)
      rooms.set(roomCode, room)
      send(ws, { type: 'welcome', playerId, room: publicRoom(room) })
      return
    }

    if (msg.type === 'join') {
      const room = rooms.get(String(msg.code || '').toUpperCase())
      if (!room) {
        send(ws, { type: 'error', message: 'Místnost neexistuje' })
        return
      }
      if (room.players.size >= MAX_PLAYERS) {
        send(ws, { type: 'error', message: 'Místnost je plná (max 4)' })
        return
      }
      if (room.phase !== 'lobby') {
        send(ws, { type: 'error', message: 'Závod už běží' })
        return
      }
      playerId = randomBytes(4).toString('hex')
      room.players.set(playerId, {
        id: playerId,
        name: String(msg.name || 'Hráč').slice(0, 18),
        color: Number(msg.color) || 0xf5d76e,
        ready: false,
      })
      room.sockets.set(playerId, ws)
      send(ws, { type: 'welcome', playerId, room: publicRoom(room) })
      broadcast(room, { type: 'room', room: publicRoom(room) })
      return
    }

    if (!playerId) return
    const room = [...rooms.values()].find((r) => r.sockets.has(playerId))
    if (!room) return

    if (msg.type === 'setTrack' && room.hostId === playerId && room.phase === 'lobby') {
      room.trackId = String(msg.trackId || room.trackId)
      broadcast(room, { type: 'room', room: publicRoom(room) })
      return
    }

    if (msg.type === 'ready' && room.phase === 'lobby') {
      const p = room.players.get(playerId)
      if (p) p.ready = Boolean(msg.ready)
      broadcast(room, { type: 'room', room: publicRoom(room) })
      return
    }

    if (msg.type === 'start' && room.hostId === playerId && room.phase === 'lobby') {
      room.trackId = String(msg.trackId || room.trackId)
      room.phase = 'countdown'
      const order = [...room.players.keys()]
      broadcast(room, {
        type: 'start',
        trackId: room.trackId,
        order,
        room: publicRoom(room),
      })
      return
    }

    if (msg.type === 'phase' && room.hostId === playerId) {
      room.phase = msg.phase
      broadcast(room, { type: 'phase', phase: room.phase })
      return
    }

    if (msg.type === 'state') {
      broadcast(
        room,
        {
          type: 'state',
          playerId,
          x: msg.x,
          z: msg.z,
          heading: msg.heading,
          speed: msg.speed,
          lap: msg.lap,
          raceDistance: msg.raceDistance,
          finished: msg.finished,
          finishTime: msg.finishTime,
        },
        playerId,
      )
      return
    }

    if (msg.type === 'chat') {
      broadcast(room, {
        type: 'chat',
        playerId,
        name: room.players.get(playerId)?.name,
        text: String(msg.text || '').slice(0, 120),
      })
    }
  })

  ws.on('close', () => {
    if (playerId) leaveRoom(playerId)
  })
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Vertex GP multiplayer listening on 0.0.0.0:${PORT}`)
  console.log(`Lokálně: ws://localhost:${PORT}`)
  console.log(`Přes internet: vystav port ${PORT} (Cloudflare Tunnel / ngrok) a dej kamarádům wss://… odkaz`)
})
