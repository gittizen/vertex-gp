import { getStore } from '@netlify/blobs'

const STORE = 'klec-pace'
const MODEL_KEY = 'model-v1'
const SAMPLES_KEY = 'samples-v1'
const RATE_MS = 25_000
const MAX_SAMPLES = 2000
const MAX_DELTA = 0.05

const DIFF_SCALE = {
  superEasy: 0.56,
  easy: 0.7,
  normal: 1,
  hard: 1.21,
  superHard: 1.694,
}

function cors(res, status = 200) {
  return new Response(res, {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}

function percentile(sorted, p) {
  if (!sorted.length) return 0
  const i = (sorted.length - 1) * p
  const lo = Math.floor(i)
  const hi = Math.ceil(i)
  if (lo === hi) return sorted[lo]
  return sorted[lo] * (hi - i) + sorted[hi] * (i - lo)
}

function robustTimes(times) {
  if (times.length < 4) return [...times].sort((a, b) => a - b)
  const sorted = [...times].sort((a, b) => a - b)
  const q1 = percentile(sorted, 0.25)
  const q3 = percentile(sorted, 0.75)
  const iqr = Math.max(1, q3 - q1)
  const lo = q1 - 1.5 * iqr
  const hi = q3 + 1.5 * iqr
  return sorted.map((v) => Math.min(hi, Math.max(lo, v)))
}

function weightedMedian(rows) {
  if (!rows.length) return 0
  if (rows.length === 1) return rows[0].ms
  const now = Date.now()
  const day = 86_400_000
  const weighted = []
  for (const s of rows) {
    const ageDays = Math.max(0, (now - s.at) / day)
    const w = Math.max(1, Math.round(4 * Math.exp(-ageDays / 21)))
    for (let i = 0; i < w; i++) weighted.push(s.ms)
  }
  const robust = robustTimes(weighted)
  return percentile(robust, 0.5)
}

function rebuild(samples) {
  const streetNorm = new Map()
  for (const s of samples) {
    const scale = DIFF_SCALE[s.difficulty] ?? 1
    const cap = typeof s.capScale === 'number' && s.capScale > 0.05 ? s.capScale : 1
    const tune = typeof s.tuneFactor === 'number' && s.tuneFactor > 0.5 ? s.tuneFactor : 1
    const norm = s.paceMs * scale * cap * tune
    if (!(norm > 500)) continue
    const arr = streetNorm.get(s.trackId) ?? []
    arr.push({ ms: norm, at: s.at || Date.now() })
    streetNorm.set(s.trackId, arr)
  }
  const cells = []
  for (const [trackId, rows] of streetNorm) {
    const times = rows.map((r) => r.ms)
    const robust = robustTimes(times)
    const medianMs = weightedMedian(rows)
    cells.push({
      trackId,
      vehicle: 'street',
      difficulty: 'normal',
      paceMs: Math.round(medianMs),
      sampleCount: rows.length,
      medianMs: Math.round(medianMs),
      p25Ms: Math.round(percentile(robust, 0.25)),
      p75Ms: Math.round(percentile(robust, 0.75)),
      updatedAt: Date.now(),
    })
  }
  return { cells, version: 1, updatedAt: Date.now() }
}

export default async (req) => {
  if (req.method === 'OPTIONS') return cors('{}')
  if (req.method !== 'POST') return cors(JSON.stringify({ ok: false, error: 'method' }), 405)

  try {
    const body = await req.json()
    const sample = body?.sample
    const clientId = String(body?.clientId || 'anon').slice(0, 48)
    if (!sample || typeof sample.paceMs !== 'number' || !sample.trackId) {
      return cors(JSON.stringify({ ok: false, error: 'bad-sample' }), 400)
    }
    if (!(sample.paceMs > 500) || !(sample.finishTimeMs > 500)) {
      return cors(JSON.stringify({ ok: false, error: 'pace' }), 400)
    }
    if (sample.vehicle === 'scooter') {
      return cors(JSON.stringify({ ok: false, error: 'scooter' }), 400)
    }

    const store = getStore(STORE)
    const pack = (await store.get(SAMPLES_KEY, { type: 'json' })) || { samples: [], rates: {} }
    const samples = Array.isArray(pack.samples) ? pack.samples : []
    const rates = pack.rates && typeof pack.rates === 'object' ? pack.rates : {}

    const rateKey = `${clientId}|${sample.trackId}`
    const last = Number(rates[rateKey] || 0)
    const now = Date.now()
    if (now - last < RATE_MS) {
      return cors(JSON.stringify({ ok: false, error: 'rate' }), 429)
    }
    rates[rateKey] = now

    const id = sample.id || `${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`
    if (samples.some((s) => s.id === id)) {
      return cors(JSON.stringify({ ok: true, added: 0 }))
    }

    samples.push({
      id,
      trackId: String(sample.trackId).slice(0, 64),
      vehicle: sample.vehicle || 'street',
      difficulty: sample.difficulty || 'normal',
      paceMs: sample.paceMs,
      finishTimeMs: sample.finishTimeMs || sample.paceMs,
      tuneFactor: sample.tuneFactor ?? 1,
      capScale: sample.capScale ?? 1,
      at: sample.at || now,
      clientId,
    })
    while (samples.length > MAX_SAMPLES) samples.shift()

    let model = rebuild(samples)
    const prev = (await store.get(MODEL_KEY, { type: 'json' })) || { cells: [] }
    // Clamp Δ vs předchozí cloud model (±5 %)
    if (Array.isArray(prev.cells)) {
      model = {
        ...model,
        cells: model.cells.map((c) => {
          const old = prev.cells.find((x) => x.trackId === c.trackId && x.vehicle === 'street')
          if (!old || !(old.paceMs > 800) || !(c.paceMs > 800)) return c
          const lo = old.paceMs * (1 - MAX_DELTA)
          const hi = old.paceMs * (1 + MAX_DELTA)
          const paced = Math.min(hi, Math.max(lo, c.paceMs))
          return { ...c, paceMs: Math.round(paced), medianMs: Math.round(paced) }
        }),
      }
    }

    await store.setJSON(SAMPLES_KEY, { samples, rates })
    await store.setJSON(MODEL_KEY, model)
    return cors(JSON.stringify({ ok: true, added: 1, cells: model.cells.length }))
  } catch (e) {
    return cors(JSON.stringify({ ok: false, error: String(e) }), 500)
  }
}
