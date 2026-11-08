import fs from 'node:fs'
import path from 'node:path'
import { defineConfig, type Plugin } from 'vite'

/** Dev ingest: pace-cal.json + community-learn.json do workspace. */
function paceIngestPlugin(): Plugin {
  return {
    name: 'klec-pace-ingest',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const isPace = req.url === '/__klec-pace' && req.method === 'POST'
        const isCommunity = req.url === '/__klec-community' && req.method === 'POST'
        if (!isPace && !isCommunity) {
          next()
          return
        }
        const chunks: Buffer[] = []
        req.on('data', (c) => chunks.push(c))
        req.on('end', () => {
          try {
            const raw = Buffer.concat(chunks).toString('utf8')
            const file = isCommunity ? 'community-learn.json' : 'pace-cal.json'
            const out = path.resolve(__dirname, file)
            fs.writeFileSync(out, raw, 'utf8')
            res.statusCode = 200
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ ok: true, bytes: raw.length, file }))
          } catch (e) {
            res.statusCode = 500
            res.end(JSON.stringify({ ok: false, error: String(e) }))
          }
        })
      })
    },
  }
}

export default defineConfig({
  // Root host (Netlify / Cloudflare / vlastní doména). GH Pages: VITE_BASE=/vertex-gp/
  base: process.env.VITE_BASE || '/',
  server: {
    port: 5173,
    open: true,
  },
  plugins: [paceIngestPlugin()],
})
