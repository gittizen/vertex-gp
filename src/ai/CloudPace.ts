import type { CommunityRaceSample, LearnedPaceModel } from './CommunityLearning'

const MODEL_URL = '/.netlify/functions/pace-model'
const INGEST_URL = '/.netlify/functions/pace-ingest'

/** Stažení sdíleného modelu (offline → null). */
export async function pullCloudPaceModel(): Promise<LearnedPaceModel | null> {
  try {
    const res = await fetch(MODEL_URL, { method: 'GET', cache: 'no-store' })
    if (!res.ok) return null
    const data = (await res.json()) as LearnedPaceModel
    if (!data || !Array.isArray(data.cells)) return null
    return { cells: data.cells, version: 1 }
  } catch {
    return null
  }
}

/** Upload jednoho samplu (anti-spam na serveru). */
export async function pushCloudPaceSample(
  sample: CommunityRaceSample,
  clientId: string,
): Promise<boolean> {
  try {
    const res = await fetch(INGEST_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sample, clientId }),
    })
    return res.ok
  } catch {
    return false
  }
}
