import { getStore } from '@netlify/blobs'

const STORE = 'klec-records'
const KEY = 'board-v1'
const RATE_MS = 8_000
const MAX_ENTRIES = 4000

const lastHit = new Map()

function cors(body, status = 200) {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}

function clientIp(req) {
  return (
    req.headers.get('x-nf-client-connection-ip') ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  )
}

function rateOk(ip) {
  const now = Date.now()
  const prev = lastHit.get(ip) || 0
  if (now - prev < RATE_MS) return false
  lastHit.set(ip, now)
  return true
}

export default async (req) => {
  if (req.method === 'OPTIONS') return cors('', 204)
  if (req.method !== 'POST') return cors(JSON.stringify({ error: 'POST only' }), 405)
  const ip = clientIp(req)
  if (!rateOk(ip)) return cors(JSON.stringify({ error: 'rate' }), 429)

  let body
  try {
    body = await req.json()
  } catch {
    return cors(JSON.stringify({ error: 'bad json' }), 400)
  }

  const player = String(body.player || '').trim().slice(0, 24)
  const trackId = String(body.trackId || '').slice(0, 32)
  const vehicle = String(body.vehicle || '').slice(0, 24)
  const bestTimeMs = Number(body.bestTimeMs) || 0
  const bestFsScore = Number(body.bestFsScore) || 0
  const bestTrickPts = Number(body.bestTrickPts) || 0
  const immortal = !!body.immortal
  const at = Number(body.at) || Date.now()

  if (!player || !trackId || !vehicle) {
    return cors(JSON.stringify({ error: 'fields' }), 400)
  }
  if (bestTimeMs < 0 || bestTimeMs > 3_600_000) {
    return cors(JSON.stringify({ error: 'time' }), 400)
  }

  const store = getStore(STORE)
  let board = { entries: [] }
  try {
    const raw = await store.get(KEY, { type: 'json' })
    if (raw && Array.isArray(raw.entries)) board = raw
  } catch {
    /* empty */
  }

  const idx = board.entries.findIndex(
    (e) =>
      e.player === player &&
      e.trackId === trackId &&
      e.vehicle === vehicle &&
      !!e.immortal === immortal,
  )
  const row = {
    player,
    trackId,
    vehicle,
    bestTimeMs,
    bestFsScore,
    bestTrickPts,
    at,
    immortal,
  }
  if (idx >= 0) {
    const cur = board.entries[idx]
    if (bestTimeMs > 0 && (cur.bestTimeMs <= 0 || bestTimeMs < cur.bestTimeMs)) {
      cur.bestTimeMs = bestTimeMs
    }
    if (bestFsScore > cur.bestFsScore) cur.bestFsScore = bestFsScore
    if (bestTrickPts > cur.bestTrickPts) cur.bestTrickPts = bestTrickPts
    cur.at = at
    cur.immortal = immortal
  } else {
    board.entries.push(row)
  }

  if (board.entries.length > MAX_ENTRIES) {
    board.entries.sort((a, b) => b.at - a.at)
    board.entries = board.entries.slice(0, MAX_ENTRIES)
  }

  await store.setJSON(KEY, board)
  return cors(JSON.stringify({ ok: true }))
}
