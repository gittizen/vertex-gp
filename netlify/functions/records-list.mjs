import { getStore } from '@netlify/blobs'

const STORE = 'klec-records'
const KEY = 'board-v1'
const FS = new Set([
  'skate',
  'skates',
  'bike',
  'scooter',
  'rocketScooter',
  'rocketSkate',
  'rocketSkates',
  'rocketBike',
])
const BOT_NAMES = new Set(['Nikola Beran', 'Petra Holá', 'Marek Diviš'])

function cors(body, status = 200) {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Cache-Control': 'public, max-age=20',
    },
  })
}

export default async (req) => {
  if (req.method === 'OPTIONS') return cors('', 204)
  if (req.method !== 'GET') return cors(JSON.stringify({ error: 'GET only' }), 405)

  const url = new URL(req.url)
  const trackId = url.searchParams.get('trackId') || ''
  const board = url.searchParams.get('board') === 'freestyle' ? 'freestyle' : 'race'

  const store = getStore(STORE)
  let entries = []
  try {
    const raw = await store.get(KEY, { type: 'json' })
    if (raw && Array.isArray(raw.entries)) entries = raw.entries
  } catch {
    entries = []
  }

  entries = entries.filter((e) => e?.player && !BOT_NAMES.has(String(e.player)))
  if (board === 'freestyle') entries = entries.filter((e) => FS.has(e.vehicle))
  else entries = entries.filter((e) => !FS.has(e.vehicle))
  if (trackId) entries = entries.filter((e) => e.trackId === trackId)

  entries = [...entries]
    .map((e) => ({
      ...e,
      laps: Math.max(1, Math.min(69, Math.round(Number(e.laps) || 1))),
    }))
    .sort((a, b) => {
      if (board === 'freestyle') {
        if ((b.bestFsScore || 0) !== (a.bestFsScore || 0)) {
          return (b.bestFsScore || 0) - (a.bestFsScore || 0)
        }
        return (b.bestTrickPts || 0) - (a.bestTrickPts || 0)
      }
      if (!(a.bestTimeMs > 0)) return 1
      if (!(b.bestTimeMs > 0)) return -1
      return a.bestTimeMs - b.bestTimeMs
    })
    .slice(0, 80)

  return cors(JSON.stringify({ entries }))
}
