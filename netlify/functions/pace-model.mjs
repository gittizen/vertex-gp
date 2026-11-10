import { getStore } from '@netlify/blobs'

const STORE = 'klec-pace'
const MODEL_KEY = 'model-v1'

export default async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('{}', {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    })
  }
  try {
    const store = getStore(STORE)
    const raw = await store.get(MODEL_KEY, { type: 'json' })
    const model =
      raw && Array.isArray(raw.cells) ? raw : { cells: [], version: 1, updatedAt: 0 }
    return new Response(JSON.stringify(model), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
      },
    })
  } catch (e) {
    return new Response(JSON.stringify({ cells: [], version: 1, error: String(e) }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
}
