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
  at: number
  immortal?: boolean
}

/** Pošli lokální rekord na světový žebříček (fire-and-forget). */
export async function pushCloudRecord(entry: RecordEntry): Promise<void> {
  try {
    await fetch(INGEST, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        player: entry.player,
        trackId: entry.trackId,
        vehicle: entry.vehicle,
        bestTimeMs: entry.bestTimeMs,
        bestFsScore: entry.bestFsScore,
        bestTrickPts: entry.bestTrickPts,
        at: entry.at,
        immortal: !!entry.immortal,
      }),
    })
  } catch {
    /* offline / local dev bez functions */
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
