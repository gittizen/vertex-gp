import type { RecordEntry } from './Records'

const INGEST = '/.netlify/functions/records-ingest'
const LIST = '/.netlify/functions/records-list'

export type CloudRecordRow = {
  player: string
  trackId: string
  vehicle: string
  bestTimeMs: number
  bestFsScore: number
  bestTrickPts: number
  laps?: number
  at: number
  immortal?: boolean
}

function payloadFromEntry(entry: RecordEntry) {
  return {
    player: entry.player,
    trackId: entry.trackId,
    vehicle: entry.vehicle,
    bestTimeMs: entry.bestTimeMs,
    bestFsScore: entry.bestFsScore,
    bestTrickPts: entry.bestTrickPts,
    laps: Math.max(1, Math.min(69, Math.round(entry.laps || 1))),
    at: entry.at,
    immortal: !!entry.immortal,
  }
}

/** Pošli lokální rekord na světový žebříček (fire-and-forget). */
export async function pushCloudRecord(entry: RecordEntry): Promise<void> {
  try {
    await fetch(INGEST, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payloadFromEntry(entry)),
    })
  } catch {
    /* offline / local dev bez functions */
  }
}

/**
 * Sync lokálních rekordů do cloudu — s odstupem (rate limit ingestu).
 * Max ~8 záznamů, nejnovější první.
 */
export async function syncLocalRecordsToCloud(entries: RecordEntry[]): Promise<void> {
  const list = [...entries].sort((a, b) => b.at - a.at).slice(0, 8)
  for (let i = 0; i < list.length; i++) {
    const e = list[i]!
    try {
      await pushCloudRecord(e)
    } catch {
      /* ignore */
    }
    if (i < list.length - 1) {
      await new Promise((r) => setTimeout(r, 8500))
    }
  }
}

/** Načti světové rekordy (merge s lokálními v UI). */
export async function fetchCloudRecords(opts?: {
  trackId?: string
  board?: 'race' | 'freestyle'
}): Promise<CloudRecordRow[]> {
  try {
    const q = new URLSearchParams()
    if (opts?.trackId) q.set('trackId', opts.trackId)
    if (opts?.board) q.set('board', opts.board)
    const res = await fetch(`${LIST}?${q.toString()}`)
    if (!res.ok) return []
    const data = (await res.json()) as { entries?: CloudRecordRow[] }
    return Array.isArray(data.entries) ? data.entries : []
  } catch {
    return []
  }
}
