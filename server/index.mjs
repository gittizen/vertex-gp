import { createServer } from 'node:http'
import { WebSocketServer } from 'ws'
import { randomBytes } from 'node:crypto'

const PORT = Number(process.env.PORT || 8787)
const MAX_PLAYERS = 4
const MIN_LAPS = 1
const MAX_LAPS = 69

/**
 * @typedef {{ id: string, name: string, color: number, ready: boolean }} Player
 * @typedef {{
 *   code: string,
 *   hostId: string,
 *   trackId: string,
 *   laps: number,
 *   phase: 'lobby'|'countdown'|'racing'|'finished',
 *   players: Map<string, Player>,
 *   sockets: Map<string, import('ws').WebSocket>
 * }} Room
 * @typedef {{ id: string, name: string, status: 'browsing'|'lobby'|'racing', roomCode: string|null }} HubClient
 */

/** @type {Map<string, Room>} */
const rooms = new Map()
/** @type {Map<import('ws').WebSocket, HubClient>} */
const clients = new Map()

function code() {
  return randomBytes(2).toString('hex').toUpperCase()
}

function clampLaps(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return 2
  return Math.max(MIN_LAPS, Math.min(MAX_LAPS, Math.round(v)))
}

function publicRoom(room) {
  const host = room.players.get(room.hostId)
  return {
    code: room.code,
    hostId: room.hostId,
    hostName: host?.name || 'Host',
    trackId: room.trackId,
    laps: room.laps,
    phase: room.phase,
    players: [...room.players.values()],
    maxPlayers: MAX_PLAYERS,
  }
}

function roomSummary(room) {
  return {
    code: room.code,
    hostName: room.players.get(room.hostId)?.name || 'Host',
    trackId: room.trackId,
    laps: room.laps,
    players: room.players.size,
    maxPlayers: MAX_PLAYERS,
    phase: room.phase,
    joinable: room.phase === 'lobby' && room.players.size < MAX_PLAYERS,
  }
}

function presenceSnapshot() {
  const browsing = []
  for (const c of clients.values()) {
    if (c.status === 'browsing' && c.name) browsing.push(c.name)
  }
  return {
    online: clients.size,
    rooms: [...rooms.values()].map(roomSummary),
    browsing: browsing.slice(0, 24),
  }
}

function send(ws, msg) {
  if (ws.readyState === 1) ws.send(JSON.stringify(msg))
}

function broadcast(room, msg, exceptId) {
  for (const [id, sock] of room.sockets) {
    if (exceptId && id === exceptId) continue
    send(sock, msg)
  }
}

function broadcastPresence() {
  const payload = { type: 'presence', presence: presenceSnapshot() }
  for (const ws of clients.keys()) send(ws, payload)
}

function destroyRoom(roomCode) {
  rooms.delete(roomCode)
}

function findRoomByPlayer(playerId) {
  for (const room of rooms.values()) {
    if (room.sockets.has(playerId)) return room
  }
  return null
}

function leaveRoom(playerId, ws) {
  const room = findRoomByPlayer(playerId)
  if (!room) return
  room.sockets.delete(playerId)
  room.players.delete(playerId)
  const client = clients.get(ws)
  if (client) {
    client.status = 'browsing'
    client.roomCode = null
  }
  if (room.players.size === 0) {
    destroyRoom(room.code)
  } else {
    if (room.hostId === playerId) {
      room.hostId = [...room.players.keys()][0]
    }
    // Po závodě / odchodu: pokud někdo zůstal a závod skončil, vrať lobby
    if (room.phase === 'finished' || room.phase === 'racing' || room.phase === 'countdown') {
      if (room.players.size > 0 && room.phase !== 'lobby') {
        // pokud závod běží a někdo odejde, ostatní pokračují; jen finished → lobby
        if (room.phase === 'finished') {
          room.phase = 'lobby'
          for (const p of room.players.values()) p.ready = false
        }
      }
    }
    broadcast(room, { type: 'room', room: publicRoom(room) })
  }
  send(ws, { type: 'left' })
  broadcastPresence()
}

function allReady(room) {
  if (room.players.size < 1) return false
  for (const p of room.players.values()) {
    if (!p.ready) return false
  }
  return true
}

function tryAutoStart(room) {
  // Host musí startnout ručně — auto jen když všichni ready a ≥2 hráči
  // (host klikne Start; tady jen info přes room update)
  return allReady(room) && room.players.size >= 2
}

const server = createServer((_req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
  })
  res.end(`Klec GP multiplayer OK · rooms ${rooms.size} · online ${clients.size}\n`)
})

const wss = new WebSocketServer({ server })

wss.on('connection', (ws) => {
  /** @type {string|null} */
  let playerId = null
  const hubId = randomBytes(4).toString('hex')
  clients.set(ws, { id: hubId, name: '', status: 'browsing', roomCode: null })
  send(ws, { type: 'presence', presence: presenceSnapshot() })

  ws.on('message', (raw) => {
    let msg
    try {
      msg = JSON.parse(String(raw))
    } catch {
      return
    }

    if (msg.type === 'hello') {
      const c = clients.get(ws)
      if (c) c.name = String(msg.name || '').slice(0, 18)
      broadcastPresence()
      return
    }

    if (msg.type === 'create') {
      if (playerId && findRoomByPlayer(playerId)) {
        leaveRoom(playerId, ws)
      }
      playerId = randomBytes(4).toString('hex')
      const roomCode = code()
      /** @type {Room} */
      const room = {
        code: roomCode,
        hostId: playerId,
        trackId: String(msg.trackId || 'nordring'),
        laps: clampLaps(msg.laps ?? 2),
        phase: 'lobby',
        players: new Map(),
        sockets: new Map(),
      }
      const name = String(msg.name || 'Hráč').slice(0, 18)
      room.players.set(playerId, {
        id: playerId,
        name,
        color: Number(msg.color) || 0xe8b923,
        ready: false,
      })
      room.sockets.set(playerId, ws)
      rooms.set(roomCode, room)
      const client = clients.get(ws)
      if (client) {
        client.name = name
        client.status = 'lobby'
        client.roomCode = roomCode
      }
      send(ws, { type: 'welcome', playerId, room: publicRoom(room) })
      broadcastPresence()
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
        send(ws, { type: 'error', message: 'Závod už běží — počkej na lobby' })
        return
      }
      if (playerId && findRoomByPlayer(playerId)) {
        leaveRoom(playerId, ws)
      }
      playerId = randomBytes(4).toString('hex')
      const name = String(msg.name || 'Hráč').slice(0, 18)
      room.players.set(playerId, {
        id: playerId,
        name,
        color: Number(msg.color) || 0xf5d76e,
        ready: false,
      })
      room.sockets.set(playerId, ws)
      const client = clients.get(ws)
      if (client) {
        client.name = name
        client.status = 'lobby'
        client.roomCode = room.code
      }
      send(ws, { type: 'welcome', playerId, room: publicRoom(room) })
      broadcast(room, { type: 'room', room: publicRoom(room) })
      broadcastPresence()
      return
    }

    if (msg.type === 'leave') {
      if (playerId) leaveRoom(playerId, ws)
      playerId = null
      return
    }

    if (!playerId) return
    const room = findRoomByPlayer(playerId)
    if (!room) return

    if (msg.type === 'setTrack' && room.hostId === playerId && room.phase === 'lobby') {
      room.trackId = String(msg.trackId || room.trackId)
      for (const p of room.players.values()) p.ready = false
      broadcast(room, { type: 'room', room: publicRoom(room) })
      broadcastPresence()
      return
    }

    if (msg.type === 'setLaps' && room.hostId === playerId && room.phase === 'lobby') {
      room.laps = clampLaps(msg.laps)
      for (const p of room.players.values()) p.ready = false
      broadcast(room, { type: 'room', room: publicRoom(room) })
      broadcastPresence()
      return
    }

    if (msg.type === 'ready' && room.phase === 'lobby') {
      const p = room.players.get(playerId)
      if (p) p.ready = Boolean(msg.ready)
      broadcast(room, { type: 'room', room: publicRoom(room) })
      return
    }

    if (msg.type === 'start' && room.hostId === playerId && room.phase === 'lobby') {
      if (room.players.size < 1) return
      if (!allReady(room)) {
        send(ws, { type: 'error', message: 'Všichni musí být Ready' })
        return
      }
      if (msg.trackId) room.trackId = String(msg.trackId)
      if (msg.laps != null) room.laps = clampLaps(msg.laps)
      room.phase = 'countdown'
      const order = [...room.players.keys()]
      for (const [id, sock] of room.sockets) {
        const c = clients.get(sock)
        if (c) c.status = 'racing'
      }
      broadcast(room, {
        type: 'start',
        trackId: room.trackId,
        laps: room.laps,
        order,
        room: publicRoom(room),
      })
      broadcastPresence()
      return
    }

    if (msg.type === 'phase' && room.hostId === playerId) {
      room.phase = msg.phase
      if (msg.phase === 'finished') {
        for (const [id, sock] of room.sockets) {
          const c = clients.get(sock)
          if (c) c.status = 'lobby'
        }
      }
      broadcast(room, { type: 'phase', phase: room.phase })
      broadcastPresence()
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
    if (playerId) leaveRoom(playerId, ws)
    clients.delete(ws)
    broadcastPresence()
  })
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Klec GP multiplayer listening on 0.0.0.0:${PORT}`)
  console.log(`Lokálně: ws://localhost:${PORT}`)
  console.log(`(Zatím nehostovat veřejně — jen lokální / LAN test)`)
})
